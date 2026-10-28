import json

import pytest

from maskara import cli
from maskara.bench.corpora import abcd
from maskara.bench.types import Document, make_output
from maskara.bench.utility import FlowClassifier, classification_scores, evaluate


def test_classifier_and_macro_metrics():
    model = FlowClassifier.fit(["refund order", "return refund", "reset password", "password login"],
                               ["refund", "refund", "login", "login"])
    assert model.predict("order refund unseenword") == "refund"
    assert ("unseenword",) not in model.vocabulary
    assert model.predict("password reset") == "login"
    metrics = classification_scores(["a", "a", "b"], ["a", "b", "b"])
    assert metrics["accuracy"] == pytest.approx(2 / 3)
    assert metrics["macro_f1"] == pytest.approx(2 / 3)


def data():
    train = [Document("train-a", "refund order", {}, {"flow": "refund"}),
             Document("train-b", "password reset", {}, {"flow": "login"})]
    test = [Document("test-a", "refund order", {}, {"flow": "refund"}),
            Document("test-b", "password reset", {}, {"flow": "login"})]
    return train, test


def test_transform_applies_only_to_training_and_not_test():
    train, test = data()
    # Reverse the training content while keeping labels: if test were also changed, the failure
    # would disappear. Every evaluation must use the original held-out test documents.
    outputs = {d.id: make_output(other.text, []) for d, other in zip(train, reversed(train))}
    result = evaluate(train, test, {"swapped": outputs})
    assert result["systems"]["original"]["accuracy"] == 1
    assert result["systems"]["swapped"]["accuracy"] == 0
    assert result["systems"]["swapped"]["paired_with_original"]["losses"] == 2
    with pytest.raises(ValueError, match="overlap"):
        evaluate(train, train, {})


def test_cli_utility_uses_official_split_arguments(tmp_path, monkeypatch):
    pytest.importorskip("faker")
    train, test = data()
    calls = []

    def load(split="test", limit=None):
        calls.append(split)
        return {"train": train, "test": test}[split][:limit]

    monkeypatch.setattr(abcd, "load", load)
    assert cli.main(["bench-utility", "--out", str(tmp_path)]) == 0
    assert calls == ["train", "test"]
    result = json.loads((tmp_path / "abcd--flow-utility.json").read_text())
    assert len(result["systems"]) == 5
    assert result["comparison"]["with_tables"] is False
    assert all(r["accuracy"] == 1 for r in result["systems"].values())
