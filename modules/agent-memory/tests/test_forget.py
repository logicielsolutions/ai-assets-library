"""forget() with a fake Zep and scripted model answers: no OpenAI, no Zep.
    python -m pytest tests"""
import warnings
from types import SimpleNamespace as NS

import pytest

pytest.importorskip("zep_cloud")
from agent_memory.store import Memory  # noqa: E402

REQUEST = "forget my cashew allergy, and keep my room booking"


def fake(second, reworded="Arjun is allergic to certain foods.", wait=True):
    """Arjun told the assistant about a cashew allergy and room 412, then asked to forget the allergy.
    When the cleaned chat is re-added, Zep rewords the allergy, adds an unrelated new fact, merges the
    room fact onto the new chat, and links a reworded record to the request chat."""
    m = Memory.__new__(Memory)
    m.ns, m._graphs, m._episodes, m.wait, m.expiry = "t", {}, {}, wait, False
    E = lambda u, f, eps: NS(uuid_=u, fact=f, episode_uuids=list(eps))
    edges = {"a": E("a", "Arjun is allergic to cashews.", ["ep1"]),
             "b": E("b", "Arjun wants room 412 near the lift.", ["ep1", "ep2"])}
    eps = {"ep1": NS(uuid_="ep1", content="user: I am allergic to cashews. I want room 412 near the lift.",
                     metadata={"conversation": "c1", "date": "2026-11-01"}, reference_time=None),
           "req": NS(uuid_="req", content=f"user: {REQUEST}",
                     metadata={"conversation": "c2", "date": "2026-11-02"}, reference_time=None)}
    deleted = []

    def edge_list(g, page_size, filters=None):
        if filters:
            return [e for e in edges.values() if set(e.episode_uuids) & set(filters.episode_uuids)]
        return list(edges.values())

    def episode_delete(g, u):
        eps.pop(u, None)
        for k in [k for k, e in edges.items() if e.episode_uuids == [u]]:
            edges.pop(k)
        for e in edges.values():
            e.episode_uuids = [x for x in e.episode_uuids if x != u]

    def add(user, text, src):
        u = f"new-{src['conversation']}"
        if src["conversation"] == "c1":
            edges["c"] = E("c", reworded, [u])
            edges["d"] = E("d", "Arjun likes the hotel's cashew-free menu board.", [u])   # new, unrelated words
            edges["b"].episode_uuids.append(u)                                       # merged, not new
        else:
            edges["r"] = E("r", "Arjun asked the hotel to forget a food detail.", [u, "new-c1"])
        return u

    def edge_delete(g, u):
        deleted.append(u)
        edges.pop(u)

    m._add, m._wait_gone, m._live = add, (lambda g, u: True), (lambda u: "g")
    m.z = NS(graph=NS(edge=NS(list=edge_list, delete=edge_delete),
                      episode=NS(list=lambda g, page_size: list(eps.values()), delete=episode_delete)))
    answers = [{"facts": [0], "details": ["cashew"]}, {"spans": ["cashews"]}, {"spans": ["cashew"]}, second]

    def ask_json(prompt):
        a = answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a
    m.screen = NS(ask_json=ask_json)
    return m, edges, deleted


def test_reworded_fact_deleted_by_stem():
    m, edges, deleted = fake({"facts": [0]})
    m.forget("u", "cashew allergy", REQUEST, keep_episode="req")
    assert "c" in deleted                       # "allergic" matches "allergy"
    assert "b" in edges                         # old fact merged onto the new chat is not re-judged


def test_picked_fact_without_shared_stem_kept():
    m, edges, deleted = fake({"facts": [0, 1]}, reworded="Arjun has a food sensitivity.")
    m.forget("u", "cashew allergy", REQUEST, keep_episode="req")
    assert "c" in edges and "c" not in deleted  # no stem in common with "cashew allergy": guard keeps it


def test_request_record_not_offered_again():
    m, edges, _ = fake({"facts": [0, 1, 2]})
    m.forget("u", "cashew allergy", REQUEST, keep_episode="req")
    assert "r" in edges


@pytest.mark.parametrize("second", [[1], RuntimeError("timeout")])
def test_bad_second_answer_still_finishes(second):
    m, edges, deleted = fake(second)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        out = m.forget("u", "cashew allergy", REQUEST, keep_episode="req")
    assert out["conversations_rewritten"] == 1
    assert "a" not in edges and "c" in edges    # first-pass deletes done, reworded fact left


def test_no_wait_warns():
    m, edges, _ = fake({"facts": [0]}, wait=False)
    with pytest.warns(UserWarning, match="wait=False"):
        m.forget("u", "cashew allergy", REQUEST, keep_episode="req")
