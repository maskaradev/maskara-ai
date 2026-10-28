import json

import pytest

from maskara import cli, mask
from maskara.api import _row_subject
from maskara.bench.identity import CASES, evaluate, scores
from maskara.detect.base import Detection
from maskara.detect.known import KnownValues
from maskara.resolve import Resolver
from maskara.vault import Vault


def run(**kwargs):
    return mask(**kwargs, detector="rules", vault=Vault.from_seed("identity-test"))


def test_conflicting_rows_do_not_depend_on_column_order_or_pollute_known_values():
    customers = [{"key": "C-1001", "name": "Maria Lopez", "email": "one@example.org"},
                 {"key": "C-1002", "name": "Daniel Chen", "email": "two@example.org"}]
    conflict = {"name": "Maria Lopez", "email": "two@example.org"}
    for row in (conflict, dict(reversed(list(conflict.items())))):
        result = run(tables={"customers": customers, "mixed": [row]}, subjects={"customers": "key"},
                     texts={"notes": ["Maria Lopez called from one@example.org."]})
        mixed = [m for m in result.mentions if m.source == "mixed"]
        assert all(m.resolution == "ambiguous" and m.persona is None for m in mixed)
        assert all(m.evidence == ("conflicting_row_values",) for m in mixed)
        owner = next(m.persona for m in result.mentions if m.source == "customers" and m.row == 0)
        assert {m.persona for m in result.mentions if m.source == "notes"} == {owner}


def test_row_inference_intersects_all_known_fields():
    known = KnownValues()
    for subject in ("C1", "C2"):
        known.add(subject, "name", "Alex Kim")
    known.add("C2", "email", "two@example.org")
    link = _row_subject({"name": "Alex Kim", "email": "two@example.org"},
                        {"name": "name", "email": "email"}, known)
    assert link.subject == "C2" and link.resolution == "resolved"


def test_unkeyed_rows_with_equal_names_are_not_silently_joined():
    result = run(tables={"people": [{"name": "Ana Garcia"}, {"name": "Ana Garcia"}]})
    assert len({m.persona for m in result.mentions}) == 2
    assert all(m.resolution == "provisional" for m in result.mentions)


def test_shared_contact_abstains_and_review_is_value_free(tmp_path):
    people = [{"key": "C-1001", "name": "Maria Lopez", "email": "family@example.org"},
              {"key": "C-1002", "name": "Daniel Lopez", "email": "family@example.org"}]
    result = run(tables={"people": people}, subjects={"people": "key"},
                 texts={"notes": ["Write to family@example.org."]})
    mention = next(m for m in result.mentions if m.source == "notes")
    assert mention.changed and mention.persona is None and mention.resolution == "ambiguous"
    assert mention.candidate_count == 2
    assert "family@example.org" not in result.texts["notes"][0]
    result.save(tmp_path)
    data = json.loads((tmp_path / "review.json").read_text())
    assert data["items"][0]["start"] == 9
    blob = json.dumps(data) + result.report.to_json() + json.dumps(mention.to_dict())
    assert not any(value in blob for value in ("family@example.org", "Maria Lopez", "Daniel Lopez", "C-1001"))
    assert result.report.headline["identity_review"] == 1
    assert "Identity review" in result.report.to_html()
    clean = run(tables={"people": people}, subjects={"people": "key"})
    clean.save(tmp_path)
    assert json.loads((tmp_path / "review.json").read_text())["items"] == []  # no stale queue


def test_audit_filename_cannot_overwrite_a_masked_input(tmp_path):
    result = run(texts={"mentions": ["My friend Ana Garcia called."]})
    with pytest.raises(ValueError, match="conflict with audit files"):
        result.save(tmp_path)
    assert not list(tmp_path.iterdir())


def test_scoped_subject_keys_never_pick_the_first_foreign_key_owner():
    result = run(tables={"customers": [{"id": "10001", "name": "Alex Kim"}],
                         "staff": [{"id": "10001", "name": "Alex Kim"}],
                         "tickets": [{"ref": "10001", "body": "Alex Kim called."}]},
                 subjects={"customers": ("id", "customers"), "staff": ("id", "staff")},
                 columns={"tickets": {"ref": "id", "body": "text"}})
    mention = next(m for m in result.mentions if m.source == "tickets" and m.category == "PERSON")
    assert mention.resolution == "ambiguous" and mention.persona is None and mention.candidate_count == 2


def test_unknown_names_do_not_merge_across_documents_and_ambiguous_alias_is_masked():
    result = run(texts={"notes": ["My friend Ana Garcia called.", "My friend Ana Garcia called.",
                                  "My friend Ana Garcia called. My friend Eva Garcia called. Ms. Garcia left."]})
    names = [m for m in result.mentions if m.category == "PERSON"]
    assert len({m.persona for m in names if m.row < 2}) == 2
    ambiguous = [m for m in names if m.row == 2 and m.resolution == "ambiguous"]
    assert len(ambiguous) == 1 and ambiguous[0].changed and ambiguous[0].persona is None
    assert all(m.resolution != "resolved" for m in names)


def test_context_order_cannot_resolve_two_candidates():
    known = KnownValues()
    for owner in ("A", "Z"):
        known.add(owner, "name", "Alex Kim")
    resolver = Resolver(known, {})
    span = Detection(0, 8, "PERSON", "full_name", 1.0, "test")
    for others in (["A", "Z"], ["Z", "A"]):
        decision = resolver.link("Alex Kim", [span], None, others)[0]
        assert decision.subject is None and decision.resolution == "ambiguous"


def test_gold_owners_only_change_scores_not_decisions(tmp_path):
    fixture = json.loads(CASES.read_text())
    baseline = evaluate()
    for case in fixture["cases"]:
        for doc in case["documents"]:
            for mention in doc["mentions"]:
                mention["owner"] = "poisoned-gold"
    path = tmp_path / "cases.json"
    path.write_text(json.dumps(fixture))
    poisoned = evaluate(path)
    for before, after in zip(baseline["decisions"], poisoned["decisions"]):
        assert (before["accepted"], before["resolution"], before["evidence"]) == (
            after["accepted"], after["resolution"], after["evidence"])
    assert poisoned["scores"]["correct"] == 0


def test_identity_scores_penalize_wrong_links_and_abstention():
    result = scores([{"accepted": True, "correct": True, "answerable": True, "resolution": "resolved"},
                     {"accepted": True, "correct": False, "answerable": False, "resolution": "resolved"},
                     {"accepted": False, "correct": False, "answerable": True, "resolution": "ambiguous"}])
    assert result["precision"] == result["recall"] == 0.5
    assert result["abstention_rate"] == pytest.approx(1 / 3)
    assert result["unanswerable_abstention_rate"] == 0
    assert scores([])["precision"] is None


def test_identity_cli(tmp_path, capsys):
    assert cli.main(["bench-identity", "--out", str(tmp_path)]) == 0
    result = json.loads((tmp_path / "identity-study.json").read_text())
    assert result["scores"]["wrong"] == 0 and result["scores"]["abstained"] > 0
    assert result["groups"]["unique"]["correct"] > 0
    assert "not independent" in capsys.readouterr().out
    assert cli.main(["bench-identity", "--cases", str(tmp_path / "missing")]) == 2
    bad = tmp_path / "invalid.json"
    bad.write_text("[]")
    assert cli.main(["bench-identity", "--cases", str(bad)]) == 2
