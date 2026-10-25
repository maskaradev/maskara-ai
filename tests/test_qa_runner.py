import json
from datetime import timedelta

import pytest

from maskara import cli
from maskara.bench import hero, qa_runner
from maskara.bench.linked.docs import documents
from maskara.bench.linked.qa import questions
from maskara.bench.linked.world import generate
from maskara.bench.qa_runner import _parse_date, accuracy, linking_answers, llm_answers
from maskara.bench.systems.baseline import none, oracle_redact
from maskara.bench.types import Edit, make_output
from test_linked import PEOPLE

NAME = {"full_name": "{0}Ann {0}Lee", "first_name": "{0}Ann", "last_name": "{0}Lee"}


@pytest.fixture(scope="module")
def corpus():
    world = generate(PEOPLE, seed=0)
    docs = documents(world, seed=0)
    return docs, questions(world, docs, seed=0)


def _personas(docs, per_document: bool):
    """Replaces names with a pseudonym per person (or per person and document) and moves dates by a week."""
    out = {}
    for d in docs:
        edits = []
        for s in d.annotations["gold"]:
            owner = s.entity.split("/")[0]
            if s.label in NAME:
                key = f"{d.id.replace('-', '')}{owner}" if per_document else owner
                edits.append(Edit(s.start, s.end, NAME[s.label].format(key)))
            elif s.label == "ticket_date":
                edits.append(Edit(s.start, s.end, (_parse_date(d.text[s.start:s.end]) + timedelta(7)).isoformat()))
        out[d.id] = make_output(d.text, edits)
    return out


def _accuracy(docs, qs, outputs):
    return accuracy(qs, linking_answers(docs, outputs, qs))


def test_linking_reader_ceiling_and_consistent_personas(corpus):
    docs, qs = corpus
    assert _accuracy(docs, qs, none(docs))["accuracy"] == 1.0
    assert _accuracy(docs, qs, _personas(docs, per_document=False))["accuracy"] == 1.0


def test_per_document_pseudonyms_lose_the_links(corpus):
    docs, qs = corpus
    outputs = _personas(docs, per_document=True)
    assert {a for q, a in zip(qs, linking_answers(docs, outputs, qs).values()) if q.kind == "same_person"} == {"no"}
    r = _accuracy(docs, qs, outputs)
    for kind in ("ticket_gap", "earlier_issue", "last_product"):
        assert r["by_kind"][kind]["accuracy"] == 0.0
    assert r["accuracy"] < 0.4


def test_redaction_merges_everyone(corpus):
    docs, qs = corpus
    outputs = oracle_redact(docs)
    assert {a for q, a in zip(qs, linking_answers(docs, outputs, qs).values()) if q.kind == "same_person"} == {"yes"}
    r = _accuracy(docs, qs, outputs)
    assert r["by_kind"]["ticket_count"]["accuracy"] == 0.0
    assert r["by_kind"]["ticket_gap"]["unanswered"] == r["by_kind"]["ticket_gap"]["questions"]


def test_llm_reader_sees_the_masked_evidence(corpus):
    docs, qs = corpus
    outputs = _personas(docs, per_document=False)
    prompts = []

    def ask(prompt):
        prompts.append(prompt)
        return "<think>hmm</think> Yes." if "same person" in prompt else "3 tickets"

    answers = llm_answers(docs, outputs, qs[:3] + qs[-3:], ask)
    assert all(outputs[i].text in p for q, p in zip(qs[:3] + qs[-3:], prompts) for i in q.evidence)
    assert not any(d.text in "".join(prompts) for d in docs if d.annotations["gold"])
    assert [answers[q.id] for q in qs[:3]] == ["3"] * 3
    assert [answers[q.id] for q in qs[-3:]] == ["yes"] * 3


def test_hero_points_from_saved_runs(corpus, tmp_path, monkeypatch):
    docs, qs = corpus
    monkeypatch.setattr(qa_runner, "load_run", lambda runs, corpus, system: (None, docs, systems[system]))
    monkeypatch.setattr(hero.corpora.CORPORA["linked"], "questions", lambda limit: qs)
    systems = {"none": none(docs), "oracle-redact": oracle_redact(docs)}
    for name in systems:
        scores = {"privacy": {"direct": {"leak_full": 0.0 if "redact" in name else 1.0, "leak_partial": 0.0,
                                         "residual": 0.0, "entity_leak": 0.0}},
                  "fidelity": dict.fromkeys(("consistency", "distinctness", "placeholder", "over_masking"))}
        (tmp_path / f"linked--{name}.json").write_text(json.dumps({"documents": len(docs), "scores": scores}))
        (tmp_path / f"linked--{name}.outputs.jsonl").write_text("")
    assert cli.main(["hero", "--runs", str(tmp_path)]) == 0
    data = json.loads((tmp_path / "hero-linked.json").read_text())
    by = {p["system"]: p for p in data["points"]}
    assert (by["none"]["private"], by["none"]["qa_accuracy"]) == (0.0, 1.0)
    assert by["oracle-redact"]["private"] == 1.0 and by["oracle-redact"]["qa_accuracy"] < 0.5
    assert data["questions"] == len(qs)
    assert (tmp_path / "hero-linked.svg").read_text().startswith("<svg")
    assert (tmp_path / "hero-linked.csv").read_text().count("\n") == 3


def test_bench_qa_flag_runs_entity_qa(corpus, tmp_path, monkeypatch, capsys):
    docs, qs = corpus
    module = hero.corpora.CORPORA["linked"]
    monkeypatch.setattr(module, "load", lambda limit=None: docs[:limit])
    monkeypatch.setattr(module, "questions", lambda limit=None: qs)
    args = ["bench", "--corpus", "linked", "--system", "none", "oracle-redact", "--out", str(tmp_path), "--qa", "linking"]
    assert cli.main(args) == 0
    printed = capsys.readouterr().out
    assert "QA accuracy" in printed and "100.0%" in printed
    saved = json.loads((tmp_path / "linked--none.qa-linking.json").read_text())
    assert saved["accuracy"] == 1.0 and saved["questions"] == len(qs)
    assert json.loads((tmp_path / "linked--oracle-redact.qa-linking.json").read_text())["accuracy"] < 0.5
    monkeypatch.delenv("MASKARA_QA_BASE_URL", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert cli.main([*args[:-1], "llm", "--rescore"]) == 2  # no LLM configured
