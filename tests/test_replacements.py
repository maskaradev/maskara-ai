import json
from dataclasses import replace

import pytest

from maskara import cli
from maskara.bench import corpora, replacements
from maskara.bench.qa_runner import accuracy, linking_answers
from maskara.bench.systems import presidio
from maskara.bench.types import Document, Span
from maskara.vault import normalize


@pytest.fixture
def linked(monkeypatch):
    from maskara.bench.linked.docs import documents
    from maskara.bench.linked.qa import questions
    from maskara.bench.linked.world import generate
    from test_linked import PEOPLE

    world = generate(PEOPLE, seed=0)
    docs = documents(world, seed=0)
    module = corpora.CORPORA["linked"]
    monkeypatch.setattr(module, "tables", world.tables)
    monkeypatch.setattr(module, "load", lambda limit=None: docs[:limit])
    monkeypatch.setattr(module, "questions", lambda limit=None: questions(world, docs, seed=0))
    return docs, questions(world, docs, seed=0)


def test_study_uses_one_pass_and_no_gold(linked, monkeypatch):
    pytest.importorskip("faker")
    docs, _ = linked
    original_mask = replacements.mask
    calls = []

    def capture(**kwargs):
        calls.append(kwargs)
        return original_mask(**kwargs)

    monkeypatch.setattr(replacements, "mask", capture)
    prepared = replacements.prepare(docs)
    outputs = replacements.render(docs, prepared)
    assert len(calls) == 1
    # Poisoned gold cannot change preparation or rendering.
    poisoned = [replace(d, annotations={"fake": [Span(0, len(d.text), "wrong", "PERSON", "direct", "same")]})
                for d in docs]
    other = replacements.prepare(poisoned)
    assert prepared.mentions == other.mentions
    assert prepared.manifest["plan_sha256"] == other.manifest["plan_sha256"]
    assert outputs == replacements.render(poisoned, other)
    for d in docs:
        baseline = outputs["persona"][d.id].edits
        for variant in replacements.VARIANTS:
            edits = outputs[variant][d.id].edits
            assert [(e.start, e.end) for e in edits] == [(e.start, e.end) for e in baseline]
            for m, e, common in zip(prepared.mentions[d.id], edits, baseline):
                if m.kind is None:
                    assert e == common  # Includes dates, IDs, policy-kept and undetected text.


def test_names_contacts_stable_across_documents_batches_and_order(linked):
    pytest.importorskip("faker")
    docs, _ = linked
    plan = replacements.prepare(docs)
    outputs = replacements.render(docs, plan)
    seen = {v: {} for v in replacements.VARIANTS}
    count = 0
    for d in docs:
        for i, m in enumerate(plan.mentions[d.id]):
            if not m.kind:
                continue
            count += 1
            for variant in ("value-faker", "entity-token", "entity-faker"):
                key = (m.kind, m.value_key) if variant == "value-faker" or not m.owner else (
                    m.kind, m.owner, m.name_form if m.kind == "name" else m.kind)
                value = outputs[variant][d.id].edits[i].replacement
                assert seen[variant].setdefault(key, value) == value
    assert count > 20
    assert replacements.render(list(reversed(docs)), plan) == outputs
    with pytest.raises(ValueError, match="text changed"):
        replacements.render([replace(docs[0], text="Changed input"), *docs[1:]], plan)
    middle = len(docs) // 2
    for group in (docs[:middle], docs[middle:]):
        subplan = replacements.Prepared({d.id: plan.mentions[d.id] for d in group}, plan.manifest)
        subset = replacements.render(group, subplan)
        for variant in replacements.VARIANTS:
            assert subset[variant] == {d.id: outputs[variant][d.id] for d in group}


def test_strong_controls_keep_qa_dates_and_links(linked):
    pytest.importorskip("faker")
    docs, questions = linked
    outputs = replacements.render(docs, replacements.prepare(docs))
    scores = {v: accuracy(questions, linking_answers(docs, out, questions)) for v, out in outputs.items()}
    for variant in ("entity-token", "entity-faker"):
        assert scores[variant]["accuracy"] >= scores["persona"]["accuracy"] - 0.02
        assert scores[variant]["by_kind"]["ticket_gap"]["accuracy"] > 0.8


def test_global_presidio_faker_shares_values_across_documents_and_calls(monkeypatch):
    pytest.importorskip("faker")
    monkeypatch.setattr(presidio, "detect", lambda t: [(0, len(t), "PERSON", 1.0)])
    docs = [Document("a", "Alice Smith", {}), Document("b", "Bob Stone", {}),
            Document("c", "ALICE SMITH", {})]
    out = presidio.fake_global(docs)
    assert out["a"].text == out["c"].text != out["b"].text
    assert presidio.fake_global(list(reversed(docs))) == out
    for d in docs:
        assert presidio.fake_global([d])[d.id] == out[d.id]


def test_cli_saves_comparable_plans_outputs_and_qa(linked, tmp_path, capsys):
    pytest.importorskip("faker")
    assert cli.main(["bench-replacements", "--out", str(tmp_path)]) == 0
    rows = json.loads((tmp_path / "replacement-study.json").read_text())
    assert len(rows) == 4
    assert len({r["comparison"]["plan_sha256"] for r in rows}) == 1
    assert all(r["comparison"]["with_tables"] for r in rows)
    for row in rows:
        stem = f"linked--{row['system']}"
        qa = json.loads((tmp_path / f"{stem}.qa-linking.json").read_text())
        assert qa["questions"] > 0
        assert (tmp_path / f"{stem}.outputs.jsonl").exists()
    assert "QA accuracy" in capsys.readouterr().out
    assert cli.main(["bench-replacements", "--limit", "0", "--out", str(tmp_path)]) == 2


def test_unresolved_values_are_not_assigned_an_invented_owner():
    pytest.importorskip("faker")
    docs = [Document("1", "Email alice@example.org or bob@example.org.", {})]
    plan = replacements.prepare(docs, with_tables=False)
    contacts = [m for m in plan.mentions["1"] if m.kind == "email"]
    assert len(contacts) == 2 and all(m.owner is None for m in contacts)
    out = replacements.render(docs, plan)
    assert out["entity-faker"] == out["value-faker"]
    assert normalize(out["entity-token"]["1"].edits[0].replacement) != normalize(
        out["entity-token"]["1"].edits[1].replacement)
