import re
from datetime import datetime
from itertools import pairwise

import pytest

from maskara.bench import corpora
from maskara.bench.corpora import linked
from maskara.bench.linked.docs import DATE_PARSE, documents
from maskara.bench.linked.people import Person, extract_name
from maskara.bench.linked.qa import pose, questions
from maskara.bench.linked.world import AGENTS, generate
from maskara.bench.types import Edit, make_output

NAMES = [
    ("Maria", "Lopez", "Female"), ("James", "Okafor", "Male"), ("José", "Núñez", "Male"),
    ("Aiko", "Tanaka", "Female"), ("Liam", "O'Brien", "Male"), ("Grace", "Smith-Jones", "Female"),
    ("Dmitri", "Volkov", "Male"), ("Priya", "Raman", "Female"), ("Samuel", "Baker", "Male"),
    ("Hannah", "Kim", "Female"), ("Omar", "Haddad", "Male"), ("Elena", "Petrova", "Female"),
    ("Noah", "Fischer", "Male"), ("Chloe", "Dubois", "Female"), ("Mateo", "Rossi", "Male"),
    ("Fatima", "Bello", "Female"), ("Ethan", "Walsh", "Male"), ("Ava", "Nguyen", "Female"),
    ("Lucas", "Moreau", "Male"), ("Zoe", "Carter", "Female"), ("Isaac", "Levi", "Male"),
    ("Mia", "Larsen", "Female"), ("Owen", "Byrne", "Male"), ("Leah", "Cohen", "Female"),
]
PEOPLE = [Person(f"u{i}", f, la, s, 18 + 3 * i, "Springfield", "IL", f"627{i:02d}")
          for i, (f, la, s) in enumerate(NAMES)]


@pytest.fixture(scope="module")
def world():
    return generate(PEOPLE, seed=0)


@pytest.fixture(scope="module")
def docs(world):
    return documents(world, seed=0)


@pytest.fixture(scope="module")
def qs(world, docs):
    return questions(world, docs, seed=0)


def _spans(docs):
    return [(d, s) for d in docs for s in d.annotations["gold"]]


def test_extract_name():
    assert extract_name(["Mary Alberti is a cook", "Mary Alberti, a cook", "Mary Alberti runs"]) == ("Mary", "Alberti")
    assert extract_name(["Seán O'Neil-Ruiz is", "Seán O'Neil-Ruiz,", "Seán O'Neil-Ruiz runs"]) == ("Seán", "O'Neil-Ruiz")
    assert extract_name(["Mary Ann Smith is", "Mary Ann Smith,", "Mary Ann Smith runs"]) is None
    assert extract_name(["Mary Alberti is", "Mary Alberti,", "Mary Jones runs"]) is None
    assert extract_name(["Cher is a singer", "Cher, a singer", "Cher runs"]) is None


def test_deterministic(world, docs, qs):
    again = documents(generate(PEOPLE, seed=0), seed=0)
    assert [(d.id, d.text, d.annotations) for d in again] == [(d.id, d.text, d.annotations) for d in docs]
    assert questions(world, again, seed=0) == qs
    other = documents(generate(PEOPLE, seed=1), seed=1)
    assert [d.text for d in other] != [d.text for d in docs]


def test_spans_match_text_and_do_not_overlap(docs):
    for d in docs:
        spans = d.annotations["gold"]
        assert spans == sorted(spans, key=lambda s: s.start)
        for a, b in pairwise(spans):
            assert a.end <= b.start
        for s in spans:
            text = d.text[s.start:s.end]
            assert text and text == text.strip()


def test_entity_ids_hold_across_documents(world, docs):
    seen: dict[str, set[str]] = {}
    for d, s in _spans(docs):
        owner, _, field = s.entity.partition("/")
        text = d.text[s.start:s.end]
        seen.setdefault(s.entity, set()).add(d.id)
        if owner in world.customers:
            c = world.customers[owner]
            expected = {"name": {c.first, c.last, f"{c.first} {c.last}"}, "email": {c.email},
                        "customer_id": {c.customer_id}, "street": {c.street}, "card": {c.card_last4},
                        "age": {str(c.age)}}
            if field == "phone":
                assert re.sub(r"\D", "", text)[-10:] == c.phone
            elif field == "birth_date":
                assert _parse(text) == c.birth_date
            else:
                assert text in expected[field], (s.entity, text)
        elif owner in world.agents:
            a = world.agents[owner]
            assert text in {a.first, f"{a.first} {a.last}"}
        elif owner in world.orders:
            o = world.orders[owner]
            assert re.sub(r"\D", "", text) == o.number if field == "id" else _parse(text) == o.placed
    # Every customer's name appears in every one of their conversations, so it spans documents.
    for c in world.customers:
        tickets = world.tickets_of(c)
        assert {f"{t.key}-{t.channel}" for t in tickets} <= seen[f"{c}/name"]


def test_conversations_carry_name_date_and_order(world, docs):
    by_id = {d.id: d for d in docs}
    for t in world.tickets:
        labels = {(s.label, s.entity) for s in by_id[f"{t.key}-{t.channel}"].annotations["gold"]}
        assert ("full_name", f"{t.customer}/name") in labels
        assert ("ticket_date", f"{t.key}/date") in labels
        if t.order:
            assert ("order_id", f"{t.order}/id") in labels
        if t.related and t.relation != "similar case":
            assert any(e.startswith(f"{t.related}/") for _, e in labels)


def _parse(text):
    for fmt in DATE_PARSE:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    raise ValueError(text)


def _ticket_date(doc):
    return next(_parse(doc.text[s.start:s.end]) for s in doc.annotations["gold"] if s.label == "ticket_date")


def _owner(doc, anchor):
    """The customer whose name or order the anchor mentions, read from the gold."""
    span = next(s for s in doc.annotations["gold"] if (s.start, s.end) == (anchor.start, anchor.end))
    return span.entity.split("/")[0]


def test_qa_answers_follow_from_the_gold(world, docs, qs):
    by_id = {d.id: d for d in docs}
    assert {q.kind for q in qs} == {"ticket_count", "ticket_gap", "earlier_issue", "last_product", "same_person"}
    for q in qs:
        assert {a.doc for a in q.anchors.values()} <= set(q.evidence)
        assert not q.options or q.answer in q.options
        if q.kind == "same_person":
            a, b = q.anchors["a"], q.anchors["b"]
            same = by_id[b.doc].meta["customer"] == _owner(by_id[a.doc], a)
            assert q.answer == ("yes" if same else "no")
            continue
        anchor = q.anchors["a"]
        subject = _owner(by_id[anchor.doc], anchor)
        if subject.startswith("O"):
            subject = by_id[anchor.doc].meta["customer"]
        assert subject == q.subject
        # The subject's own tickets, found through the name entity in the gold.
        own = sorted({d.meta["ticket"]: d for d in docs if d.meta["customer"] == subject and d.meta["type"] != "note"
                      and any(s.entity == f"{subject}/name" for s in d.annotations["gold"])}.values(),
                     key=_ticket_date)
        dates = [_ticket_date(d) for d in own]
        if q.kind == "ticket_count":
            assert q.answer == str(len(own))
        elif q.kind == "ticket_gap":
            assert q.answer == str((dates[1] - dates[0]).days)
            assert {own[0].id, own[1].id} <= set(q.evidence)
        elif q.kind == "last_product":
            assert q.answer in own[-1].text and q.answer not in by_id[anchor.doc].text
        elif q.kind == "earlier_issue":
            i = [d.id for d in own].index(anchor.doc)
            assert i > 0 and own[i - 1].meta["issue"] == q.answer


def test_pose_uses_the_systems_surrogate(docs, qs):
    by_id = {d.id: d for d in docs}
    q = next(q for q in qs if q.kind == "ticket_count")
    a = q.anchors["a"]
    original = pose(q, by_id)
    assert by_id[a.doc].text[a.start:a.end] in original
    outputs = {d.id: make_output(d.text, []) for d in docs}
    outputs[a.doc] = make_output(by_id[a.doc].text, [Edit(a.start, a.end, "[PERSON]")])
    assert pose(q, by_id, outputs) == q.template.format(a="[PERSON]")


def test_corpus_module_offline(monkeypatch):
    monkeypatch.setattr(linked._people, "load", lambda n: PEOPLE[:n])
    linked.world.cache_clear()
    linked._all_documents.cache_clear()
    try:
        assert len(PEOPLE) - AGENTS < linked.CUSTOMERS
        docs = corpora.load("linked", 12)
        assert len(docs) == 12
        kept = {d.id for d in docs}
        limited = linked.questions(12)
        assert limited and all(kept.issuperset(q.evidence) for q in limited)
        assert len(limited) < len(linked.questions())
        assert {"customers", "agents", "orders", "tickets"} == set(linked.tables())
    finally:
        linked.world.cache_clear()
        linked._all_documents.cache_clear()


def test_same_person_answers_are_mixed(qs):
    answers = [q.answer for q in qs if q.kind == "same_person"]
    assert set(answers) == {"yes", "no"}
    # Neither all yes before all no nor the reverse.
    assert answers not in (sorted(answers), sorted(answers, reverse=True))
