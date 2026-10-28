"""Train on transformed ABCD chats, evaluate on the untouched official test split.

The downstream task is conversation flow classification from the whole chat (not online next-action
prediction). A fixed multinomial naive Bayes classifier with word unigrams/bigrams and alpha=1 is
trained independently for original text and each replacement variant. Vocabulary, counts and class
priors use training data only. No model selection or tuning uses the test split. Standard library
only; this is an inexpensive task baseline, not evidence about LLM fine-tuning or entity QA.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from itertools import pairwise

from .types import Document, Output

WORD = re.compile(r"\b\w+\b")


def features(text: str) -> Counter:
    words = WORD.findall(text.casefold())
    return Counter([(w,) for w in words] + list(pairwise(words)))


@dataclass
class FlowClassifier:
    vocabulary: set[tuple[str, ...]]
    log_priors: dict[str, float]
    log_probabilities: dict[str, dict]
    unseen: dict[str, float]

    @classmethod
    def fit(cls, texts: list[str], labels: list[str]) -> FlowClassifier:
        if not texts or len(texts) != len(labels):
            raise ValueError("training texts and labels must have the same nonzero length")
        counts, totals, documents = defaultdict(Counter), Counter(), Counter(labels)
        vocabulary = set()
        for text, label in zip(texts, labels):
            found = features(text)
            counts[label].update(found)
            totals[label] += sum(found.values())
            vocabulary.update(found)
        size = max(len(vocabulary), 1)
        return cls(vocabulary, {k: math.log(n / len(labels)) for k, n in sorted(documents.items())},
                   {k: {word: math.log((n + 1) / (totals[k] + size)) for word, n in row.items()}
                    for k, row in counts.items()},
                   {k: math.log(1 / (totals[k] + size)) for k in counts})

    def predict(self, text: str) -> str:
        found = {w: n for w, n in features(text).items() if w in self.vocabulary}
        return max(self.log_priors, key=lambda k: self.log_priors[k] + sum(
            n * self.log_probabilities[k].get(w, self.unseen[k]) for w, n in found.items()))


def classification_scores(gold: list[str], predictions: list[str]) -> dict:
    if not gold or len(gold) != len(predictions):
        raise ValueError("gold and predictions must have the same nonzero length")
    labels = sorted(set(gold) | set(predictions))
    actual, predicted = Counter(gold), Counter(predictions)
    correct = Counter(g for g, p in zip(gold, predictions) if g == p)
    by_flow = {k: {"support": actual[k], "correct": correct[k],
                   "precision": correct[k] / predicted[k] if predicted[k] else 0.0,
                   "recall": correct[k] / actual[k] if actual[k] else 0.0,
                   "f1": 2 * correct[k] / (actual[k] + predicted[k])}
               for k in labels}
    return {"examples": len(gold), "correct": sum(correct.values()),
            "accuracy": sum(correct.values()) / len(gold),
            "macro_f1": sum(v["f1"] for v in by_flow.values()) / len(labels), "by_flow": by_flow}


def evaluate(train: list[Document], test: list[Document], variants: dict[str, dict[str, Output]]) -> dict:
    """Fit on each training variant; all models see the exact same original test text."""
    if {d.id for d in train} & {d.id for d in test}:
        raise ValueError("training and test document ids overlap")
    labels, gold = [d.meta["flow"] for d in train], [d.meta["flow"] for d in test]
    rows, baseline = {}, None
    for name in ("original", *variants):
        texts = [d.text if name == "original" else variants[name][d.id].text for d in train]
        model = FlowClassifier.fit(texts, labels)
        predictions = [model.predict(d.text) for d in test]
        row = classification_scores(gold, predictions)
        if baseline is None:
            baseline = predictions
        row["paired_with_original"] = {
            "wins": sum(p == g and b != g for p, b, g in zip(predictions, baseline, gold)),
            "losses": sum(p != g and b == g for p, b, g in zip(predictions, baseline, gold)),
            "prediction_agreement": sum(p == b for p, b in zip(predictions, baseline)) / len(gold),
        }
        row["predictions"] = dict(zip([d.id for d in test], predictions))
        rows[name] = row
    return {"schema": "maskara.flow-utility/1", "task": "ABCD whole-conversation flow classification",
            "training_documents": len(train), "test_documents": len(test),
            "protocol": "fit each variant on official train; evaluate all on untouched official test; "
                        "no test-set tuning; vocabulary and class priors learned on train only",
            "model": "multinomial naive Bayes, word unigrams+bigrams, alpha=1, uniform feature weights",
            "not_measured": ["LLM fine-tuning", "entity-dependent QA", "online next-action prediction",
                             "re-identification risk", "generalization to other domains or languages"],
            "systems": rows}
