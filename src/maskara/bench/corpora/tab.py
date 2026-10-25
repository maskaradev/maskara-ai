"""Text Anonymization Benchmark (Pilán et al., 2022): ECHR court cases annotated by hand. MIT.

Real text with real annotations. Each document may have several annotators; mentions carry an
entity id, so consistency across mentions of the same person can be scored. Legal domain only.
"""

from __future__ import annotations

import json

from ..types import Document, Span
from ._fetch import fetch

COMMIT = "558e09e26d6b36f5f78440074e6a233946d98bd9"
FILES = {
    "test": ("echr_test.json", "cd0f0f15f84a8739654c7cf30c6be8ce27b051ef73974d39d792a0cb8c846379"),
}
CATEGORY = {
    "PERSON": "PERSON", "CODE": "ID", "LOC": "LOCATION", "ORG": "ORG", "DEM": "DEMOGRAPHIC",
    "DATETIME": "DATE", "QUANTITY": "QUANTITY", "MISC": "OTHER",
}
TIER = {"DIRECT": "direct", "QUASI": "quasi", "NO_MASK": "none"}

INFO = {
    "name": "tab",
    "source": "https://github.com/NorskRegnesentral/text-anonymization-benchmark",
    "license": "MIT",
    "realism": "real text, human annotation",
    "caveats": "legal domain only; mostly European names; annotators disagree, so scores average over them",
}


def load(split: str = "test", limit: int | None = None) -> list[Document]:
    name, sha = FILES[split]
    url = f"https://raw.githubusercontent.com/NorskRegnesentral/text-anonymization-benchmark/{COMMIT}/{name}"
    raw = json.loads(fetch(url, f"tab/{name}", sha).read_text())
    docs = []
    for d in raw:
        annotations = {
            annotator: [
                Span(
                    start=m["start_offset"], end=m["end_offset"], label=m["entity_type"],
                    category=CATEGORY[m["entity_type"]], tier=TIER[m["identifier_type"]],
                    entity=m["entity_id"],
                )
                for m in a["entity_mentions"]
            ]
            for annotator, a in sorted(d["annotations"].items())
        }
        docs.append(Document(id=d["doc_id"], text=d["text"], annotations=annotations))
    return docs[:limit]
