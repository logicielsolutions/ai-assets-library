"""The memory module: remember, recall and forget, on Zep Cloud, one memory per user.

    from agent_memory import Memory
    mem = Memory(owner="Aara, the hotel assistant")
    mem.remember("g01", "conv-123", messages, date="2026-06-03")
    facts = mem.recall("g01", "what's my diet?", as_of="2026-09-01")
    mem.forget_conversation("g01", "conv-123")

Every write goes through the write rules (rules.Screen) first. Every stored conversation
carries its source (user, date, conversation id) as episode metadata, and sources(fact)
lists the conversations a recalled fact came from.
"""
import os
import time
from dataclasses import dataclass, field

from .rules import Screen


@dataclass
class Fact:
    text: str
    valid_from: str = ""
    valid_to: str = ""          # set when a newer fact replaced this one
    episodes: list = field(default_factory=list)  # stored conversations it came from; Memory.sources() resolves them

    def line(self):
        if self.valid_to:
            return f"[{self.valid_from or '?'} to {self.valid_to}, no longer true] {self.text}"
        return f"[{self.valid_from or '?'}] {self.text}"


class Memory:
    def __init__(self, owner="the assistant", namespace="mem", zep_api_key=None,
                 screen=None, k=10, wait=True):
        from zep_cloud.client import Zep
        self.z = Zep(api_key=zep_api_key or os.environ["ZEP_API_KEY"])
        self.ns = namespace
        self.k = k
        self.wait = wait
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
        """Screen, then store one conversation. Returns the screen's changes (what was removed)."""
        kept, changes = self.screen(messages)
        if not kept:
            return changes
        text = "\n".join(f"{m['role']}: {m['text']}" for m in kept)
        source = {"user": user, "conversation": conversation, "date": date}
        g = self._graph(user)
        ep = self.z.graph.episode.add(g, data=text, type="message", reference_time=f"{date}T12:00:00Z",
                                      source_description=f"conversation {conversation}", metadata=source)
        self._episodes[ep.episode.uuid_] = source
        if self.wait:
            self._wait(g, ep.episode.uuid_)
        return changes

    def _wait(self, graph, episode, timeout=600):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.z.graph.episode.get(graph, episode).processed:
                return
            time.sleep(3)
        raise TimeoutError(f"episode {episode} unprocessed after {timeout}s")

    # ---- read ------------------------------------------------------------
    def recall(self, user, query, as_of=None):
        """Facts relevant to the query, as they stood on `as_of` (YYYY-MM-DD). Newest-first is Zep's ranking."""
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
            facts.append(Fact(e.fact, start, end, list(e.episode_uuids or [])))
            if len(facts) == self.k:
                break
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
