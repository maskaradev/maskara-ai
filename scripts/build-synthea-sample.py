"""Builds public/samples/synthea/ from the Synthea sample CSV export (synthetic, Apache-2.0).

Picks living adult patients and writes three tables linked by patient_id: patients, their most
recent encounters, and their active conditions. Synthea appends digits to generated names
("Maximina916"); they are stripped so names read like real ones.

    curl -L -o /tmp/synthea.zip \
      https://synthetichealth.github.io/synthea-sample-data/downloads/latest/synthea_sample_data_csv_latest.zip
    unzip -o /tmp/synthea.zip -d /tmp/synthea
    python3 scripts/build-synthea-sample.py /tmp/synthea
"""

import csv
import hashlib
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public/samples/synthea"
PATIENTS = 15
ENCOUNTERS_PER_PATIENT = 4
CONDITIONS_PER_PATIENT = 4


def read(src: Path, name: str) -> list[dict]:
    with open(src / f"{name}.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def clean(name: str) -> str:
    return re.sub(r"\d+", "", name).strip()


def stable(key: str) -> str:
    return hashlib.sha1(key.encode()).hexdigest()


def write(name: str, columns: list[str], rows: list[list[str]]) -> None:
    with open(OUT / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(columns)
        w.writerows(rows)


def main(src: str) -> None:
    root = Path(src)
    providers = {p["Id"]: clean(p["NAME"]) for p in read(root, "providers")}
    orgs = {o["Id"]: o["NAME"] for o in read(root, "organizations")}

    adults = [p for p in read(root, "patients") if not p["DEATHDATE"] and p["BIRTHDATE"] < "2006-01-01"]
    # Stable pseudo-random order, so rebuilding gives the same sample.
    picked = sorted(adults, key=lambda p: stable(p["Id"]))[:PATIENTS]
    ids = {p["Id"]: f"S{i:03d}" for i, p in enumerate(picked, 1)}

    by_patient: dict[str, list[dict]] = {}
    for e in read(root, "encounters"):
        if e["PATIENT"] in ids:
            by_patient.setdefault(e["PATIENT"], []).append(e)
    encounters = []
    for pid, rows in by_patient.items():
        for e in sorted(rows, key=lambda e: e["START"], reverse=True)[:ENCOUNTERS_PER_PATIENT]:
            encounters.append([
                "E" + stable(e["Id"])[:8], ids[pid], e["START"][:10], e["ENCOUNTERCLASS"],
                e["DESCRIPTION"], e["REASONDESCRIPTION"], providers.get(e["PROVIDER"], ""), orgs.get(e["ORGANIZATION"], ""),
            ])

    active: dict[str, list[dict]] = {}
    for c in read(root, "conditions"):
        if c["PATIENT"] in ids and not c["STOP"] and "(disorder)" in c["DESCRIPTION"]:
            active.setdefault(c["PATIENT"], []).append(c)
    conditions = []
    for pid, rows in active.items():
        for c in sorted(rows, key=lambda c: c["START"], reverse=True)[:CONDITIONS_PER_PATIENT]:
            conditions.append([ids[pid], c["START"][:10], c["CODE"], c["DESCRIPTION"]])

    OUT.mkdir(parents=True, exist_ok=True)
    write(
        "patients",
        ["patient_id", "first_name", "last_name", "sex", "date_of_birth", "ssn", "drivers_license_number",
         "passport_number", "street_address", "city", "state", "zip"],
        [[ids[p["Id"]], clean(p["FIRST"]), clean(p["LAST"]), p["GENDER"], p["BIRTHDATE"], p["SSN"], p["DRIVERS"],
          p["PASSPORT"], p["ADDRESS"], p["CITY"], p["STATE"], p["ZIP"]] for p in picked],
    )
    write(
        "encounters",
        ["encounter_id", "patient_id", "visit_date", "encounter_class", "encounter_type", "reason", "provider",
         "organization"],
        sorted(encounters, key=lambda r: (r[1], r[2])),
    )
    write("conditions", ["patient_id", "onset_date", "snomed_code", "condition"], sorted(conditions))
    print(f"{len(picked)} patients, {len(encounters)} encounters, {len(conditions)} conditions -> {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
