"""`maskara ui`: the local UI server, standard library only.

Security model. The server holds original data (the bundle of the last run) and can read any file
the user can, so it must answer only the user's own browser tab:

  - It binds 127.0.0.1 only, on a random free port by default.
  - Every request must carry a Host header of 127.0.0.1:<port> or localhost:<port>. A page on
    another site that points its own domain at 127.0.0.1 (DNS rebinding) sends its own name, and is
    refused.
  - A random per-session token is printed in the URL the browser opens. The page itself is served
    only with that token in its query string, and embeds it; every /api request must send it back in
    the X-Maskara-Token header. Other local users or sites can't read the page, so they don't have it.
  - POSTs must be application/json (so a cross-site form can't send one without a CORS preflight,
    which is never granted) and, when the browser sends an Origin, come from this origin.
  - Responses are no-store, no-referrer, not frameable, and the page's CSP allows only its own inline
    script (by nonce) and requests to itself.
Nothing protects against code already running as the user, which can read the process anyway.
"""

from __future__ import annotations

import json
import secrets
import threading
import warnings
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from . import build, demo_bundle, page

MAX_BODY = 1 << 20
CSP = ("default-src 'none'; script-src 'nonce-{nonce}'; style-src 'unsafe-inline'; img-src data:; "
       "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


class UIServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port: int = 0):
        super().__init__(("127.0.0.1", port), Handler)
        self.port = self.server_address[1]
        self.token = secrets.token_urlsafe(24)
        self.hosts = {f"127.0.0.1:{self.port}", f"localhost:{self.port}"}
        self.bundle: dict | None = None
        self.lock = threading.Lock()  # one masking run at a time

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/?token={self.token}"


class Handler(BaseHTTPRequestHandler):
    server: UIServer
    server_version = "maskara"
    sys_version = ""

    def log_message(self, format, *args):  # keep the terminal quiet: paths can be sensitive
        pass

    def _send(self, status: int, body: bytes, kind: str, nonce: str = "") -> None:
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Content-Security-Policy", CSP.format(nonce=nonce or secrets.token_urlsafe(8)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, data: dict) -> None:
        self._send(status, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _error(self, status: int, message: str) -> None:
        self._json(status, {"error": message})

    def _host_ok(self) -> bool:
        return self.headers.get("Host", "") in self.server.hosts

    def _token_ok(self, token: str | None) -> bool:
        return bool(token) and secrets.compare_digest(token, self.server.token)

    def do_GET(self) -> None:
        if not self._host_ok():
            return self._error(HTTPStatus.FORBIDDEN, "unexpected Host header")
        url = urlsplit(self.path)
        if url.path == "/":
            if not self._token_ok(parse_qs(url.query).get("token", [None])[0]):
                return self._send(HTTPStatus.FORBIDDEN, b"Open the URL printed by `maskara ui` (it carries the "
                                  b"session token).\n", "text/plain; charset=utf-8")
            nonce = secrets.token_urlsafe(16)
            html = page("local", token=self.server.token, nonce=nonce)
            return self._send(HTTPStatus.OK, html.encode(), "text/html; charset=utf-8", nonce)
        if not self._token_ok(self.headers.get("X-Maskara-Token")):
            return self._error(HTTPStatus.FORBIDDEN, "missing or wrong session token")
        if url.path == "/api/bundle":
            return self._json(HTTPStatus.OK, {"bundle": self.server.bundle})
        self._error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:
        if not self._host_ok():
            return self._error(HTTPStatus.FORBIDDEN, "unexpected Host header")
        origin = self.headers.get("Origin")
        if origin is not None and origin.removeprefix("http://") not in self.server.hosts:
            return self._error(HTTPStatus.FORBIDDEN, "cross-origin request refused")
        if not self._token_ok(self.headers.get("X-Maskara-Token")):
            return self._error(HTTPStatus.FORBIDDEN, "missing or wrong session token")
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self._error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "expected application/json")
        if urlsplit(self.path).path != "/api/run":
            return self._error(HTTPStatus.NOT_FOUND, "not found")
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "request too large")
        try:
            spec = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(spec, dict):
                raise TypeError("expected a JSON object")
        except (ValueError, TypeError) as e:
            return self._error(HTTPStatus.BAD_REQUEST, f"bad request: {e}")
        with self.server.lock:
            try:
                bundle, written = run(spec)
            except Exception as e:  # noqa: BLE001 - every failure goes back to the page as a message
                return self._error(HTTPStatus.BAD_REQUEST, f"{type(e).__name__}: {e}")
            self.server.bundle = bundle
        self._json(HTTPStatus.OK, {"bundle": bundle, "written": written})


def run(spec: dict) -> tuple[dict, list[str] | None]:
    """One masking run from the page's request: the sample data, or files on this machine."""
    preset = spec.get("preset") or "balanced"
    if spec.get("demo"):
        return demo_bundle(preset), None
    from ..api import mask

    tables, texts = spec.get("tables") or {}, spec.get("texts") or {}
    for name, value in {**tables, **texts}.items():
        if not isinstance(name, str) or not isinstance(value, str):
            raise TypeError("tables and texts map names to file paths")
    if not tables and not texts:
        raise ValueError("give at least one file, or run the sample data")
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        result = mask(tables=tables, texts=texts, subjects=spec.get("subjects") or None, preset=preset,
                      detector=spec.get("detector") or "rules")
    written = [str(p) for p in result.save(spec["out"])] if spec.get("out") else None
    bundle = build(result, originals=True, title=", ".join([*tables, *texts]))
    bundle["meta"]["notices"] += [str(w.message) for w in caught if str(w.message) not in result.notices]
    return bundle, written


def serve(port: int = 0, open_browser: bool = True, demo: bool = False) -> None:
    server = UIServer(port)
    if demo:
        server.bundle = demo_bundle()
    print(f"maskara ui: {server.url}", flush=True)
    print("(bound to 127.0.0.1 only; the token in the URL is this session's key. Ctrl-C to stop.)", flush=True)
    if open_browser:
        webbrowser.open(server.url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
