"""The run bundle: one JSON document the UI renders, holding a run's before, after, audit and report.

Schema `maskara.bundle/1`:

    schema      "maskara.bundle/1"
    meta        maskara (version), preset, detectors, notices,
                originals   true when `rows[*].before` and `personas[*].original` hold original values
                synthetic   true for the bundled sample data (safe to publish), false for user data
                title       a label for the run; seed: the public seed, or null for a private vault
    inputs      [{name, kind: 'table'|'texts', file: base name or null, rows, subject: column or null,
                  columns: [{name, role, category: report category or null}]}]
    rows        {input: {after: [[cell, ...], ...], before: [[...]] or null}}: cells in `columns` order,
                JSON scalars (str, number, bool, null)
    mentions    {fields: [...], rows: [[...], ...]}: the `Mention` audit as arrays, without
                `replacement` (it is the after cell, or after[out_start:out_end] for text spans).
                Offsets are code points, as in `Mention`.
    personas    [{id, name, sex, age, email, phone, street, city, state, zip, occupation,
                  original: the person's original name or null, mentions: count, inputs: {input: count}}]
    report      `Report.to_dict()`; report_html: the report as an HTML fragment (`report.html.fragment`)

A bundle with originals is as sensitive as the input itself: the local UI keeps it in memory and
never writes it. Only the export of the synthetic sample data puts one on disk.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime

from .. import __version__
from ..api import MaskResult
from ..report.html import fragment
from ..transform import ROLE_CATEGORY

SCHEMA = "maskara.bundle/1"
MENTION_FIELDS = ("source", "row", "column", "start", "end", "out_start", "out_end", "category", "label",
                  "detector", "score", "persona", "link", "changed")


def _scalar(value: object) -> object:
    if value is None or isinstance(value, (str, bool, int, float)):
        return None if isinstance(value, float) and value != value else value  # noqa: PLR0124 - NaN -> null
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _rows(rows: list[dict], columns: list[str]) -> list[list]:
    return [[_scalar(r.get(c)) for c in columns] for r in rows]


def build(result: MaskResult, *, originals: bool, synthetic: bool = False, title: str = "",
          seed: str | None = None) -> dict:
    """The bundle for `result`. `originals=False` leaves every original value out (after only)."""
    if result.report is None:
        raise ValueError("this result has no report; bundles are built from `mask()` results")
    inputs, rows = [], {}
    for src in result._sources:
        masked = (result.tables if src.kind == "table" else result.texts)[src.name]
        after = masked.to_dict("records") if src.form == "dataframe" else \
            [{"text": t} for t in masked.tolist()] if src.form == "series" else \
            [{"text": t} if isinstance(t, str) else t for t in masked]
        roles = result.columns[src.name]
        inputs.append({
            "name": src.name, "kind": src.kind, "file": src.path.name if src.path else None, "rows": len(src.rows),
            "subject": result._subjects.get(src.name),
            "columns": [{"name": c, "role": roles.get(c, "keep"), "category": ROLE_CATEGORY.get(roles.get(c))}
                        for c in src.columns],
        })
        rows[src.name] = {"after": _rows(after, src.columns),
                          "before": _rows(src.rows, src.columns) if originals else None}
    return {
        "schema": SCHEMA,
        "meta": {"maskara": __version__, "preset": result.preset, "detectors": result.detectors,
                 "notices": result.notices, "originals": originals, "synthetic": synthetic, "title": title,
                 "seed": seed},
        "inputs": inputs,
        "rows": rows,
        "mentions": {"fields": list(MENTION_FIELDS),
                     "rows": [[getattr(m, f) for f in MENTION_FIELDS] for m in result.mentions]},
        "personas": _personas(result, originals),
        "report": result.report.to_dict(),
        "report_html": fragment(result.report.to_dict()),
    }


def _personas(result: MaskResult, originals: bool) -> list[dict]:
    counts: dict[str, Counter] = defaultdict(Counter)
    for m in result.mentions:
        if m.persona:
            counts[m.persona][m.source] += 1
    names = _original_names(result) if originals else {}
    out = []
    for pid, fields in result._personas.items():
        if pid not in counts:
            continue  # a persona drawn only for a value's own replacement
        out.append({"id": pid, **{k: _scalar(v) for k, v in fields.items()}, "original": names.get(pid),
                    "mentions": sum(counts[pid].values()), "inputs": dict(counts[pid])})
    # People seen in the most inputs first: they show the same persona across tables and texts best.
    return sorted(out, key=lambda p: (-len(p["inputs"]), -p["mentions"]))


def _original_names(result: MaskResult) -> dict[str, str]:
    """Persona id -> the original person's name, from a name column, first + last, or a text span."""
    by_name = {s.name: s for s in result._sources}
    parts: dict[tuple, dict] = defaultdict(dict)
    names: dict[str, str] = {}
    for m in result.mentions:
        if not m.persona or m.category != "PERSON" or m.persona in names:
            continue
        cell = by_name[m.source].rows[m.row].get(m.column)
        if m.start is None:
            if m.label == "name":
                names[m.persona] = str(cell)
            elif m.label in ("first_name", "last_name"):
                got = parts[(m.persona, m.source, m.row)]
                got[m.label] = str(cell)
                if len(got) == 2:
                    names[m.persona] = f"{got['first_name']} {got['last_name']}"
    for m in result.mentions:
        if m.persona and m.persona not in names and m.start is not None and m.label in ("full_name", "person"):
            names[m.persona] = str(by_name[m.source].rows[m.row].get(m.column))[m.start:m.end]
    return names
