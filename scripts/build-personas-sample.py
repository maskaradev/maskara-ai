"""Builds public/samples/nemotron-personas/ from nvidia/Nemotron-Personas-USA (CC BY 4.0).

Writes a small table of synthetic US personas. The demographic columns are structured; the
persona and background columns are free text that names the person, so they exercise the
free-text lane.

    python3 scripts/build-personas-sample.py
"""

import csv
import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public/samples/nemotron-personas"
ROWS = 15
# First rows of the train split; fixed so rebuilding gives the same sample.
URL = (
    "https://datasets-server.huggingface.co/rows?dataset=nvidia/Nemotron-Personas-USA"
    f"&config=default&split=train&offset=0&length={ROWS}"
)
COLUMNS = ["persona_id", "sex", "age", "marital_status", "occupation", "city", "state", "zipcode",
           "persona", "cultural_background", "career_goals_and_ambitions"]


def main() -> None:
    with urllib.request.urlopen(URL) as res:
        rows = [r["row"] for r in json.load(res)["rows"]]
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "personas.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(COLUMNS)
        for i, r in enumerate(rows, 1):
            w.writerow([f"NPP{i:03d}"] + [str(r[c]) for c in COLUMNS[1:]])
    print(f"{len(rows)} personas -> {OUT}")


if __name__ == "__main__":
    main()
