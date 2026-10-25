"""Scores a system's edits against gold spans.

Privacy
  leak_full     share of gold mentions whose every word survives unchanged
  leak_partial  share with some but not all words unchanged (a first name kept, a year kept)
  residual      share of gold word characters that survive
  entity_leak   share of entities with at least one fully leaked mention (TAB's entity-level view)

Fidelity
  consistency   mentions of the same thing get the same replacement (B-cubed recall)
  distinctness  mentions of different things get different replacements (B-cubed precision)
  placeholder   share of replaced mentions turned into a placeholder like [PERSON] or ***
  over_masking  share of word characters outside every gold span that were changed

A word counts as unchanged when no edit touches it, or when the edit that replaced it writes the
same word back (a date shift that keeps the year keeps that word). Inside gold mentions, honorifics
and function words ("Mr", "the", "of") are not counted: TAB spans often start with "Mr", and keeping
it alone identifies no one. Nor is format scaffolding that a well-formed surrogate must write back
("https", "com", "Avenue"): 'lwang46@example.com' for 'wburns11@gmail.com' keeps "com" and leaks nothing.
The same goes for a code that opens a mention and is followed by digits: the record type in
'CUS-164301' and the country code in '1-667-604-1966' say nothing about whose record it is. Consistency and distinctness are measured over replaced mentions only,
so a system that changes nothing gets no score there.

Entity ids are taken to mean one thing within a document, so mentions are paired (and entities
counted for entity_leak) per document. A document whose `meta["entity_scope"]` is "corpus" has ids
that hold across documents; its mentions are pooled with every other such document, so a person who
gets a different name in each document is not consistent.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from .types import Document, Edit, Output, Span

WORD = re.compile(r"\w+")
PLACEHOLDER = re.compile(
    r"^\W*$|[\[<{]\s*[A-Za-z][A-Za-z0-9_ ]*\s*[\]>}]|\*{3,}|█|X{4,}|#{3,}|redacted|masked", re.IGNORECASE
)
SCORED_TIERS = ("direct", "quasi")
UNINFORMATIVE = frozenset(
    ["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "madam", "the", "a", "an", "of", "and", "at", "in", "on"]
    # URL and email scaffolding. Second-level domains ("gmail") still count.
    + ["http", "https", "www", "com", "org", "net", "edu", "gov", "io", "html", "php"]
    # Street types and unit words; the number and street name carry the identity.
    + ["street", "st", "avenue", "ave", "road", "rd", "way", "lane", "ln", "drive", "boulevard", "blvd", "court",
       "ct", "place", "pl", "terrace", "ter", "trail", "trl", "circle", "cir", "parkway", "pkwy", "highway", "hwy",
       "apt", "suite", "ste", "unit"]
)
# At the start of a mention: 'CUS-', 'ORD-', '1-', '+1 ' before a digit.
LEADING_CODE = re.compile(r"\+?([A-Z]{2,4}|1)[-. ](?=\d)")


def _norm(s: str) -> str:
    return " ".join(s.lower().split())


def _overlapping(edits: list[Edit], start: int, end: int) -> list[Edit]:
    return [e for e in edits if e.start < end and e.end > start]


def _surrogate(text: str, span: Span, edits: list[Edit]) -> str:
    """What the span's text became in the output."""
    parts, pos = [], span.start
    for e in _overlapping(edits, span.start, span.end):
        if e.start > pos:
            parts.append(text[pos:e.start])
        parts.append(e.replacement)
        pos = max(pos, e.end)
    if pos < span.end:
        parts.append(text[pos:span.end])
    return "".join(parts)


def _kept_words(text: str, start: int, end: int, edits: list[Edit],
                skip_uninformative: bool = True) -> tuple[int, int]:
    """(kept chars, total chars) over the words in text[start:end]."""
    kept = total = 0
    code = LEADING_CODE.match(text, start, end) if skip_uninformative else None
    for m in WORD.finditer(text, start, end):
        if skip_uninformative and m.group().lower() in UNINFORMATIVE:
            continue
        if code and m.start() == code.start(1):
            continue
        total += len(m.group())
        touching = _overlapping(edits, m.start(), m.end())
        if not touching:
            kept += len(m.group())
            continue
        written = {w.lower() for e in touching for w in WORD.findall(e.replacement)}
        if m.group().lower() in written:
            kept += len(m.group())
    return kept, total


@dataclass
class Tally:
    """Weighted counts; each document adds up to weight 1 however many annotators it has."""

    mentions: float = 0.0
    leak_full: float = 0.0
    leak_partial: float = 0.0
    kept_chars: float = 0.0
    total_chars: float = 0.0
    entities: float = 0.0
    entities_leaked: float = 0.0

    def add(self, other: Tally, w: float) -> None:
        for k in self.__dataclass_fields__:
            setattr(self, k, getattr(self, k) + w * getattr(other, k))

    def summary(self) -> dict:
        div = lambda a, b: round(a / b, 4) if b else None
        return {
            "mentions": round(self.mentions, 1),
            "leak_full": div(self.leak_full, self.mentions),
            "leak_partial": div(self.leak_partial, self.mentions),
            "residual": div(self.kept_chars, self.total_chars),
            "entity_leak": div(self.entities_leaked, self.entities),
        }


@dataclass
class Fidelity:
    replaced: float = 0.0
    placeholder: float = 0.0
    bcubed_p: float = 0.0
    bcubed_r: float = 0.0
    bcubed_n: float = 0.0
    outside_changed: float = 0.0
    outside_total: float = 0.0
    keep_spans: float = 0.0
    keep_spans_changed: float = 0.0
    by_label: dict = field(default_factory=lambda: defaultdict(lambda: [0.0, 0.0]))


def _bcubed(keys: list[tuple[object, object, float]]) -> tuple[float, float, float]:
    """Summed B-cubed precision, recall and weight for weighted (gold key, system key) pairs."""
    gold, system, both = defaultdict(float), defaultdict(float), defaultdict(float)
    for g, s, w in keys:
        gold[g] += w
        system[s] += w
        both[(g, s)] += w
    p = sum(w * both[(g, s)] / system[s] for g, s, w in keys)
    r = sum(w * both[(g, s)] / gold[g] for g, s, w in keys)
    return p, r, sum(w for _, _, w in keys)


def _score_annotation(doc: Document, spans: list[Span], edits: list[Edit], fid: Fidelity, w: float,
                      by_tier: dict[str, Tally], group: object, pairs: list, entities: dict) -> None:
    """Adds privacy counts to `by_tier`, and entity outcomes and mention pairs under `group`."""
    for sp in spans:
        if sp.tier == "none":
            fid.keep_spans += w
            if _overlapping(edits, sp.start, sp.end):
                fid.keep_spans_changed += w
            continue
        kept, total = _kept_words(doc.text, sp.start, sp.end, edits)
        if total == 0:
            continue
        t = by_tier[sp.tier]
        full, partial = kept == total, 0 < kept < total
        t.mentions += w
        t.leak_full += w * full
        t.leak_partial += w * partial
        t.kept_chars += w * kept
        t.total_chars += w * total
        label = fid.by_label[f"{sp.tier}:{sp.category}"]
        label[0] += w
        label[1] += w * full
        if sp.entity is not None:
            key = (group, sp.tier, sp.entity)
            entities[key] = (entities.get(key, (False, w))[0] or full, w)
        if not full:
            surrogate = _surrogate(doc.text, sp, edits)
            fid.replaced += w
            fid.placeholder += w * bool(PLACEHOLDER.search(surrogate))
            if sp.entity is not None:
                pairs.append(((sp.entity, _norm(doc.text[sp.start:sp.end])), _norm(surrogate), w))


def _outside(doc: Document, edits: list[Edit], fid: Fidelity) -> None:
    """Over-masking: words outside every annotator's spans that the system changed."""
    covered = sorted((sp.start, sp.end) for spans in doc.annotations.values() for sp in spans)
    pos, gaps = 0, []
    for s, e in covered:
        if s > pos:
            gaps.append((pos, s))
        pos = max(pos, e)
    gaps.append((pos, len(doc.text)))
    for s, e in gaps:
        kept, total = _kept_words(doc.text, s, e, edits, skip_uninformative=False)
        fid.outside_changed += total - kept
        fid.outside_total += total


def score(docs: list[Document], outputs: dict[str, Output]) -> dict:
    by_tier = {tier: Tally() for tier in SCORED_TIERS}
    fid = Fidelity()
    pairs: dict[object, list] = defaultdict(list)    # pairing group -> mention pairs
    entities: dict[tuple, tuple[bool, float]] = {}  # (group, tier, entity) -> (leaked, weight)
    for doc in docs:
        edits = outputs[doc.id].edits
        w = 1 / max(len(doc.annotations), 1)
        for annotator, spans in doc.annotations.items():
            group = annotator if doc.meta.get("entity_scope") == "corpus" else (doc.id, annotator)
            _score_annotation(doc, spans, edits, fid, w, by_tier, group, pairs[group], entities)
        _outside(doc, edits, fid)
    for (_, tier, _), (leaked, w) in entities.items():
        by_tier[tier].entities += w
        by_tier[tier].entities_leaked += w * leaked
    for group_pairs in pairs.values():
        if group_pairs:
            p, r, n = _bcubed(group_pairs)
            fid.bcubed_p += p
            fid.bcubed_r += r
            fid.bcubed_n += n

    div = lambda a, b: round(a / b, 4) if b else None
    return {
        "documents": len(docs),
        "privacy": {tier: t.summary() for tier, t in by_tier.items()},
        "fidelity": {
            "consistency": div(fid.bcubed_r, fid.bcubed_n),
            "distinctness": div(fid.bcubed_p, fid.bcubed_n),
            "placeholder": div(fid.placeholder, fid.replaced),
            "over_masking": div(fid.outside_changed, fid.outside_total),
            "keep_spans_changed": div(fid.keep_spans_changed, fid.keep_spans),
        },
        "leak_by_category": {k: {"mentions": round(n, 1), "leak_full": div(leaked, n)}
                             for k, (n, leaked) in sorted(fid.by_label.items())},
    }
