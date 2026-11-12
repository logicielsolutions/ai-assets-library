"""Write rules and recall without OpenAI or Zep: a stub model and a fake Zep client.
    python -m pytest tests"""
import json
import re
import sys
import types
from types import SimpleNamespace as NS

import pytest

from agent_memory.rules import FORGET_RE, Screen, _freeze, _span_pattern, _thaw, regex_scrub


# ---- regex backstop -------------------------------------------------------
@pytest.mark.parametrize("text, gone", [
    ("card 4111 1111 1111 1111 please", "4111"),
    ("aadhaar 5234 8765 1234", "5234"),
    ("aadhaar 523487651234", "523487651234"),
    ("aadhaar 5234-8765-1234", "5234-8765"),
    ("my passport is Z1234567", "Z1234567"),
    ("passport no j1234567", "j1234567"),
    ("पासपोर्ट नंबर Z1234567", "Z1234567"),
    ("cvv 123", "123"),
])
def test_scrub_removes(text, gone):
    assert gone not in regex_scrub(text)


@pytest.mark.parametrize("text", [
    "staying 2026-06-03 2026-06-10",
    "my PASSPORT EXPIRED last month",
    "call me on 98765 43210",
    "order 123456789012",
    "wa 919876543210",
])
def test_scrub_keeps(text):
    assert regex_scrub(text) == text


# ---- forget backstop ------------------------------------------------------
@pytest.mark.parametrize("text", [
    "Please forget my sister's number",
    "forget what I said about the allergy",
    "Remove that from your records",
    "delete my card details from your memory",
    "I don't want it saved",
])
def test_forget_request(text):
    assert FORGET_RE.search(text)


@pytest.mark.parametrize("text", [
    "Don't forget the cake on Friday",
    "Forget it, I'll take the stairs",
    "remove the extra bed from my booking in the system",
    "I never forget my birthday plans",
    "dont forget my passport",
    "Don’t forget my cake",
    "Forget about it, I will take the stairs",
    "You always forget my name",
])
def test_not_forget(text):
    assert not FORGET_RE.search(text)


def test_span_pattern_digits_with_spaces():
    assert _span_pattern("4111111111111111").search("card 4111 1111 1111 1111")


# ---- screen: validity and cache -------------------------------------------
MSGS = [{"role": "assistant", "text": "How can I help?"},
        {"role": "user", "text": "I'm vegetarian. My card is 5500 0000 0000 0004."},
        {"role": "user", "text": "Checkout is 4pm for everyone, save it."}]


def test_valid():
    ok = Screen._valid
    assert ok({"line": 1, "action": "redact", "reason": "card"}, MSGS)
    assert not ok({"line": 1, "action": "redact", "reason": "food"}, MSGS)          # not a never-store kind
    assert not ok({"line": 0, "action": "drop", "reason": "global_claim", "confirmed": True}, MSGS)  # assistant
    assert not ok({"line": 2, "action": "drop", "reason": "global_claim"}, MSGS)    # not confirmed
    assert not ok({"line": 9, "action": "redact", "reason": "card"}, MSGS)
    assert not ok({"line": 0, "action": "forget", "about": "x"}, MSGS)


def stub_screen(tmp_path, answer):
    s = Screen(cache_dir=tmp_path)
    calls = []

    def ask(prompt, json_mode=False):
        calls.append(prompt)
        return json.dumps(answer) if json_mode else "yes"
    s._ask = ask
    return s, calls


def test_cache_keeps_no_removed_text(tmp_path):
    answer = {"changes": [{"line": 1, "action": "redact", "reason": "card", "remove": ["5500 0000 0000 0004"]}]}
    s, calls = stub_screen(tmp_path, answer)
    kept, _ = s(MSGS)
    assert "5500" not in kept[1]["text"] and "vegetarian" in kept[1]["text"]
    on_disk = "".join(p.read_text() for p in tmp_path.iterdir())
    assert "5500" not in on_disk
    n = len(calls)
    kept2, _ = s(MSGS)                     # from the cache: same result, no model call
    assert kept2 == kept and len(calls) == n


def test_forget_chats_not_cached(tmp_path):
    answer = {"changes": [{"line": 1, "action": "forget", "about": "card", "remove": ["5500 0000 0000 0004"]}]}
    s, _ = stub_screen(tmp_path, answer)
    s(MSGS)
    assert list(tmp_path.iterdir()) == []


def test_freeze_thaw_round_trip():
    t = "0. user: card 5500 0000 0000 0004 ok"
    c = [{"line": 0, "action": "redact", "reason": "card", "remove": ["5500 0000 0000 0004"]}]
    assert _thaw(_freeze(c, t), t)[0]["remove"] == ["5500 0000 0000 0004"]


# ---- recall with a fake Zep -----------------------------------------------
class NotFound(Exception):
    pass


@pytest.fixture
def mem(monkeypatch):
    errors = types.ModuleType("zep_cloud.errors")
    errors.NotFoundError = NotFound
    monkeypatch.setitem(sys.modules, "zep_cloud.errors", errors)
    from agent_memory.store import Memory
    m = Memory.__new__(Memory)
    m.ns, m.k, m._graphs = "t", 3, {}
    m._self_fact = re.compile(r"^Priya\b", re.I)
    edge = lambda f, d: NS(fact=f, valid_at=d, invalid_at=None, attributes={}, episode_uuids=[], uuid_=f)
    edges = [edge("Priya works at Hotel Logiciel.", "2026-11-01"),
             edge("Arjun prefers a high floor.", "2026-11-02"),
             edge("Arjun prefers a high floor.", "2026-11-02"),
             edge("Arjun is vegetarian.", "2026-11-01"),
             edge("Arjun's email is a@example.com.", "2026-11-03"),
             edge("Arjun likes tea.", "2026-11-04")]
    state = {"graph": "old", "lookups": 0}

    def lookup(user_id):
        state["lookups"] += 1
        return NS(graph_uuid=state["graph"])

    def search_edges(g, query, page_size):
        if g != state["graph"]:
            raise NotFound()
        return iter(edges)
    m.z = NS(user=NS(lookup=lookup), graph=NS(search_edges=search_edges))
    m.state = state
    return m


def test_recall_skips_assistant_and_duplicates(mem):
    facts = [f.text for f in mem.recall("arjun", "room", lessons=False)]
    assert facts == ["Arjun is vegetarian.", "Arjun prefers a high floor.", "Arjun's email is a@example.com."]


def test_recall_retries_stale_graph(mem):
    mem.recall("arjun", "room", lessons=False)
    mem.state["graph"] = "new"             # user deleted and created again elsewhere
    assert mem.recall("arjun", "room", lessons=False)
    assert mem.state["lookups"] == 2
