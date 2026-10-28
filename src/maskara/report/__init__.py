"""maskara report: did the output leak, and did it stay useful? (v0-design §4.1–4.2)

    result = maskara.mask(...)
    result.report.summary()            # text, the headline numbers first
    result.report.to_dict()            # JSON-ready; `result.save(out)` writes report.json + report.html
    result.report.to_html("report.html")

Built inside `mask()` from the originals still in memory, and holding none of them: counts, shares,
column names and locations only. Nothing here needs gold labels; detection recall does, and is
`maskara bench`'s job. Each section states what it measured and what it could not, and
`not_measured` lists the blind spots of the run as a whole.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .. import __version__
from . import metrics
from .metrics import Run

SCHEMA = "maskara.report/1"


class Report:
    def __init__(self, data: dict):
        self.data = data

    @classmethod
    def load(cls, path: str | os.PathLike) -> Report:
        """A report saved by `MaskResult.save` (report.json), or the directory holding it."""
        path = Path(path)
        if path.is_dir():
            path = path / "report.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("schema") != SCHEMA:
            raise ValueError(f"{path} is not a maskara report ({SCHEMA})")
        return cls(data)

    @property
    def headline(self) -> dict:
        return self.data["headline"]

    def to_dict(self) -> dict:
        return self.data

    def to_json(self, path: str | os.PathLike | None = None) -> str:
        text = json.dumps(self.data, indent=2, ensure_ascii=False)
        if path is not None:
            Path(path).write_text(text + "\n", encoding="utf-8")
        return text

    def to_html(self, path: str | os.PathLike | None = None) -> str:
        """One self-contained page (no external assets); written to `path` when given."""
        from .html import page

        html = page(self.data)
        if path is not None:
            Path(path).write_text(html, encoding="utf-8")
        return html

    def summary(self) -> str:
        return summary(self.data)

    def __repr__(self) -> str:
        h = self.headline
        return f"<Report originals_found={h['originals_found']} broken_joins={h['broken_joins']}>"


def build(run: Run, *, preset: str, detectors: list[str]) -> Report:
    privacy = {"reappearance": metrics.reappearance(run), "quasi_identifiers": metrics.quasi_identifiers(run),
               "detections": metrics.detections(run)}
    fidelity = {"schema": metrics.schema(run), "joins": metrics.joins(run), "date_gaps": metrics.date_gaps(run),
                "distributions": metrics.distributions(run), "formats": metrics.formats(run),
                "placeholders": metrics.placeholders(run), "non_pii": metrics.non_pii(run)}
    re_, qi, gaps = privacy["reappearance"], privacy["quasi_identifiers"], fidelity["date_gaps"]
    unique = [t.get("unique_share") for t in qi["tables"].values() if t.get("unique_share") is not None]
    linkage = [t["linkage"]["rate"] for t in qi["tables"].values() if t["linkage"]["rate"] is not None]
    headline = {
        "originals_found": re_["found"], "originals_partial": re_["partial"], "originals_scanned": re_["scanned"],
        "broken_joins": fidelity["joins"]["broken"], "joins_checked": fidelity["joins"]["checked"],
        "date_gaps_exact": gaps["exact_share"], "date_gaps_checked": gaps["pairs"],
        "format_valid": fidelity["formats"]["share"], "placeholder_share": fidelity["placeholders"]["share"],
        "non_pii_changed": fidelity["non_pii"]["share"], "schema_ok": fidelity["schema"]["ok"],
        "replaced": privacy["detections"]["replaced"],
        "personas": len({m.persona for m in run.mentions if m.persona}),
        "unlinked": privacy["detections"]["unlinked"]["mentions"],
        "identity_review": privacy["detections"]["identity"]["review_mentions"],
        "max_unique_share": max(unique) if unique else None, "max_linkage_rate": max(linkage) if linkage else None,
    }
    return Report({
        "schema": SCHEMA, "maskara": __version__, "preset": preset, "detectors": detectors,
        "inputs": {s.name: {"kind": s.kind, "rows": len(s.rows), "columns": run.roles[s.name]} for s in run.sources},
        "headline": headline, "privacy": privacy, "fidelity": fidelity,
        "not_measured": _not_measured(detectors, re_),
    })


def _not_measured(detectors: list[str], re_: dict) -> list[str]:
    models = [d for d in detectors if d not in ("rules", "known")]
    found_by = " + ".join(detectors)
    return [
        f"PII no detector found ({found_by}). Without gold labels recall is unknown, and a value nobody found "
        "is neither replaced nor searched for." + ("" if models else " No model ran, so names in free text "
                                                    "with no table entry, title or greeting are likely missed."),
        "Quasi-identifiers in free text (job titles, employers, rare events) and in columns kept as they are.",
        f"Values shorter than {metrics.MIN_LEN} characters in the re-appearance scan ({re_['skipped_short']} skipped).",
        ("Whether replacements fit their context, and downstream utility (Entity QA, fine-tune parity): "
        "`maskara bench`."),
        ("Linkage across releases: two outputs masked with different vault keys could be matched on what they "
        "kept; not simulated."),
        "Correctness of inferred identities and shared-event ownership; review counts are not accuracy scores.",
    ]


# -- text -------------------------------------------------------------------------------------------

def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{100 * x:.1f}%"


def headline_lines(data: dict) -> list[tuple[str, str]]:
    """The few numbers worth printing first, as (label, value) pairs."""
    h = data["headline"]
    partial = f", {h['originals_partial']} partial" if h["originals_partial"] else ""
    lines = [
        ("originals", (f"{h['originals_found']} of {h['originals_scanned']} known identifiers found in the output"
                      f"{partial}")),
        ("joins", f"{h['broken_joins']} broken of {h['joins_checked']} that joined before"),
        ("date gaps", f"{_pct(h['date_gaps_exact'])} exact over {h['date_gaps_checked']} per-person gaps"),
        ("formats", f"{_pct(h['format_valid'])} of replaced emails, phones, dates and cards still parse"),
    ]
    if h["max_unique_share"] is not None:
        lines.append(("k-anonymity", f"{_pct(h['max_unique_share'])} of rows unique on the quasi-identifiers kept"))
    if "identity_review" in h:
        lines.append(("review", f"{h['identity_review']} ownership decisions need review (review.json)"))
    return lines


def summary(data: dict) -> str:
    p, f = data["privacy"], data["fidelity"]
    width = 12
    row = lambda k, v: f"    {k:<{width}}  {v}"
    lines = [f"maskara report (preset {data['preset']}, detectors {' + '.join(data['detectors'])})", "", "headline"]
    lines += [row(k, v) for k, v in headline_lines(data)]
    re_ = p["reappearance"]
    lines += ["", "privacy",
              row("reappeared", f"exact {re_['exact']}, normalized {re_['normalized']}, partial {re_['partial']} "
                                f"of {re_['scanned']} scanned ({re_['skipped_short']} too short)")]
    for name, t in p["quasi_identifiers"]["tables"].items():
        k = f"kept {', '.join(t['kept'])}: min k {t['min_k']}, unique {_pct(t['unique_share'])}" if t["kept"] \
            else "no quasi-identifier kept"
        lines.append(row(name, f"{k}; linkage on {', '.join(t['columns'])}: {_pct(t['linkage']['rate'])} re-identified"))
    d = p["detections"]
    cats = ", ".join(f"{c.lower()} {n}" for c, n in sorted(d["by_category"].items(), key=lambda kv: -kv[1]))
    lines += [row("replaced", f"{d['replaced']} ({cats}); {d['kept_by_policy']} kept by policy"),
              row("unlinked", f"{d['unlinked']['mentions']} person-bound values tied to no known person")]
    j, g, fm, n = f["joins"], f["date_gaps"], f["formats"], f["non_pii"]
    lines += ["", "fidelity",
              row("schema", "rows and columns unchanged" if f["schema"]["ok"] else "CHANGED: see schema.tables"),
              row("joins", f"{len(j['pairs'])} id joins, {j['checked']} rows checked, {j['broken']} broken, "
                           f"{j['spurious']} spurious; text ids {j['text_refs']['broken']} broken of "
                           f"{j['text_refs']['checked']}"),
              row("date gaps", f"{g['exact']} of {g['pairs']} exact, max error {g['max_error_days']} days "
                               f"({g['people']} people)"),
              row("formats", ", ".join(f"{k} {v['valid']}/{v['checked']}" for k, v in fm["kinds"].items()) or "none"),
              row("placeholder", _pct(f["placeholders"]["share"])),
              row("non-PII", f"{n['text_chars_changed']} of {n['text_chars']} text characters outside replaced "
                             f"spans changed, {n['kept_cells_changed']} of {n['kept_cells']} kept cells")]
    dist = f["distributions"]["columns"]
    if dist:
        lines.append(row("distance", ", ".join(f"{c['table']}.{c['column']} {c['test']} {c['value']:.3f}"
                                               for c in dist)))
    lines += ["", "not measured"] + [f"    - {x}" for x in data["not_measured"]]
    return "\n".join(lines)


__all__ = ["SCHEMA", "Report", "Run", "build", "headline_lines", "summary"]
