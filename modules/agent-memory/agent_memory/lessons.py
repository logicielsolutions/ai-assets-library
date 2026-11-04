"""Lessons: things learned that apply to every user, kept only once a person approves them.

A user's chat never changes what the assistant tells everyone. A lesson ("the Goa hotel offers
airport pickup", "most refund questions are about annual plans") goes through three steps:

    lesson = mem.lessons.propose("Goa offers airport pickup for 1,500", by="front desk")
    mem.lessons.approve(lesson["id"], by="Ritu")      # or deny(id, by, reason)
    mem.recall(user, "can I get a pickup in Goa?")    # approved lessons come back, labelled

Proposals wait in a small JSON file (one per namespace). `notify` is called with each new
proposal, so a Slack bot can post it with approve and deny buttons and call approve()/deny().
Approved lessons are stored in their own Zep graph, shared by all users, and deny or retire
leaves nothing behind there.
"""
import datetime as dt
import json
import threading
import uuid
from pathlib import Path

LESSONS_USER = "_lessons"   # the Zep user that holds approved lessons for the namespace


class Lessons:
    def __init__(self, mem, path=None, notify=None, k=3):
        self.mem = mem
        self.path = Path(path or Path(".agent_memory") / f"{mem.ns}-lessons.json")
        self.notify = notify
        self.k = k
        self._lock = threading.Lock()

    # ---- the queue -------------------------------------------------------
    def _load(self):
        try:
            return json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def _save(self, items):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(items, indent=1))

    def propose(self, text, by="assistant", source=None):
        """Queue a lesson for approval. The same text proposed twice is one proposal."""
        with self._lock:
            items = self._load()
            same = next((x for x in items if x["text"].strip().lower() == text.strip().lower()
                         and x["status"] in ("pending", "approved")), None)
            if same:
                return same
            lesson = {"id": uuid.uuid4().hex[:8], "text": text.strip(), "by": by, "source": source or {},
                      "status": "pending", "proposed": dt.date.today().isoformat()}
            items.append(lesson)
            self._save(items)
        if self.notify:
            self.notify(lesson)
        return lesson

    def pending(self):
        return [x for x in self._load() if x["status"] == "pending"]

    def approved(self):
        return [x for x in self._load() if x["status"] == "approved"]

    def all(self):
        return self._load()

    def _decide(self, lesson_id, status, by, reason=""):
        with self._lock:
            items = self._load()
            lesson = next((x for x in items if x["id"] == lesson_id), None)
            if not lesson:
                raise KeyError(lesson_id)
            lesson.update(status=status, decided_by=by, decided=dt.date.today().isoformat(), reason=reason)
            self._save(items)
        return lesson

    # ---- decisions -------------------------------------------------------
    def approve(self, lesson_id, by, date=None):
        """Store the lesson where every user's recall can find it."""
        lesson = next((x for x in self._load() if x["id"] == lesson_id), None)
        if not lesson:
            raise KeyError(lesson_id)
        if lesson["status"] != "approved":
            date = date or dt.date.today().isoformat()
            self.mem._add(LESSONS_USER, lesson["text"],
                          {"user": LESSONS_USER, "conversation": f"lesson-{lesson_id}", "date": date})
        return self._decide(lesson_id, "approved", by)

    def deny(self, lesson_id, by, reason=""):
        return self._decide(lesson_id, "denied", by, reason)

    def retire(self, lesson_id, by, reason=""):
        """Withdraw an approved lesson: it leaves the shared memory, the record stays in the queue."""
        self.mem.forget_conversation(LESSONS_USER, f"lesson-{lesson_id}")
        return self._decide(lesson_id, "retired", by, reason)

    # ---- read ------------------------------------------------------------
    def recall(self, query):
        from .store import Fact
        g = self.mem._graph(LESSONS_USER)
        edges = self.mem.z.graph.search_edges(g, query=query[:400], page_size=self.k)
        return [Fact(e.fact, str(e.created_at or "")[:10], uuid=e.uuid_, lesson=True) for e in edges]
