"""Builds public/samples/nemotron-pii/ from the nvidia/Nemotron-PII test split (CC BY 4.0).

Picks US healthcare documents, one per document type, and writes them as a CSV table plus a
span answer key, so a run on the sample can be scored for recall and precision.

    pip install pyarrow
    curl -L -o /tmp/nemotron-test.parquet \
      https://huggingface.co/datasets/nvidia/Nemotron-PII/resolve/main/data/test-00000-of-00001.parquet
    python3 scripts/build-nemotron-sample.py /tmp/nemotron-test.parquet
"""

import ast
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

import pyarrow.parquet as pq

OUT = Path(__file__).resolve().parent.parent / "public/samples/nemotron-pii"
DOCS = 40
DOMAINS = {"Health", "Healthcare Providers"}
# Payment and HR documents also appear under the healthcare domains; the sample is about patients.
OFF_TOPIC = re.compile(r"credit|debit|cvv|bic|swift|pin reset|loan|payment|employment|biometric access", re.I)


def main(path: str) -> None:
    rows = pq.read_table(path).to_pylist()
    picked: dict[str, dict] = {}
    # Stable pseudo-random order, so rebuilding gives the same sample.
    for r in sorted(rows, key=lambda r: hashlib.sha1(r["uid"].encode()).hexdigest()):
        kind = r["document_type"].strip().lower()
        if r["domain"] not in DOMAINS or r["locale"] != "us" or OFF_TOPIC.search(kind) or kind in picked:
            continue
        if not 200 <= len(r["text"]) <= 1800 or "\r" in r["text"] or any(ord(c) > 0xFFFF for c in r["text"]):
            continue  # offsets must match JavaScript string indices after the CSV round trip
        spans = [(s["start"], s["end"], s["label"]) for s in ast.literal_eval(r["spans"])]
        if len(spans) < 3:
            continue
        picked[kind] = {**r, "spans": spans}

    docs = sorted(picked.values(), key=lambda r: hashlib.sha1(r["uid"].encode()).hexdigest())[:DOCS]
    OUT.mkdir(parents=True, exist_ok=True)
    records = {}
    with open(OUT / "documents.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["doc_id", "document_type", "document_format", "text"])
        for i, r in enumerate(docs, 1):
            doc_id = f"NP{i:03d}"
            w.writerow([doc_id, r["document_type"], r["document_format"], r["text"]])
            records[doc_id] = {"uid": r["uid"], "spans": [{"start": s, "end": e, "label": l} for s, e, l in r["spans"]]}

    key = {
        "source": "nvidia/Nemotron-PII",
        "url": "https://huggingface.co/datasets/nvidia/Nemotron-PII",
        "license": "CC BY 4.0",
        "split": "test",
        "table": "documents",
        "column": "text",
        "records": records,
    }
    (OUT / "answer_key.json").write_text(json.dumps(key, indent=1) + "\n", encoding="utf-8")
    print(f"{len(docs)} documents, {sum(len(r['spans']) for r in records.values())} spans -> {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
