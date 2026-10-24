"""Builds public/samples/nemotron-personas/ from nvidia/Nemotron-Personas-USA (CC BY 4.0).

Writes a small table of synthetic US personas. The demographic columns are structured; the
persona and background columns are free text that names the person, so they exercise the
free-text lane. The dataset has no name column, so full_name is taken from the persona text:
with person_id it gives every row a persona, and the names in the free text map to it.

    python3 scripts/build-personas-sample.py
"""

import csv
import json
import re
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public/samples/nemotron-personas"
ROWS = 15
# First rows of the train split; fixed so rebuilding gives the same sample.
URL = (
    "https://datasets-server.huggingface.co/rows?dataset=nvidia/Nemotron-Personas-USA"
    f"&config=default&split=train&offset=0&length={ROWS}"
)
COLUMNS = ["person_id", "full_name", "sex", "age", "marital_status", "occupation", "city", "state", "zipcode",
           "persona", "cultural_background", "career_goals_and_ambitions"]


def main() -> None:
    with urllib.request.urlopen(URL) as res:
        rows = [r["row"] for r in json.load(res)["rows"]]
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "personas.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(COLUMNS)
        for i, r in enumerate(rows, 1):
            # Every persona text opens with the full name: "Mary Alberti is a ..."
            name = re.match(r"[A-Z][\w'.-]*(?: [A-Z][\w'.-]*)+", r["persona"])
            if not name:
                raise ValueError(f"no name at the start of row {i}: {r['persona'][:60]}")
            w.writerow([f"NPP{i:03d}", name.group(0)] + [str(r[c]) for c in COLUMNS[2:]])
    print(f"{len(rows)} personas -> {OUT}")


if __name__ == "__main__":
    main()
