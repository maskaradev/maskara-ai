"""maskara UI: one page, plain HTML/CSS/JS shipped in the package, no build step and nothing fetched.

    maskara ui                  # local: http://127.0.0.1:<port>/?token=..., can run masking (`server`)
    maskara ui --export DIR     # static showroom: the bundled sample data, precomputed (`export`)

Both modes render a run bundle (`bundle.py`). The page is assembled here: stylesheet, script, config
and (static mode) the bundle are inlined into static/index.html, so the export is a single file that
works from any path, any host, or straight from disk.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from ..report.html import CSS as REPORT_CSS
from .bundle import SCHEMA, build

STATIC = Path(__file__).with_name("static")
DEMO_TITLE = "An online store's customers, orders, support tickets and agent notes"


def _json_script(data: object) -> str:
    """JSON safe inside a <script> element: no '</script>' or '<!--' can close or confuse it."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def page(mode: str, *, token: str | None = None, bundle: dict | None = None, nonce: str = "") -> str:
    """The app as one HTML document. `bundle` is inlined (static mode); local mode fetches it."""
    css = REPORT_CSS.read_text(encoding="utf-8") + "\n" + (STATIC / "app.css").read_text(encoding="utf-8")
    parts = {
        "/*@CSS@*/": css,
        "/*@CONFIG@*/": _json_script({"mode": mode, "token": token}),
        "/*@BUNDLE@*/": _json_script(bundle) if bundle is not None else "null",
        "/*@NONCE@*/": nonce,
        "/*@JS@*/": (STATIC / "app.js").read_text(encoding="utf-8"),
    }
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    for marker, value in parts.items():  # each marker appears once, and none occurs in the values
        html = html.replace(marker, value, 1)
    return html


def demo_bundle(preset: str = "balanced") -> dict:
    """The bundled sample data, masked with the public demo seed: the same bundle on every machine."""
    from .. import demo

    result, _ = demo.run(preset)
    return build(result, originals=True, synthetic=True, title=DEMO_TITLE, seed=demo.SEED)


def export(directory: str | os.PathLike, preset: str = "balanced") -> list[Path]:
    """Write the static showroom: index.html (self-contained) and bundle.json, for the sample data only.

    Only synthetic data is ever exported: a bundle of real data holds its originals.
    """
    out = Path(directory)
    out.mkdir(parents=True, exist_ok=True)
    bundle = demo_bundle(preset)
    index, data = out / "index.html", out / "bundle.json"
    index.write_text(page("static", bundle=bundle), encoding="utf-8")
    data.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return [index, data]


__all__ = ["SCHEMA", "build", "demo_bundle", "export", "page"]
