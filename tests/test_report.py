import csv
import json
import re

import pytest

import maskara
from maskara import demo
from maskara.report import Report, Run, build
from maskara.report.metrics import ks, tvd
from maskara.vault import Vault


@pytest.fixture(scope="module")
def run():
    result, _ = demo.run()
    return result


def originals() -> list[str]:
    out = []
    for name in ("customers", "agents"):
        with (demo.DATA / f"{name}.csv").open(newline="") as f:
            for r in csv.DictReader(f):
                out += [f"{r['first_name']} {r['last_name']}", r.get("email"), r.get("customer_id"), r.get("street")]
    return [o for o in out if o]


def test_demo_report_headline(run):
    h = run.report.headline
    assert h["originals_found"] == 0 and h["originals_scanned"] > 500
    assert h["broken_joins"] == 0 and h["joins_checked"] > 500
    assert h["date_gaps_exact"] == 1.0 and h["date_gaps_checked"] > 100
    assert h["schema_ok"] and h["format_valid"] == 1.0
    assert h["placeholder_share"] == 0 and h["non_pii_changed"] == 0
    f = run.report.data["fidelity"]
    pairs = {(p["from"], p["to"]) for p in f["joins"]["pairs"]}
    assert ("orders.customer_id", "customers.customer_id") in pairs and ("tickets.agent_id", "agents.agent_id") in pairs
    assert f["joins"]["text_refs"]["checked"] > 100 and f["joins"]["text_refs"]["broken"] == 0
    dist = {(c["table"], c["column"]): c for c in f["distributions"]["columns"]}
    assert dist[("orders", "amount")]["value"] == 0 and dist[("customers", "state")]["value"] == 0
    assert dist[("customers", "birth_date")]["test"] == "ks"
    qi = run.report.data["privacy"]["quasi_identifiers"]["tables"]["customers"]
    assert set(qi["kept"]) == {"gender", "state"} and sum(qi["k"].values()) == qi["rows"] == 60


def test_report_holds_no_originals(run):
    text = run.report.to_json() + run.report.to_html() + run.report.summary()
    lower = text.lower()
    assert not [o for o in originals() if o.lower() in lower]
    assert "<script" not in run.report.to_html() and not re.search(r'(?:src|href)="http', run.report.to_html())


def test_report_round_trip(run, tmp_path):
    written = run.save(tmp_path)
    assert {p.name for p in written} >= {"report.json", "report.html"}
    loaded = Report.load(tmp_path)
    assert loaded.to_dict() == json.loads(json.dumps(run.report.to_dict()))
    assert "date gaps" in loaded.summary() and "not measured" in loaded.summary()


CUSTOMERS = [
    {"customer_id": "C-10042", "name": "Maria Lopez", "email": "mlopez@gmail.com", "phone": "(312) 867-5309"},
    {"customer_id": "C-10043", "name": "Daniel Whitfield", "email": "dwhit@yahoo.com", "phone": "(415) 922-1830"},
]
ORDERS = [
    {"order_id": "ORD-7731", "customer_id": "C-10042", "placed_on": "2024-03-01"},
    {"order_id": "ORD-7732", "customer_id": "C-10042", "placed_on": "2024-03-08"},
    {"order_id": "ORD-7733", "customer_id": "C-10043", "placed_on": "2024-05-02"},
]
NOTES = [{"customer_id": "C-10042", "body": "Maria Lopez called about ORD-7731 on 2024-03-02. Email mlopez@gmail.com."}]


def masked_run():
    tables = {"customers": CUSTOMERS, "orders": ORDERS, "notes": NOTES}
    result = maskara.mask(tables=tables, subjects={t: "customer_id" for t in tables}, detector="rules",
                          vault=Vault.from_seed("report"))
    out = {name: [dict(r) for r in rows] for name, rows in result.tables.items()}
    return result, out


def rebuild(result, out):
    return build(Run(result._sources, out, result.mentions, result.columns), preset=result.preset, detectors=result.detectors)


def test_clean_run_on_small_tables():
    result, out = masked_run()
    h = result.report.headline
    assert h["originals_found"] == 0 and h["broken_joins"] == 0 and h["date_gaps_exact"] == 1.0
    assert rebuild(result, out).to_dict() == result.report.to_dict()


def test_leaky_output_is_caught():
    result, out = masked_run()
    out["notes"][0]["body"] += " cc: maria   LOPEZ, 312.867.5309"  # case, spacing and digit layout changed
    out["orders"][2]["customer_id"] = "C-10043"                    # an original id put back: a broken join
    day = out["orders"][1]["placed_on"]
    out["orders"][1]["placed_on"] = day[:-2] + f"{int(day[-2:]) % 28 + 1:02d}"  # one date moved on its own
    out["customers"][1]["email"] = "[EMAIL]"
    r = rebuild(result, out).to_dict()
    re_ = r["privacy"]["reappearance"]
    assert re_["exact"] >= 1 and re_["normalized"] >= 2 and r["headline"]["originals_found"] >= 3
    found = {(x["found_in"]["source"], x["level"]) for x in re_["hits"]}
    assert ("notes", "normalized") in found and ("orders", "exact") in found
    assert r["fidelity"]["joins"]["broken"] >= 1
    assert r["fidelity"]["date_gaps"]["exact_share"] < 1 and r["fidelity"]["date_gaps"]["max_error_days"] > 0
    assert r["fidelity"]["placeholders"]["placeholders"] == 1
    assert r["fidelity"]["formats"]["kinds"]["email"]["valid"] < r["fidelity"]["formats"]["kinds"]["email"]["checked"]
    assert r["fidelity"]["non_pii"]["text_chars_changed"] > 0


def test_partial_matches_skip_text_maskara_wrote():
    result, out = masked_run()
    assert result.report.headline["originals_partial"] == 0
    out["notes"][0]["body"] += " Signed, Whitfield"  # a surname left outside any replaced span
    assert rebuild(result, out).headline["originals_partial"] == 1


def test_distances():
    assert tvd(["a", "a", "b"], ["a", "a", "b"]) == 0 and tvd(["a"], ["b"]) == 1
    assert ks([1, 2, 3], [1, 2, 3]) == 0 and ks([1, 2], [3, 4]) == 1
    assert ks([1, 2, 3, 4], [1, 2, 3, 5]) == pytest.approx(0.25)
