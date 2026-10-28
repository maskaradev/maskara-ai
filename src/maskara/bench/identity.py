"""Gold-span identity attribution diagnostics, independent of detection and rendering.

Gold owners are used only by the scorer. These authored synthetic cases are regression
diagnostics, not an independently annotated customer benchmark or a privacy evaluation.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import date
from pathlib import Path

from ..detect.base import Detection
from ..detect.known import KnownValues
from ..resolve import Resolver

CASES = Path(__file__).with_name("data") / "identity-cases.json"


def evaluate(path: str | Path = CASES) -> dict:
    raw = Path(path).read_bytes()
    corpus = json.loads(raw)
    if not isinstance(corpus, dict) or corpus.get("schema") != "maskara.identity-cases/1":
        raise ValueError("expected maskara.identity-cases/1")
    rows = []
    ids = [case["id"] for case in corpus["cases"]]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate identity case ids")
    for case in corpus["cases"]:
        known = KnownValues()
        for subject, values in case["known"].items():
            for role, value in values.items():
                known.add(subject, role, value)
        births = {s: {date.fromisoformat(d) for d in days} for s, days in case.get("births", {}).items()}
        resolver = Resolver(known, births)
        links = []
        for doc in case["documents"]:
            spans = []
            for m in doc["mentions"]:
                if not 0 <= m["start"] < m["end"] <= len(doc["text"]):
                    raise ValueError(f"invalid mention offsets in {case['id']}")
                spans.append(Detection(m["start"], m["end"], m["category"], m["label"], 1.0, "gold-span"))
            # No gold owner or review label is supplied to the resolver.
            links.append(resolver.link(doc["text"], spans, doc.get("row"), doc.get("others", [])))
        Resolver.cluster(links)
        for doc_index, (doc, decisions) in enumerate(zip(case["documents"], links)):
            for mention_index, (m, link) in enumerate(zip(doc["mentions"], decisions)):
                status = getattr(link, "resolution", "resolved" if link.subject else "unresolved")
                accepted = status == "resolved" and link.subject is not None
                correct = accepted and m["owner"] is not None and link.subject == m["owner"]
                rows.append({"case": case["id"], "group": case["group"], "document": doc_index,
                             "mention": mention_index, "answerable": m["owner"] is not None,
                             "accepted": accepted, "correct": bool(correct), "resolution": status,
                             "evidence": getattr(link, "evidence", (link.how,))})
    return {"schema": "maskara.identity-study/1", "cases": len(corpus["cases"]),
            "fixture_sha256": hashlib.sha256(raw).hexdigest(), "provenance": corpus["provenance"],
            "protocol": "Oracle mention spans; resolver sees text, known values, row context and birth dates. "
                        "Gold owners are read only by the scorer. Provisional identities count as abstentions.",
            "not_measured": ["Detection recall, replacement quality, re-identification risk",
                             "Independent customer data, natural prevalence, calibrated confidence",
                             "Shared-event identity, general coreference and pairwise clustering recall"],
            "scores": scores(rows),
            "groups": {g: scores([r for r in rows if r["group"] == g]) for g in sorted({r["group"] for r in rows})},
            "decisions": rows}


def scores(rows: list[dict]) -> dict:
    total = len(rows)
    accepted = sum(r["accepted"] for r in rows)
    correct = sum(r["correct"] for r in rows)
    answerable = sum(r["answerable"] for r in rows)
    unsafe = sum(r["accepted"] and not r["answerable"] for r in rows)
    ratio = lambda a, b: a / b if b else None
    return {"mentions": total, "answerable": answerable, "accepted": accepted, "correct": correct,
            "wrong": accepted - correct, "abstained": total - accepted,
            "precision": ratio(correct, accepted), "recall": ratio(correct, answerable),
            "coverage": ratio(accepted, total), "abstention_rate": ratio(total - accepted, total),
            "unanswerable_accepted": unsafe,
            "unanswerable_abstention_rate": ratio(total - answerable - unsafe, total - answerable),
            "by_resolution": dict(sorted(Counter(r["resolution"] for r in rows).items()))}
