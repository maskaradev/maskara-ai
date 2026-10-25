"""The hero chart: privacy against utility, one point per system, from saved runs.

  x  share of direct mentions hidden, 1 - direct leak_full (right is more private)
  y  Entity QA accuracy with the linking reader (up keeps more cross-document information)

  python -m maskara.bench.hero [--corpus linked] [--runs runs]

Every system with `runs/<corpus>--<system>.json` and saved outputs becomes a point, so a new
system shows up as soon as `maskara bench` has run it. Writes `runs/hero-<corpus>.json`, `.csv`
and a self-contained `.svg`.
"""

from __future__ import annotations

import argparse
import csv
import json
from html import escape
from pathlib import Path

from . import corpora
from .qa_runner import KINDS, evaluate, systems_with_outputs

COLUMNS = ("system", "private", "direct_leak", "direct_partial", "residual", "entity_leak", "consistency",
           "distinctness", "placeholder", "over_masking", "qa_accuracy", "qa_correct", "qa_questions")


def points(runs: Path, corpus: str) -> dict:
    out = []
    for system in systems_with_outputs(runs, corpus):
        row = json.loads((runs / f"{corpus}--{system}.json").read_text())
        direct, fid = row["scores"]["privacy"]["direct"], row["scores"]["fidelity"]
        qa = evaluate(runs, corpus, system)
        out.append({
            "system": system, "private": round(1 - direct["leak_full"], 4), "direct_leak": direct["leak_full"],
            "direct_partial": direct["leak_partial"], "residual": direct["residual"],
            "entity_leak": direct["entity_leak"], **{k: fid[k] for k in COLUMNS[6:10]},
            "qa_accuracy": qa["accuracy"], "qa_correct": qa["correct"], "qa_questions": qa["questions"],
            "qa_by_kind": {k: qa["by_kind"][k] for k in KINDS}, "documents": row["documents"],
        })
    if len({(p["documents"], p["qa_questions"]) for p in out}) > 1:
        raise SystemExit(f"runs for {corpus} cover different documents; rerun them with the same --limit")
    info = corpora.CORPORA[corpus].INFO
    return {
        "corpus": corpus, "realism": info["realism"], "documents": out[0]["documents"],
        "questions": out[0]["qa_questions"], "reader": "linking (deterministic, no LLM; joins on equal strings)",
        "x": "1 - direct leak_full: share of direct-identifier mentions with some word changed",
        "y": "Entity QA accuracy, linking reader", "points": out,
    }


W, H = 680, 500
LEFT, RIGHT, TOP, BOTTOM = 70, 30, 78, 62
STYLE = """
  .bg { fill: #fcfcfb } .ink { fill: #0b0b0b } .muted { fill: #52514e } .grid { stroke: #e4e3df }
  .axis { stroke: #8a8984 } .lead { stroke: #8a8984 } .ring { stroke: #fcfcfb }
  .base { fill: #8a8984 } .ours { fill: #2a78d6 }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #1a1a19 } .ink { fill: #f0efec } .muted { fill: #c3c2b7 } .grid { stroke: #33332f }
    .axis, .lead { stroke: #8a8984 } .ring { stroke: #1a1a19 } .base { fill: #a3a29b } .ours { fill: #3987e5 }
  }
  text { font: 12px system-ui, -apple-system, sans-serif }
  .title { font-size: 16px; font-weight: 600 } .label { font-size: 12px }
"""


def _text(x: float, y: float, s: str, cls: str = "muted", extra: str = "") -> str:
    return f'<text class="{cls}" x="{x}" y="{y}"{extra}>{escape(s)}</text>'


def _label_line(x0: float, width: float, y: float, top: float, bottom: float, placed: list) -> float:
    """The baseline nearest to `y`, alternating up and down, whose label box overlaps none placed."""
    for i in range(40):
        ly = y + 15 * ((i + 1) // 2) * (-1) ** i
        if top <= ly <= bottom and not any(a < x0 + width and x0 < b and abs(ly - base) < 15
                                           for a, b, base in placed):
            return ly
    return y


def svg(data: dict) -> str:
    pw, ph = W - LEFT - RIGHT, H - TOP - BOTTOM
    px = lambda v: LEFT + v * pw
    py = lambda v: TOP + (1 - v) * ph
    title = f"Privacy vs. cross-document utility: maskara-{data['corpus']}"
    subtitle = (f"Synthetic corpus, {data['documents']} documents, {data['questions']} questions, "
                "linking reader (no LLM). Up and right is better.")
    parts = [
        (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-label="{escape(title)}">'),
        f"<style>{STYLE}</style>",
        f'<rect class="bg" width="{W}" height="{H}"/>',
        _text(LEFT, 28, title, "ink title"),
        _text(LEFT, 48, subtitle),
    ]
    for t in (0, 0.25, 0.5, 0.75, 1):
        parts += [f'<line class="grid" x1="{LEFT}" x2="{LEFT + pw}" y1="{py(t)}" y2="{py(t)}"/>',
                  f'<line class="grid" x1="{px(t)}" x2="{px(t)}" y1="{TOP}" y2="{TOP + ph}"/>',
                  _text(LEFT - 8, py(t) + 4, f"{t:.0%}", extra=' text-anchor="end"'),
                  _text(px(t), TOP + ph + 18, f"{t:.0%}", extra=' text-anchor="middle"')]
    parts += [f'<line class="axis" x1="{LEFT}" x2="{LEFT + pw}" y1="{TOP + ph}" y2="{TOP + ph}"/>',
              _text(LEFT + pw / 2, H - 16, "Direct identifiers hidden (1 - direct leak rate)",
                    extra=' text-anchor="middle"'),
              _text(0, 0, "Entity QA accuracy",
                    extra=f' transform="translate(18 {TOP + ph / 2}) rotate(-90)" text-anchor="middle"')]
    placed: list[tuple[float, float, float]] = []  # label boxes: x0, x1, baseline
    for p in sorted(data["points"], key=lambda p: -p["qa_accuracy"]):
        x, y = px(p["private"]), py(p["qa_accuracy"])
        label = f"{p['system']} ({p['qa_accuracy']:.0%})"
        width = 6.6 * len(label)
        left = x > LEFT + pw * 0.7
        x0 = x - 10 - width if left else x + 10
        ly = _label_line(x0, width, y + 4, TOP, TOP + ph - 6, placed)
        placed.append((x0, x0 + width, ly))
        if ly != y + 4:
            parts.append(f'<line class="lead" x1="{x}" y1="{y}" x2="{x0 + (width if left else 0)}" y2="{ly - 4}"/>')
        tip = (f"{p['system']}: {p['private']:.1%} hidden, QA {p['qa_correct']}/{p['qa_questions']}, "
               f"consistency {_pct(p['consistency'])}, distinctness {_pct(p['distinctness'])}")
        kind = "ours" if p["system"].startswith("maskara") else "base"
        circle = f'<circle class="{kind} ring" cx="{x}" cy="{y}" r="5" stroke-width="2">'
        parts += [f"{circle}<title>{escape(tip)}</title></circle>", _text(x0, ly, label, "ink label")]
    parts.append("</svg>")
    return "\n".join(parts) + "\n"

def _pct(v: float | None) -> str:
    return "n/a" if v is None else f"{v:.1%}"


# The public chart: the external corpora only (no Entity QA there, so distinctness stands in for
# utility, and is labelled as the proxy it is). System -> label; missing runs are skipped.
EXTERNAL = ("abcd", "nemotron-pii", "tab")
EXTERNAL_SYSTEMS = {
    "oracle-redact": "perfect detection + redact",
    "presidio-redact": "Presidio",
    "gliner2-redact": "GLiNER2-PII",
    "opf-redact": "OpenAI Privacy Filter",
    "presidio-fake-consistent": "Presidio + Faker",
    "maskara-gliner2": "maskara",
    "maskara-gliner2+echr": "maskara + echr pack",
}
EXTERNAL_TITLES = {"abcd": "ABCD: human-written support chats", "nemotron-pii": "Nemotron-PII: synthetic",
                   "tab": "TAB: real court cases"}
PANEL_W, PANEL_H, GAP = 300, 340, 56
XMIN = 0.4  # every system hides at least 49% on every corpus; from 0 the points pile into one corner


def external_points(runs: Path, corpus: str) -> dict:
    out = []
    for system, label in EXTERNAL_SYSTEMS.items():
        path = runs / f"{corpus}--{system}.json"
        if not path.exists() or (system.endswith("+echr") and corpus != "tab"):
            continue
        row = json.loads(path.read_text())
        direct, fid = row["scores"]["privacy"]["direct"], row["scores"]["fidelity"]
        out.append({"system": system, "label": label, "documents": row["documents"],
                    "private": round(1 - direct["leak_full"], 4), "direct_leak": direct["leak_full"],
                    "distinctness": fid["distinctness"], "consistency": fid["consistency"]})
    if len({p["documents"] for p in out}) > 1:
        raise SystemExit(f"runs for {corpus} cover different documents; rerun them with the same --limit")
    return {"corpus": corpus, "realism": corpora.CORPORA[corpus].INFO["realism"],
            "documents": out[0]["documents"], "points": out}


def svg_external(panels: list[dict]) -> str:
    w = LEFT + len(panels) * PANEL_W + (len(panels) - 1) * GAP + RIGHT
    h = TOP + 22 + PANEL_H + BOTTOM
    title = "Hide the identifiers, keep people apart"
    subtitle = ("Direct identifiers hidden (x) against distinctness (y): different people stay different "
                "after masking. Up and right is better. echr pack: the opt-in legal-echr pattern pack "
                "for case numbers.")
    parts = [
        (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
         f'aria-label="{escape(title)}">'),
        f"<style>{STYLE}</style>",
        f'<rect class="bg" width="{w}" height="{h}"/>',
        _text(LEFT, 28, title, "ink title"),
        _text(LEFT, 48, subtitle),
        _text(0, 0, "Distinctness (a proxy for utility)",
              extra=f' transform="translate(18 {TOP + 22 + PANEL_H / 2}) rotate(-90)" text-anchor="middle"'),
        _text(w / 2, h - 14, f"Direct identifiers hidden (1 - direct leak rate; axis starts at {XMIN:.0%})",
              extra=' text-anchor="middle"'),
    ]
    top = TOP + 22
    for i, data in enumerate(panels):
        x_left = LEFT + i * (PANEL_W + GAP)
        px = lambda v, x_left=x_left: x_left + (v - XMIN) / (1 - XMIN) * PANEL_W
        py = lambda v: top + (1 - v) * PANEL_H
        parts.append(_text(x_left, top - 10, f"{EXTERNAL_TITLES[data['corpus']]} ({data['documents']:,})",
                           "ink label"))
        for t in (XMIN, (1 + XMIN) / 2, 1):
            parts += [f'<line class="grid" x1="{px(t)}" x2="{px(t)}" y1="{top}" y2="{top + PANEL_H}"/>',
                      _text(px(t), top + PANEL_H + 18, f"{t:.0%}", extra=' text-anchor="middle"')]
        for t in (0, 0.5, 1):
            parts.append(f'<line class="grid" x1="{x_left}" x2="{x_left + PANEL_W}" y1="{py(t)}" y2="{py(t)}"/>')
            if i == 0:
                parts.append(_text(x_left - 8, py(t) + 4, f"{t:.0%}", extra=' text-anchor="end"'))
        parts.append(f'<line class="axis" x1="{x_left}" x2="{x_left + PANEL_W}" y1="{top + PANEL_H}" '
                     f'y2="{top + PANEL_H}"/>')
        pts = [(px(p["private"]), py(p["distinctness"] or 0), p) for p in data["points"]]
        # Points that coincide share one label, ours first.
        groups: list[list] = []
        for x, y, p in sorted(pts, key=lambda t: not t[2]["system"].startswith("maskara")):
            near = next((g for g in groups if abs(g[0][0] - x) < 8 and abs(g[0][1] - y) < 8), None)
            near.append((x, y, p)) if near else groups.append([(x, y, p)])
        boxes = [(x - 7, y - 7, x + 7, y + 7) for x, y, _ in pts]
        bounds = (x_left - (GAP - 8 if i else LEFT - 30), top - 2, x_left + PANEL_W + GAP / 2 - 4, top + PANEL_H - 2)
        for g in sorted(groups, key=lambda g: g[0][1]):
            x, y = g[0][0], g[0][1]
            label = " · ".join(p["label"] for _, _, p in g)
            parts.append(_place_label(x, y, label, boxes, bounds))
        for x, y, p in sorted(pts, key=lambda t: t[2]["system"].startswith("maskara")):  # ours on top
            tip = (f"{p['label']}: {p['direct_leak']:.1%} of direct identifiers leaked, "
                   f"distinctness {_pct(p['distinctness'])}, consistency {_pct(p['consistency'])}")
            kind = "ours" if p["system"].startswith("maskara") else "base"
            parts.append(f'<circle class="{kind} ring" cx="{x}" cy="{y}" r="5" stroke-width="2">'
                         f"<title>{escape(tip)}</title></circle>")
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def _place_label(x: float, y: float, label: str, boxes: list, bounds: tuple) -> str:
    """The label beside or under its point, else nudged up or down with a leader line, clear of `boxes`."""
    w = 6.6 * len(label)

    def fits(b):
        return (bounds[0] <= b[0] and b[2] <= bounds[2] and bounds[1] <= b[1] and b[3] <= bounds[3]
                and not any(b[0] < o[2] and o[0] < b[2] and b[1] < o[3] and o[1] < b[3] for o in boxes))

    for b in ((x + 10, y - 6, x + 10 + w, y + 6), (x - 10 - w, y - 6, x - 10, y + 6),
              (x + 2 - w, y + 9, x + 2, y + 21), (x - 2, y + 9, x - 2 + w, y + 21)):  # beside, then under
        if fits(b):
            boxes.append(b)
            return _text(b[0], b[3] - 2, label, "ink label")
    for d in (-14, 14, -28, 28, -42, 42, -56, 56):
        for b in ((x + 10, y - 6 + d, x + 10 + w, y + 6 + d), (x - 10 - w, y - 6 + d, x - 10, y + 6 + d)):
            if fits(b):
                boxes.append(b)
                text = _text(b[0], b[3] - 2, label, "ink label")
                end = b[0] - 2 if b[0] > x else b[2] + 2
                return f'<line class="lead" x1="{x}" y1="{y}" x2="{end}" y2="{y + d}"/>{text}'
    return _text(x + 10, y + 4, label, "ink label")


def external_main(runs: Path, out: Path) -> int:
    panels = [external_points(runs, c) for c in EXTERNAL]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg_external(panels))
    out.with_suffix(".json").write_text(json.dumps(panels, indent=2))
    for data in panels:
        for p in data["points"]:
            print(f'{data["corpus"]:<13} {p["label"]:<28} leak {p["direct_leak"]:6.1%}   '
                  f'distinct {_pct(p["distinctness"]):>6}')
    print(f"wrote {out} and {out.with_suffix('.json')}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m maskara.bench.hero")
    parser.add_argument("--corpus", default="linked")
    parser.add_argument("--runs", default="runs")
    parser.add_argument("--external", metavar="SVG", help="draw the public chart over TAB, ABCD and Nemotron-PII "
                        "into this file instead")
    args = parser.parse_args(argv)
    runs = Path(args.runs)
    if args.external:
        return external_main(runs, Path(args.external))
    data = points(runs, args.corpus)
    stem = runs / f"hero-{args.corpus}"
    stem.with_suffix(".json").write_text(json.dumps(data, indent=2))
    with stem.with_suffix(".csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows([p[c] for c in COLUMNS] for p in data["points"])
    stem.with_suffix(".svg").write_text(svg(data))
    for p in data["points"]:
        print(f'{p["system"]:<26} hidden {p["private"]:6.1%}   QA {p["qa_accuracy"]:6.1%}   '
              f'consistency {_pct(p["consistency"]):>6}   distinctness {_pct(p["distinctness"]):>6}')
    print(f"wrote {stem}.json, .csv, .svg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
