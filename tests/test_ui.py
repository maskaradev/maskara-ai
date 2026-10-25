import json
import re
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

import maskara
from maskara import demo, ui
from maskara.ui import bundle as bundles
from maskara.ui.server import UIServer
from maskara.vault import Vault

ROWS = [{"user_id": "u1", "name": "Maria Lopez", "email": "mlopez@gmail.com",
         "bio": "Maria Lopez </script><script>alert(1)</script> lives in Denver, CO."}]


@pytest.fixture(scope="module")
def sample():
    return ui.demo_bundle()


def script_json(html: str, element_id: str):
    m = re.search(rf'<script type="application/json" id="{element_id}">(.*?)</script>', html, re.DOTALL)
    return json.loads(m.group(1))


def test_bundle_schema_and_round_trip(sample):
    assert sample["schema"] == bundles.SCHEMA and sample["meta"]["synthetic"] and sample["meta"]["originals"]
    assert json.loads(json.dumps(sample)) == sample
    fields = sample["mentions"]["fields"]
    assert all(len(r) == len(fields) for r in sample["mentions"]["rows"])
    inputs = {i["name"]: i for i in sample["inputs"]}
    assert inputs["orders"]["subject"] == "customer_id" and inputs["customers"]["file"] == "customers.csv"
    for name, rows in sample["rows"].items():
        assert len(rows["after"]) == len(rows["before"]) == inputs[name]["rows"]
        assert all(len(r) == len(inputs[name]["columns"]) for r in rows["after"])
    # Every replacement is recoverable from the after rows, as the UI does it.
    result, _ = demo.run()
    for row, m in zip(sample["mentions"]["rows"], result.mentions):
        m2 = dict(zip(fields, row))
        inp = inputs[m2["source"]]
        cell = sample["rows"][m2["source"]]["after"][m2["row"]][[c["name"] for c in inp["columns"]].index(m2["column"])]
        got = str(cell) if m2["start"] is None else cell[m2["out_start"]:m2["out_end"]]
        assert got == m.replacement
    ids = {p["id"] for p in sample["personas"]}
    assert {m[fields.index("persona")] for m in sample["mentions"]["rows"]} - {None} <= ids
    first = sample["personas"][0]
    assert len(first["inputs"]) == 4 and first["original"]  # a customer seen in every input they can be


def test_bundle_without_originals():
    result = maskara.mask(tables={"users": ROWS}, subjects={"users": "user_id"}, detector="rules",
                          vault=Vault.from_seed("ui"))
    b = bundles.build(result, originals=False)
    text = json.dumps(b)
    assert b["rows"]["users"]["before"] is None and all(p["original"] is None for p in b["personas"])
    assert "Maria" not in text and "mlopez" not in text
    with_originals = bundles.build(result, originals=True)
    assert with_originals["rows"]["users"]["before"][0][1] == "Maria Lopez"


def test_page_inlines_json_safely():
    result = maskara.mask(tables={"users": ROWS}, subjects={"users": "user_id"}, detector="rules",
                          vault=Vault.from_seed("ui"))
    b = bundles.build(result, originals=True)
    html = ui.page("static", bundle=b)
    assert "<script>alert(1)" not in html and html.count("</script>") == 3
    assert script_json(html, "maskara-bundle") == json.loads(json.dumps(b))
    assert script_json(html, "maskara-config") == {"mode": "static", "token": None}
    assert "/*@" not in html


def test_export_writes_a_static_showroom(tmp_path):
    written = ui.export(tmp_path / "demo")
    assert sorted(p.name for p in written) == ["bundle.json", "index.html"]
    html = (tmp_path / "demo" / "index.html").read_text()
    data = (tmp_path / "demo" / "bundle.json").read_text()
    for text in (html, data):
        assert str(Path.home()) not in text and str(demo.DATA) not in text and str(tmp_path) not in text
        assert not re.search(r'"(?:/Users|/home|[A-Z]:\\\\)', text)
    assert not re.search(r'<(?:script|link|img)[^>]+(?:src|href)="(?!data:)', html)  # nothing fetched
    assert script_json(html, "maskara-bundle")["meta"]["synthetic"] is True
    js = (Path(ui.__file__).parent / "static" / "app.js").read_text()
    assert "pip install git+" in js and not re.search(r"pip install maskara\b", js + html)
    assert "maskara.dev/#waitlist" in js


@pytest.fixture()
def server():
    srv = UIServer(0)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    yield srv
    srv.shutdown()
    srv.server_close()


def call(srv, path, *, token=None, host=None, data=None, kind="application/json", origin=None):
    req = urllib.request.Request(f"http://127.0.0.1:{srv.port}{path}", data=data, method="POST" if data else "GET")
    if token:
        req.add_header("X-Maskara-Token", token)
    if host:
        req.add_header("Host", host)
    if data:
        req.add_header("Content-Type", kind)
    if origin:
        req.add_header("Origin", origin)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, dict(res.headers), res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()


def test_server_page_needs_token_and_local_host(server):
    status, headers, html = call(server, f"/?token={server.token}")
    assert status == 200 and headers["Cache-Control"] == "no-store"
    nonce = re.search(r"'nonce-([^']+)'", headers["Content-Security-Policy"]).group(1)
    assert f'<script nonce="{nonce}">' in html
    assert script_json(html, "maskara-config") == {"mode": "local", "token": server.token}
    assert call(server, f"/?token={server.token}", host=f"localhost:{server.port}")[0] == 200
    assert call(server, "/")[0] == 403
    assert call(server, "/?token=wrong")[0] == 403
    assert call(server, f"/?token={server.token}", host=f"attacker.example:{server.port}")[0] == 403  # DNS rebinding
    assert call(server, f"/?token={server.token}", host="127.0.0.1:1")[0] == 403


def test_server_api_checks(server):
    t = server.token
    assert call(server, "/api/bundle")[0] == 403
    assert call(server, "/api/bundle", token="nope")[0] == 403
    status, _, body = call(server, "/api/bundle", token=t)
    assert status == 200 and json.loads(body) == {"bundle": None}
    demo_run = json.dumps({"demo": True}).encode()
    assert call(server, "/api/run", data=demo_run)[0] == 403
    assert call(server, "/api/run", token=t, data=demo_run, kind="text/plain")[0] == 415
    assert call(server, "/api/run", token=t, data=demo_run, origin="http://attacker.example")[0] == 403
    assert call(server, "/api/run", token=t, data=demo_run, host=f"attacker.example:{server.port}")[0] == 403
    status, _, body = call(server, "/api/run", token=t, data=demo_run, origin=f"http://127.0.0.1:{server.port}")
    assert status == 200 and json.loads(body)["bundle"]["report"]["headline"]["originals_found"] == 0
    assert json.loads(call(server, "/api/bundle", token=t)[2])["bundle"]["meta"]["synthetic"] is True
    status, _, body = call(server, "/api/run", token=t, data=json.dumps({"tables": {"x": "/no/such.csv"}}).encode())
    assert status == 400 and "FileNotFoundError" in json.loads(body)["error"]


def test_server_runs_local_files(server, tmp_path):
    src = tmp_path / "users.csv"
    src.write_text("user_id,name,email\nu1,Maria Lopez,mlopez@gmail.com\n")
    spec = {"tables": {"users": str(src)}, "subjects": {"users": "user_id"}, "out": str(tmp_path / "out")}
    status, _, body = call(server, "/api/run", token=server.token, data=json.dumps(spec).encode())
    data = json.loads(body)
    assert status == 200 and data["bundle"]["meta"]["originals"] and not data["bundle"]["meta"]["synthetic"]
    assert data["bundle"]["inputs"][0]["file"] == "users.csv"
    assert (tmp_path / "out" / "report.html").exists() and len(data["written"]) == 4
