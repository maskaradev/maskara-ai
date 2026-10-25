"""Shared shapes for benchmark corpora, system outputs, and scores.

Offsets are Python string indices (code points), end-exclusive, into `Document.text`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# How a gold mention should be treated.
#   direct: identifies a person on its own (name, email, account id); must not survive.
#   quasi:  identifies in combination (date, city, age, employer); a policy may keep or generalize it.
#   none:   annotated but should stay as written (TAB's NO_MASK).
Tier = Literal["direct", "quasi", "none"]

# Coarse categories shared by every corpus, so scores can be broken down the same way everywhere.
Category = Literal[
    "PERSON", "CONTACT", "ADDRESS", "LOCATION", "DATE", "ID", "FINANCIAL", "CREDENTIAL",
    "NETWORK", "ORG", "DEMOGRAPHIC", "QUANTITY", "OTHER",
]


@dataclass(frozen=True)
class Span:
    start: int
    end: int
    label: str          # the corpus's own label, kept for per-label breakdowns
    category: Category
    tier: Tier
    entity: str | None = None  # mentions with the same entity id refer to the same real thing


@dataclass(frozen=True)
class Document:
    id: str
    text: str
    # Annotator id -> spans. Most corpora have one annotation; TAB has several per document.
    annotations: dict[str, list[Span]]
    meta: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Edit:
    """Replace `text[start:end]` of the original with `replacement`."""

    start: int
    end: int
    replacement: str


@dataclass(frozen=True)
class Output:
    text: str
    edits: list[Edit]


def apply_edits(text: str, edits: list[Edit]) -> str:
    """Applies non-overlapping edits; raises if they overlap."""
    out, pos = [], 0
    for e in sorted(edits, key=lambda e: (e.start, e.end)):
        if e.start < pos:
            raise ValueError(f"overlapping edit at {e.start}")
        out.append(text[pos:e.start])
        out.append(e.replacement)
        pos = e.end
    out.append(text[pos:])
    return "".join(out)


def make_output(text: str, edits: list[Edit]) -> Output:
    return Output(text=apply_edits(text, edits), edits=sorted(edits, key=lambda e: e.start))
