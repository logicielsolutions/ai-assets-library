"""The memory module: remember, recall and forget, on Zep Cloud, one memory per user.

    from agent_memory import Memory
    mem = Memory(owner="Aara, the hotel assistant")
    mem.remember("g01", "conv-123", messages, date="2026-06-03")
    facts = mem.recall("g01", "what's my diet?", as_of="2026-09-01")
    mem.forget_conversation("g01", "conv-123")
    mem.clean_up("g01", today="2026-11-03")
    mem.trace("g01", "checkout is 4pm")        # which chat a memory came from
    mem.lessons.propose("Goa offers airport pickup for 1,500")   # waits for a person to approve

Every write goes through the write rules (rules.Screen) first. Every stored conversation
carries its source (user, date, conversation id) as episode metadata, and sources(fact)
lists the conversations a recalled fact came from.

Updates: Zep marks a replaced fact with an end date; recall shows it as "no longer true".
Forget: when a user asks to forget something, the matching facts are deleted and every earlier
conversation that mentions the detail is stored again without it.
Expiry: one-off arrangements (a room request for one trip, a cake, a late checkout) get an end
date when stored; recall labels them once past, and clean_up() deletes them after a grace period.
"""
import datetime as dt
import os
import re
import time
from dataclasses import dataclass, field

from . import policy as _policy
from .rules import Screen, _span_pattern

FORGET_PROMPT = """A user asked an assistant to forget something. Their request: "{request}"
(What they want forgotten, in short: {about})

Facts currently in the assistant's memory about this user:
{facts}

Return JSON: {{"facts": [<numbers of EVERY fact about what the user wants forgotten: the detail itself,
plans, requests and arrangements about it, and the assistant's confirmations of them>],
"details": [<the specific values that give the forgotten thing away, each as short as possible:
the allergen alone ("cashew", not "cashew allergy"), a name alone ("Vikram"), a number, a company
name, a cake message, the key words of a complaint. Copy them exactly from the facts or the request.>]}}
Only include facts about the thing to forget. Never list common words (allergy, phone, number, room,
dinner, passport), time words (last month), the user's own name, or names of people who also appear
in other facts for other reasons (a manager, a travel companion)."""

SPANS_PROMPT = """A user asked an assistant to forget something. Their request: "{request}"
(What they want forgotten, in short: {about})

Below is one earlier chat from the assistant's records. List every word or phrase in it that gives the
forgotten thing away: the value itself (a number, a name of the thing, an allergen, a company, a message,
the key words of a complaint), copied exactly as written, each as short as possible.
Never list common words (allergy, phone, number, room, dinner, card), time words, the user's own name,
or names of people the chat mentions for other reasons. Return {{"spans": []}} if the chat doesn't mention it.

CHAT:
{chat}

Return JSON: {{"spans": ["<exact text>", ...]}}"""

_DATED = re.compile(r"\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}/\d{1,2}\b", re.I)

EXPIRY_PROMPT = """These facts were just saved from {owner}'s chat with a user, dated {date}.
For each one, decide whether it is a ONE-OFF arrangement tied to one specific upcoming or current
date or event (for this product, e.g. {one_off}) or a LASTING fact.
LASTING: preferences and needs that apply every time, diet, habits, contact details, personal
details, policies, and anything that already happened (past events, feedback, complaints,
compensation, what someone liked).
For one-off ones give the last date it matters (checkout, event or end date) as YYYY-MM-DD.
When in doubt, it is LASTING.

{facts}

Return JSON: {{"one_off": [{{"n": <fact number>, "until": "YYYY-MM-DD"}}, ...]}}"""


@dataclass
class Fact:
    text: str
    valid_from: str = ""
    valid_to: str = ""          # set when a newer fact replaced this one
    episodes: list = field(default_factory=list)  # stored conversations it came from; Memory.sources() resolves them
    ended: str = ""             # a one-off arrangement whose date had passed on the recall date
    uuid: str = ""              # Zep's id for the fact, for trace() and remove_fact()
    lesson: bool = False        # an approved lesson that applies to every user (lessons.py)

    def line(self):
        if self.lesson:
            return f"[lesson for everyone, approved {self.valid_from or '?'}] {self.text}"
        if self.valid_to:
            return f"[{self.valid_from or '?'} to {self.valid_to}, no longer true] {self.text}"
        if self.ended:
            return f"[{self.valid_from or '?'}, one-off, over since {self.ended}] {self.text}"
        return f"[{self.valid_from or '?'}] {self.text}"


class Memory:
    def __init__(self, owner="the assistant", namespace="mem", zep_api_key=None,
                 screen=None, k=10, wait=True, expiry=True, policy=None,
                 lessons_path=None, notify=None, claims_to_lessons=False):
        from zep_cloud.client import Zep
        self.z = Zep(api_key=zep_api_key or os.environ["ZEP_API_KEY"])
        self.ns = namespace
        self.k = k
        self.wait = wait
        self.expiry = expiry
        self.screen = screen or Screen(owner=owner, policy=policy)
        self.owner = owner
        self.policy = self.screen.policy
        self._graphs = {}
        self._episodes = {}   # episode uuid -> source metadata (filled lazily)
        from .lessons import Lessons
        self.lessons = Lessons(self, lessons_path, notify=notify)
        self.claims_to_lessons = claims_to_lessons

    # ---- ids -------------------------------------------------------------
    def _graph(self, user):
        uid = f"{self.ns}-{user}"
        if uid not in self._graphs:
            try:
                u = self.z.user.lookup(user_id=uid)
            except Exception:
                u = self.z.user.create(user_id=uid)
            self._graphs[uid] = u.graph_uuid
        return self._graphs[uid]

    # ---- write -----------------------------------------------------------
    def remember(self, user, conversation, messages, date):
        """Screen, then store one conversation, then act on any forget requests in it.
        Returns the screen's changes; forget changes also carry what was deleted."""
        kept, changes = self.screen(messages)
        uuid = None
        if kept:
            text = "\n".join(f"{m['role']}: {m['text']}" for m in kept)
            uuid = self._add(user, text, {"user": user, "conversation": conversation, "date": date})
            if self.expiry and self.wait:
                self._set_expiry(user, uuid, date)
        for c in changes:
            if self.claims_to_lessons and (c["action"] == "drop" or c.get("partial")):
                # a user's claim about everyone is never stored as theirs; staff can still check it
                claim = " ".join(c.get("remove") or []) if c.get("partial") else messages[c["line"]]["text"]
                c["lesson"] = self.lessons.propose(claim, by=f"user {user}",
                                                   source={"user": user, "conversation": conversation, "date": date})["id"]
            if c["action"] == "forget":
                c["done"] = self.forget(user, c["about"], messages[c["line"]]["text"],
                                        c.get("remove") or [], before=conversation, keep_episode=uuid)
        return changes

    def _add(self, user, text, source):
        g = self._graph(user)
        ep = self.z.graph.episode.add(g, data=text, type="message", reference_time=f"{source['date']}T12:00:00Z",
                                      source_description=f"conversation {source['conversation']}", metadata=source)
        self._episodes[ep.episode.uuid_] = source
        if self.wait:
            self._wait(g, ep.episode.uuid_)
        return ep.episode.uuid_

    def _wait_gone(self, graph, episode, timeout=120):
        """Wait until a deleted episode's facts are gone, so a re-added copy isn't merged into them."""
        from zep_cloud.types import EdgeListFilters
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                left = list(self.z.graph.edge.list(graph, page_size=5, filters=EdgeListFilters(episode_uuids=[episode])))
            except Exception:
                left = []
            if not left:
                return
            time.sleep(2)

    def _wait(self, graph, episode, timeout=600):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.z.graph.episode.get(graph, episode).processed:
                return
            time.sleep(3)
        raise TimeoutError(f"episode {episode} unprocessed after {timeout}s")

    # ---- read ------------------------------------------------------------
    def recall(self, user, query, as_of=None, lessons=True):
        """The k facts most relevant to the query, as they stood on `as_of` (YYYY-MM-DD).

        Zep picks the facts by relevance; they come back oldest first, so a change of plan
        or a date sequence reads in the order it happened (+2.6/80 on the test bench).
        Approved lessons that match the query are added at the end (lessons=False skips them)."""
        g = self._graph(user)
        edges = self.z.graph.search_edges(g, query=query[:400], page_size=self.k * 2)
        facts = []
        for e in edges:
            start = str(e.valid_at or "")[:10]
            if as_of and start and start > as_of:
                continue
            end = str(e.invalid_at or "")[:10]
            if end and as_of and end > as_of:
                end = ""   # it was still true on as_of
            until = str((e.attributes or {}).get("expires") or "")[:10]
            ended = until if until and as_of and until < as_of and not end else ""
            facts.append(Fact(e.fact, start, end, list(e.episode_uuids or []), ended, e.uuid_))
            if len(facts) == self.k:
                break
        facts = sorted(facts, key=lambda f: f.valid_from or "0000")
        if lessons and self.lessons.approved():
            facts += self.lessons.recall(query)
        return facts

    def sources(self, user, fact):
        """Where a fact came from: [{"user", "conversation", "date"}], one per stored conversation."""
        g = self._graph(user)
        return [self._source(g, ep) for ep in fact.episodes]

    def _source(self, graph, episode):
        if episode not in self._episodes:
            try:
                self._episodes[episode] = dict(self.z.graph.episode.get(graph, episode).metadata or {})
            except Exception:
                self._episodes[episode] = {}
        return self._episodes[episode]

    # ---- trace -----------------------------------------------------------
    def trace(self, user, text, k=3):
        """Where a (possibly wrong) memory came from. `text` is a fact as recalled, or a few words
        about it. Returns the closest facts, each with the stored chats behind it and the lines in
        those chats that share words with the fact:
        [{"fact", "uuid", "date", "sources": [{"conversation", "episode", "date", "lines"}]}]"""
        g = self._graph(user)
        return [self._trace(g, e) for e in self.z.graph.search_edges(g, query=text[:400], page_size=k)]

    def trace_fact(self, user, fact_uuid):
        """The same, for one fact by its id (Fact.uuid)."""
        g = self._graph(user)
        return self._trace(g, self.z.graph.edge.get(g, fact_uuid))

    def _trace(self, g, e):
        words = set(re.findall(r"[a-z0-9]{4,}", e.fact.lower()))
        sources = []
        for ep_id in e.episode_uuids or []:
            try:
                ep = self.z.graph.episode.get(g, ep_id)
            except Exception:
                continue   # the chat was deleted since
            meta = dict(ep.metadata or {})
            chat = (ep.content or "").split("\n")
            lines = [l for l in chat if len(words & set(re.findall(r"[a-z0-9]{4,}", l.lower()))) >= 2] or chat[:2]
            sources.append({"conversation": meta.get("conversation", "?"), "episode": ep_id,
                            "date": meta.get("date") or str(ep.reference_time or "")[:10], "lines": lines[:4]})
        return {"fact": e.fact, "uuid": e.uuid_, "date": str(e.valid_at or "")[:10], "sources": sources}

    def remove_fact(self, user, fact_uuid):
        """Delete one fact. Its source chat stays; use forget_conversation() to drop the chat too."""
        self.z.graph.edge.delete(self._graph(user), fact_uuid)

    # ---- forget ----------------------------------------------------------
    def forget_conversation(self, user, conversation):
        """Delete every stored episode from one conversation (and the facts Zep built from it)."""
        g = self._graph(user)
        gone = 0
        for ep in self.z.graph.episode.list(g, page_size=100):
            if (ep.metadata or {}).get("conversation") == conversation:
                self.z.graph.episode.delete(g, ep.uuid_)
                gone += 1
        return gone

    def forget(self, user, about, request, remove=(), before=None, keep_episode=None):
        """Act on "forget X": delete the facts about X, and store every earlier conversation that
        mentions it again without the detail. Returns counts, never the detail itself."""
        g = self._graph(user)
        # The request's own conversation stays: "asked to delete the card, will pay at check-in" is
        # what lets the assistant say why the card is gone. Zep also links older facts to the request
        # chat when it mentions them ("the phone number I gave you"), so only facts built from the
        # request chat alone are left out of the list.
        only_mine = lambda e: bool(keep_episode) and list(e.episode_uuids or []) == [keep_episode]
        edges = [e for e in self.z.graph.edge.list(g, page_size=100) if not only_mine(e)]   # all facts, so "picked" is complete
        listing = "\n".join(f"{i}. {e.fact}" for i, e in enumerate(edges)) or "(none)"
        out = self.screen.ask_json(FORGET_PROMPT.format(request=request, about=about, facts=listing))
        picked = {i for i in out.get("facts") or [] if isinstance(i, int) and 0 <= i < len(edges)}
        # facts linked to the request chat mention the thing being forgotten, so they don't protect a word
        others = [e for i, e in enumerate(edges) if i not in picked and keep_episode not in (e.episode_uuids or [])]
        # second pass over the stored chats themselves, one call per chat, the request chat included:
        # the fact list misses values Zep never turned into a fact, and one call misses some
        episodes = list(self.z.graph.episode.list(g, page_size=100))
        found = list(out.get("details") or []) + list(remove)
        named = set()   # details named in the request chat itself: that chat is about forgetting them
        for ep in episodes:
            if not ep.content:
                continue
            spans = self.screen.ask_json(SPANS_PROMPT.format(request=request, about=about, chat=ep.content)).get("spans")
            spans = [x.strip() for x in spans or [] if isinstance(x, str) and x.lower() in ep.content.lower()]
            found += spans
            if ep.uuid_ == keep_episode:
                named.update(spans)
        details = set()
        for d in found:
            if not isinstance(d, str) or len(d.strip()) < 3:
                continue
            p = _span_pattern(d.strip())
            # code guard: a word is only scrubbed everywhere if every fact that mentions it is about the
            # thing being forgotten; "Neha" the manager or "Jasleen" the travel companion stay. Numbers
            # (5+ digits) identify one thing only, and words named in the request chat are the target.
            if sum(c.isdigit() for c in d) >= 5 or d.strip() in named or not any(p.search(e.fact) for e in others):
                details.add(d.strip())
        pats = [_span_pattern(d) for d in details]
        # code guard on the picker: a picked fact is only deleted if it names a detail or shares a word
        # with the request; a wrong index from the model must not delete an unrelated fact
        asked = set(re.findall(r"[a-z]{4,}", f"{about} {request}".lower())) - {"forget", "please", "that", "this", "with", "from", "about", "what", "want", "dont", "don't", "saved", "anywhere", "mentioned", "last", "week", "month", "thing", "everything"}
        picked = {i for i in picked if any(p.search(edges[i].fact) for p in pats)
                  or asked & set(re.findall(r"[a-z]{4,}", edges[i].fact.lower()))}
        rewritten, fresh, request_copy = 0, [], None
        for ep in episodes:
            meta = dict(ep.metadata or {})
            text = ep.content or ""
            new = text
            for p in pats:
                new = p.sub("[removed]", new)
            if new != text:
                self.z.graph.episode.delete(g, ep.uuid_)
                self._wait_gone(g, ep.uuid_)   # deletion runs in the background; re-adding before it ends loses facts
                src = {"user": meta.get("user", user), "conversation": meta.get("conversation", "?"),
                       "date": meta.get("date") or str(ep.reference_time or "")[:10]}
                uuid = self._add(user, new, src)
                if ep.uuid_ == keep_episode:
                    request_copy = uuid   # its "asked to forget [removed]" facts are the record, they stay
                else:
                    fresh.append(uuid)
                if self.expiry and self.wait:
                    self._set_expiry(user, uuid, src["date"])
                rewritten += ep.uuid_ != keep_episode
        gone = 0
        # facts Zep rebuilt from the cleaned chats that only say "allergic to [removed]" carry nothing useful
        from zep_cloud.types import EdgeListFilters
        rebuilt = list(self.z.graph.edge.list(g, page_size=100, filters=EdgeListFilters(episode_uuids=fresh))) if fresh else []
        # and any fact still naming a scrubbed detail, wherever Zep attached it
        left = [e for e in self.z.graph.edge.list(g, page_size=100) if any(p.search(e.fact) for p in pats)]
        doomed = {e.uuid_: e for e in [edges[i] for i in sorted(picked)] + left + [e for e in rebuilt if "[removed]" in e.fact]}
        for e in doomed.values():
            if request_copy and request_copy in (e.episode_uuids or []) and "[removed]" in e.fact:
                continue
            try:
                self.z.graph.edge.delete(g, e.uuid_)
                gone += 1
            except Exception:
                pass   # already removed with its conversation
        return {"facts_deleted": gone, "conversations_rewritten": rewritten}

    # ---- expiry ----------------------------------------------------------
    def _set_expiry(self, user, episode, date):
        """Tag one-off arrangements from a newly stored conversation with the date they stop mattering."""
        from zep_cloud.types import EdgeListFilters
        g = self._graph(user)
        try:
            edges = list(self.z.graph.edge.list(g, page_size=50, filters=EdgeListFilters(episode_uuids=[episode])))
        except Exception:
            return 0
        if not edges:
            return 0
        listing = "\n".join(f"{i}. {e.fact}" for i, e in enumerate(edges))
        out = self.screen.ask_json(EXPIRY_PROMPT.format(owner=self.owner, date=date, facts=listing,
                                                        one_off=self.policy.one_off))
        tagged = 0
        for item in out.get("one_off") or []:
            i, until = item.get("n"), str(item.get("until") or "")
            # code guard: a one-off has to name its date; "owns a beagle" or "liked the room" never expire
            if (isinstance(i, int) and 0 <= i < len(edges) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", until)
                    and _DATED.search(edges[i].fact) and until >= date):
                self.z.graph.edge.update(g, edges[i].uuid_, attributes={**(edges[i].attributes or {}), "expires": until})
                tagged += 1
        return tagged

    def clean_up(self, user, today=None, keep_days=30, dry_run=False):
        """The daily clean-up: delete one-off facts that ended more than keep_days ago.
        dry_run=True only counts them."""
        g = self._graph(user)
        today = today or dt.date.today().isoformat()
        cutoff = (dt.date.fromisoformat(today) - dt.timedelta(days=keep_days)).isoformat()
        gone = 0
        for e in self.z.graph.edge.list(g, page_size=100):
            until = str((e.attributes or {}).get("expires") or "")[:10]
            if until and until < cutoff:
                if not dry_run:
                    self.z.graph.edge.delete(g, e.uuid_)
                gone += 1
        return gone
