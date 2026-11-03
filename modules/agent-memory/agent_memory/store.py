"""The memory module: remember, recall and forget, on Zep Cloud, one memory per user.

    from agent_memory import Memory
    mem = Memory(owner="Aara, the hotel assistant")
    mem.remember("g01", "conv-123", messages, date="2026-06-03")
    facts = mem.recall("g01", "what's my diet?", as_of="2026-09-01")
    mem.forget_conversation("g01", "conv-123")
    mem.clean_up("g01", today="2026-11-03")

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

_DATED = re.compile(r"\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}/\d{1,2}\b", re.I)

EXPIRY_PROMPT = """These facts were just saved from a hotel or workplace assistant's chat dated {date}.
For each one, decide whether it is a ONE-OFF arrangement made for one specific upcoming or current
stay, trip, event or leave (a room request for that trip, an extra bed, a cake, a late checkout, an
airport pickup, the booking itself, a leave request) or a LASTING fact.
LASTING: preferences and needs that apply to every stay (a pet-friendly room, a quiet floor),
diet, habits, contact details, personal details, policies, and anything that already happened
(past events, feedback, complaints, compensation, what someone liked).
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

    def line(self):
        if self.valid_to:
            return f"[{self.valid_from or '?'} to {self.valid_to}, no longer true] {self.text}"
        if self.ended:
            return f"[{self.valid_from or '?'}, one-off, over since {self.ended}] {self.text}"
        return f"[{self.valid_from or '?'}] {self.text}"


class Memory:
    def __init__(self, owner="the assistant", namespace="mem", zep_api_key=None,
                 screen=None, k=10, wait=True, expiry=True):
        from zep_cloud.client import Zep
        self.z = Zep(api_key=zep_api_key or os.environ["ZEP_API_KEY"])
        self.ns = namespace
        self.k = k
        self.wait = wait
        self.expiry = expiry
        self.screen = screen or Screen(owner=owner)
        self._graphs = {}
        self._episodes = {}   # episode uuid -> source metadata (filled lazily)

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

    def _wait(self, graph, episode, timeout=600):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.z.graph.episode.get(graph, episode).processed:
                return
            time.sleep(3)
        raise TimeoutError(f"episode {episode} unprocessed after {timeout}s")

    # ---- read ------------------------------------------------------------
    def recall(self, user, query, as_of=None):
        """The k facts most relevant to the query, as they stood on `as_of` (YYYY-MM-DD).

        Zep picks the facts by relevance; they come back oldest first, so a change of plan
        or a date sequence reads in the order it happened (+2.6/80 on the test bench)."""
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
            facts.append(Fact(e.fact, start, end, list(e.episode_uuids or []), ended))
            if len(facts) == self.k:
                break
        return sorted(facts, key=lambda f: f.valid_from or "0000")

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
        # what lets the assistant say why the card is gone.
        mine = lambda e: keep_episode and keep_episode in (e.episode_uuids or [])
        edges = [e for e in self.z.graph.edge.list(g, page_size=100) if not mine(e)]   # all facts, so "picked" is complete
        listing = "\n".join(f"{i}. {e.fact}" for i, e in enumerate(edges)) or "(none)"
        out = self.screen.ask_json(FORGET_PROMPT.format(request=request, about=about, facts=listing))
        picked = {i for i in out.get("facts") or [] if isinstance(i, int) and 0 <= i < len(edges)}
        others = [e for i, e in enumerate(edges) if i not in picked]
        details = set()
        for d in (out.get("details") or []) + list(remove):
            if not isinstance(d, str) or len(d.strip()) < 3:
                continue
            p = _span_pattern(d.strip())
            # code guard: a detail is only scrubbed everywhere if every fact that mentions it is about
            # the thing being forgotten; "Neha" the manager or "Jasleen" the travel companion stay
            if not any(p.search(e.fact) for e in others):
                details.add(d.strip())
        pats = [_span_pattern(d) for d in details]
        rewritten = 0
        for ep in list(self.z.graph.episode.list(g, page_size=100)):
            meta = dict(ep.metadata or {})
            if before and meta.get("conversation") == before:
                continue   # the request's own conversation was already screened
            text = ep.content or ""
            new = text
            for p in pats:
                new = p.sub("[removed]", new)
            if new != text:
                self.z.graph.episode.delete(g, ep.uuid_)
                src = {"user": meta.get("user", user), "conversation": meta.get("conversation", "?"),
                       "date": meta.get("date") or str(ep.reference_time or "")[:10]}
                uuid = self._add(user, new, src)
                if self.expiry and self.wait:
                    self._set_expiry(user, uuid, src["date"])
                rewritten += 1
        gone = 0
        for e in [edges[i] for i in sorted(picked)]:
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
        out = self.screen.ask_json(EXPIRY_PROMPT.format(date=date, facts=listing))
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
