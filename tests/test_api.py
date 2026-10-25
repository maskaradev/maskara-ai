import csv
import json
import re
from collections import defaultdict
from datetime import date

import pytest

import maskara
from maskara import cli, demo
from maskara.vault import Vault

DATA = demo.DATA


def read(name):
    with (DATA / f"{name}.csv").open(newline="") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def run():
    result, _ = demo.run()
    return result


def all_output(result) -> str:
    rows = [r for rs in [*result.tables.values(), *result.texts.values()] for r in rs]
    return "\n".join(json.dumps(r) for r in rows) + "\n" + "\n".join(json.dumps(m.to_dict()) for m in result.mentions)


def test_no_original_identifier_survives_in_output_or_audit(run):
    blob = all_output(run)
    lower, digits = blob.lower(), re.sub(r"\D", "", blob)
    for c in read("customers"):
        assert f"{c['first_name']} {c['last_name']}".lower() not in lower
        assert c["email"].lower() not in lower
        assert re.sub(r"\D", "", c["phone"]) not in digits
        assert c["customer_id"] not in blob
    for a in read("agents"):
        assert f"{a['first_name']} {a['last_name']}".lower() not in lower
    assert demo.leaks(run) == []


def test_same_subject_same_persona_across_tables_and_texts(run):
    customers = read("customers")
    persona_of = {}  # original customer id -> persona id, from the customers table
    for m in run.mentions:
        if m.source == "customers" and m.column == "first_name":
            persona_of[customers[m.row]["customer_id"]] = m.persona
    assert len(set(persona_of.values())) == len(customers)
    tickets, orders = read("tickets"), read("orders")
    for m in run.mentions:
        if m.source == "orders" and m.column == "placed_on":
            assert m.persona == persona_of[orders[m.row]["customer_id"]]
    # Every full-name mention of the ticket's own customer in its transcript carries that persona.
    checked = 0
    for m in run.mentions:
        if m.source == "tickets" and m.column == "transcript" and m.label == "full_name" and m.link == "row":
            assert m.persona == persona_of[tickets[m.row]["customer_id"]]
            checked += 1
    assert checked > 50
    # The customer's masked first name is the one written in their transcripts (a one-letter surname
    # like 'Y' is kept as an initial, so only first names are compared).
    first = {r["customer_id"]: r["first_name"] for r in run.tables["customers"]}
    for m in run.mentions:
        if m.source == "tickets" and m.label == "full_name" and m.link == "row":
            assert m.replacement.split()[0] == first[run.tables["tickets"][m.row]["customer_id"]]


def test_joins_survive(run):
    customers = {r["customer_id"] for r in run.tables["customers"]}
    orders = {r["order_number"] for r in run.tables["orders"]}
    agents = {r["agent_id"] for r in run.tables["agents"]}
    assert all(r["customer_id"] in customers for r in run.tables["orders"])
    assert all(r["customer_id"] in customers and r["agent_id"] in agents for r in run.tables["tickets"])
    assert all(r["order_number"] in orders for r in run.tables["tickets"] if r["order_number"])
    # Original and masked joins pair up row for row.
    before = [(o["customer_id"], o["order_number"]) for o in read("orders")]
    after = [(o["customer_id"], o["order_number"]) for o in run.tables["orders"]]
    assert len(set(before)) == len(set(after)) == len(before)
    # Ids written in free text are the same replacements as in the tables.
    ticket_text = " ".join(t["transcript"] for t in run.tables["tickets"])
    assert sum(o in ticket_text for o in orders) > 50


def test_date_gaps_within_a_subject_are_preserved(run):
    def days(rows, column, key):
        out = defaultdict(list)
        for r in rows:
            out[key(r)].append(date.fromisoformat(r[column]))
        return out

    before = days(read("orders"), "placed_on", lambda r: r["customer_id"]) | {}
    after = days(run.tables["orders"], "placed_on", lambda r: r["customer_id"])
    t_before = days(read("tickets"), "opened_on", lambda r: r["customer_id"])
    t_after = days(run.tables["tickets"], "opened_on", lambda r: r["customer_id"])
    ids = dict(zip([r["customer_id"] for r in read("customers")], [r["customer_id"] for r in run.tables["customers"]]))
    for original, masked in ids.items():
        b = sorted(before[original] + t_before[original])
        a = sorted(after[masked] + t_after[masked])
        assert [(x - b[0]).days for x in b] == [(x - a[0]).days for x in a]
        assert b != a  # but the dates themselves moved


def test_output_types_match_input_types(tmp_path):
    rows = [{"user_id": 7, "name": "Maria Lopez", "email": "mlopez@gmail.com", "age": 44, "vip": True,
             "joined": date(2024, 1, 1)}]
    texts = ["Maria Lopez wrote from mlopez@gmail.com."]
    (tmp_path / "t.jsonl").write_text(json.dumps("Maria Lopez again.") + "\n")
    r = maskara.mask(tables={"users": rows}, texts={"notes": texts, "more": tmp_path / "t.jsonl"},
                     subjects={"users": "user_id"}, vault=Vault.from_seed("t"), detector="rules")
    users = r.tables["users"]
    assert isinstance(users, list) and isinstance(users[0], dict)
    assert isinstance(users[0]["user_id"], int) and isinstance(users[0]["age"], int) and users[0]["vip"] is True
    assert isinstance(r.texts["notes"], list) and isinstance(r.texts["notes"][0], str)
    assert users[0]["name"] in r.texts["notes"][0] and users[0]["email"] in r.texts["notes"][0]
    assert r.texts["more"] == [f"{users[0]['name']} again."]
    assert isinstance(users[0]["joined"], date) and users[0]["joined"] != date(2024, 1, 1)
    assert rows[0]["name"] == "Maria Lopez"  # inputs are not modified


def test_pandas_in_pandas_out():
    pd = pytest.importorskip("pandas")
    df = pd.DataFrame({"user_id": [1, 2], "name": ["Maria Lopez", None],
                       "joined": pd.to_datetime(["2024-01-01", None])})
    notes = pd.Series(["Maria Lopez called."], name="body")
    r = maskara.mask(tables={"users": df}, texts={"notes": notes}, subjects={"users": "user_id"},
                     vault=Vault.from_seed("t"), detector="rules")
    assert isinstance(r.tables["users"], pd.DataFrame) and list(r.tables["users"].columns) == list(df.columns)
    assert isinstance(r.texts["notes"], pd.Series) and r.texts["notes"].name == "body"
    assert "Maria Lopez" not in r.texts["notes"][0]
    assert r.columns["users"]["joined"] == "date" and r.tables["users"]["joined"][0] != df["joined"][0]
    assert pd.isna(r.tables["users"]["name"][1]) and pd.isna(r.tables["users"]["joined"][1])


def test_deterministic_under_a_seed(run):
    again, _ = demo.run()
    assert again.tables == run.tables and again.texts == run.texts and again.mentions == run.mentions


def test_bad_arguments_and_failures(tmp_path, monkeypatch):
    rows = [{"id": 1, "name": "Maria Lopez"}]
    with pytest.raises(ValueError, match="subject column"):
        maskara.mask(tables={"t": rows}, subjects={"t": "user_id"}, detector="rules")
    with pytest.raises(ValueError, match="unknown role"):
        maskara.mask(tables={"t": rows}, columns={"t": {"name": "nickname"}}, detector="rules")
    with pytest.raises(TypeError):
        maskara.mask(tables={"t": 42}, detector="rules")
    with pytest.raises(ValueError, match="unknown preset"):
        maskara.mask(tables={"t": rows}, preset="lax", detector="rules")

    def boom(*a, **k):
        raise RuntimeError("persona store unavailable")

    monkeypatch.setattr("maskara.transform.Replacer.cell", boom)
    with pytest.raises(maskara.MaskingError, match="no output produced"):
        maskara.mask(tables={"t": rows}, detector="rules")


def test_cli_exit_codes_and_atomic_output(tmp_path, monkeypatch, capsys):
    src = tmp_path / "users.csv"
    src.write_text("user_id,name,email\n1,Maria Lopez,mlopez@gmail.com\n")
    out = tmp_path / "out"
    assert cli.main(["mask", "--table", f"users={src}", "--subject", "users=user_id", "--seed", "s",
                     "--detector", "rules", "--out", str(out)]) == 0
    assert sorted(p.name for p in out.iterdir()) == ["mentions.jsonl", "report.html", "report.json", "users.csv"]
    for name in ("users.csv", "report.json", "report.html", "mentions.jsonl"):
        assert "Maria" not in (out / name).read_text() and "mlopez" not in (out / name).read_text()
    assert cli.main(["report", str(out), "--html"]) == 0 and "maskara report" in capsys.readouterr().out
    assert cli.main(["mask", "--table", f"users={src}", "--out", str(out), "--column", "users.name=nope",
                     "--seed", "s"]) == 2
    config = tmp_path / "c.toml"
    config.write_text(f'out = "out2"\nseed = "s"\ndetector = "rules"\n[tables]\nusers = "{src.name}"\n')
    assert cli.main(["mask", str(config)]) == 0 and (tmp_path / "out2" / "users.csv").exists()
    notes = tmp_path / "notes.txt"
    notes.write_text("Re application no. 36110/97 and EMP-20431.\n")
    config.write_text(f'out = "out3"\nseed = "s"\ndetector = "rules"\n[texts]\nnotes = "{notes.name}"\n'
                      "[[patterns]]\nregex = '\\bEMP-\\d{5}\\b'\nlabel = 'employee_id'\n")
    assert cli.main(["mask", str(config), "--pattern", "legal-echr"]) == 0
    masked = (tmp_path / "out3" / "notes.txt").read_text()
    assert "36110/97" not in masked and "20431" not in masked
    assert cli.main(["mask", str(config), "--pattern", "no-such-pack"]) == 2

    monkeypatch.setattr("maskara.transform.Replacer.cell", lambda *a, **k: 1 / 0)
    failed = tmp_path / "failed"
    assert cli.main(["mask", "--table", f"users={src}", "--seed", "s", "--detector", "rules",
                     "--out", str(failed)]) == 3
    assert not failed.exists()


def test_demo_command(capsys):
    assert cli.main(["demo"]) == 0
    printed = capsys.readouterr().out
    assert re.search(r"originals +0 of \d+ known identifiers", printed) and "0 broken" in printed and "→" in printed


def test_demo_notes_mask_agent_first_names_card_answers_and_keep_id_prefixes(run):
    agents = {r["first_name"]: i for i, r in enumerate(read("agents"))}
    notes = [json.loads(line)["text"] for line in (DATA / "notes.jsonl").open()]
    masked = [r["text"] for r in run.texts["notes"]]
    for before, after in zip(notes, masked):
        for name in re.findall(r"(?:Handled by |-)([A-Z][a-z]+)\b", before):
            if name in agents:
                # Signed or handled by an agent: that agent's persona first name, as in the agents table.
                assert re.search(rf"\b{name}\b", after) is None
                assert run.tables["agents"][agents[name]]["first_name"] in after
    customers = {r["customer_id"]: run.tables["customers"][i]["customer_id"] for i, r in enumerate(read("customers"))}
    for before, after in zip(notes, masked):
        for cid in re.findall(r"CUS-\d{6}", before):
            assert customers[cid] in after and customers[cid].startswith("CUS-")  # prefix kept, join holds
    tickets = read("tickets")
    i = next(i for i, t in enumerate(tickets) if "Caller: 3780" in t["transcript"])
    after = run.tables["tickets"][i]["transcript"]
    assert "3780" not in after
    assert re.search(r"Caller: (\d{4})\n", after)[1] == re.search(r"ending in (\d{4})", after)[1]
    reappearance = run.report.to_dict()["privacy"]["reappearance"]
    assert reappearance["found"] == 0 and reappearance["partial"] <= 3
