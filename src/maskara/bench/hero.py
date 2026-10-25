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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m maskara.bench.hero")
    parser.add_argument("--corpus", default="linked")
    parser.add_argument("--runs", default="runs")
    args = parser.parse_args(argv)
    runs = Path(args.runs)
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
