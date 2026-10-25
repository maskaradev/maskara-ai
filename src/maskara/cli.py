"""Command line entry point.

    maskara mask [config.toml] [--table NAME=PATH] [--text NAME=PATH] [--subject NAME=COLUMN] --out DIR
    maskara demo [--out DIR]
    maskara report OUT_DIR [--html]
    maskara ui [--port N] [--no-browser] | maskara ui --export DIR
    maskara bench --corpus linked --system maskara [--qa linking|llm]
    maskara hero --corpus linked --runs runs

Exit codes: 0 success, 2 usage error (bad flags, config, paths or roles), 3 masking failed. On a
masking failure nothing is written, so no partially masked file can leave originals behind.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
import tomllib
import warnings
from importlib import metadata
from pathlib import Path

from . import __version__

OK, USAGE, FAILED = 0, 2, 3


def _versions() -> dict:
    out = {"maskara": __version__, "python": platform.python_version()}
    for pkg in ("presidio-analyzer", "spacy", "en-core-web-lg", "faker", "opf", "gliner2", "torch"):
        try:
            out[pkg] = metadata.version(pkg)
        except metadata.PackageNotFoundError:
            pass
    return out


def _pct(x: float | None) -> str:
    return "   —  " if x is None else f"{100 * x:5.1f}%"


def _table(rows: list[dict]) -> str:
    head = ("corpus", "system", "direct leak", "partial", "entity leak", "quasi leak", "consistent",
            "distinct", "placeholder", "over-mask")
    lines = [" | ".join(head), " | ".join("---" for _ in head)]
    for r in rows:
        p, f = r["scores"]["privacy"], r["scores"]["fidelity"]
        lines.append(" | ".join([
            r["corpus"], r["system"], _pct(p["direct"]["leak_full"]), _pct(p["direct"]["leak_partial"]),
            _pct(p["direct"]["entity_leak"]), _pct(p["quasi"]["leak_full"]), _pct(f["consistency"]),
            _pct(f["distinctness"]), _pct(f["placeholder"]), _pct(f["over_masking"]),
        ]))
    return "\n".join(lines)


def _save_outputs(path: Path, outputs: dict) -> None:
    with path.open("w") as f:
        for doc_id, out in outputs.items():
            f.write(json.dumps({"id": doc_id, "edits": [[e.start, e.end, e.replacement] for e in out.edits]}) + "\n")


def _load_outputs(path: Path, docs: list) -> dict:
    from .bench.types import Edit, make_output

    edits = {}
    with path.open() as f:
        for line in f:
            rec = json.loads(line)
            edits[rec["id"]] = [Edit(s, e, r) for s, e, r in rec["edits"]]
    missing = [d.id for d in docs if d.id not in edits]
    if missing:
        raise SystemExit(f"{path} has no output for {len(missing)} documents (first: {missing[0]}); run without --rescore")
    return {d.id: make_output(d.text, edits[d.id]) for d in docs}


def bench(args: argparse.Namespace) -> int:
    from .bench import corpora, systems
    from .bench.score import score

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for corpus in args.corpus:
        docs = corpora.load(corpus, args.limit)
        for name in args.system:
            stem = out_dir / f"{corpus}--{name}"
            result_path, outputs_path = stem.with_suffix(".json"), stem.with_suffix(".outputs.jsonl")
            if args.rescore:
                # Score saved outputs again, keeping the timing and versions of the run that made them.
                previous = json.loads(result_path.read_text())
                outputs = _load_outputs(outputs_path, docs)
                seconds, versions = previous["seconds"], previous["versions"]
            else:
                started = time.perf_counter()
                outputs = systems.get(name)(docs)
                seconds, versions = round(time.perf_counter() - started, 2), _versions()
                _save_outputs(outputs_path, outputs)
            row = {
                "corpus": corpus, "system": name, "documents": len(docs), "corpus_info": corpora.CORPORA[corpus].INFO,
                "seconds": seconds, "versions": versions, "scores": score(docs, outputs),
            }
            rows.append(row)
            result_path.write_text(json.dumps(row, indent=2))
            print(f"{corpus} / {name}: {len(docs)} docs in {seconds:.1f}s", file=sys.stderr)
    print(_table(rows))
    if args.qa:
        return _qa(args, out_dir, rows)
    return 0


def _qa(args: argparse.Namespace, out_dir: Path, rows: list[dict]) -> int:
    """Entity QA on the runs just scored, for corpora that come with questions (maskara-linked)."""
    from .bench import corpora
    from .bench.qa_runner import ask_from_env, evaluate

    reader, ask = args.qa, None
    if args.qa == "llm":
        found = ask_from_env()
        if found is None:
            print("maskara: --qa llm needs MASKARA_QA_BASE_URL and MASKARA_QA_MODEL, or ANTHROPIC_API_KEY",
                  file=sys.stderr)
            return USAGE
        reader, ask = found
    asked = [r for r in rows if hasattr(corpora.CORPORA[r["corpus"]], "questions")]
    if not asked:
        print(f"maskara: no questions for {', '.join(sorted({r['corpus'] for r in rows}))}; "
              "--qa runs on corpora that have them (linked)", file=sys.stderr)
        return USAGE
    print("\n" + "corpus | system | reader | QA accuracy")
    for row in asked:
        r = evaluate(out_dir, row["corpus"], row["system"], ask, reader)
        (out_dir / f"{row['corpus']}--{row['system']}.qa-{args.qa}.json").write_text(json.dumps(r, indent=2))
        print(" | ".join([row["corpus"], row["system"], reader,
                          f"{_pct(r['accuracy'])} ({r['correct']}/{r['questions']})"]))
    return 0


def hero_command(args: argparse.Namespace) -> int:
    from .bench import hero

    extra = ["--external", args.external] if args.external else []
    return hero.main(["--corpus", args.corpus, "--runs", args.runs, *extra])


def report_command(args: argparse.Namespace) -> int:
    from .report import Report

    try:
        report = Report.load(args.path)
    except (OSError, ValueError) as e:
        print(f"maskara: {e}", file=sys.stderr)
        return USAGE
    print(report.summary())
    if args.html:
        path = Path(args.path)
        target = (path if path.is_dir() else path.parent) / "report.html"
        report.to_html(target)
        print(target)
    return OK


def ui_command(args: argparse.Namespace) -> int:
    from . import ui

    if args.export:
        for path in ui.export(args.export, args.preset):
            print(path)
        return OK
    from .ui.server import serve

    try:
        serve(args.port, open_browser=not args.no_browser, demo=args.demo)
    except OSError as e:
        print(f"maskara: could not start the UI on port {args.port}: {e}", file=sys.stderr)
        return USAGE
    return OK


def _pairs(items: list[str], flag: str) -> dict[str, str]:
    out = {}
    for item in items or []:
        key, sep, value = item.partition("=")
        if not sep or not key or not value:
            raise ValueError(f"{flag} expects NAME=VALUE, got {item!r}")
        out[key] = value
    return out


def _config(args: argparse.Namespace) -> dict:
    """The TOML config (paths relative to it), with command line flags added on top."""
    cfg: dict = {}
    base = Path(".")
    if args.config:
        path = Path(args.config)
        with path.open("rb") as f:
            cfg = tomllib.load(f)
        base = path.parent
        unknown = set(cfg) - {"tables", "texts", "subjects", "columns", "preset", "vault", "seed", "detector",
                              "namespace", "email_domain", "out", "patterns"}
        if unknown:
            raise ValueError(f"{path}: unknown keys {sorted(unknown)}")
    for key in ("tables", "texts"):
        cfg[key] = {name: str(base / p) for name, p in cfg.get(key, {}).items()}
    if cfg.get("vault"):
        cfg["vault"] = str(base / cfg["vault"])
    if cfg.get("out"):
        cfg["out"] = str(base / cfg["out"])
    cfg["tables"].update(_pairs(args.table, "--table"))
    cfg["texts"].update(_pairs(args.text, "--text"))
    cfg.setdefault("subjects", {}).update(_pairs(args.subject, "--subject"))
    for spec, role in _pairs(args.column, "--column").items():
        name, dot, column = spec.partition(".")
        if not dot:
            raise ValueError(f"--column expects NAME.COLUMN=ROLE, got {spec!r}")
        cfg.setdefault("columns", {}).setdefault(name, {})[column] = role
    if args.pattern:
        patterns = cfg.get("patterns", [])
        cfg["patterns"] = [*(patterns if isinstance(patterns, list) else [patterns]), *args.pattern]
    for key in ("preset", "vault", "seed", "detector", "namespace", "email_domain", "out"):
        if getattr(args, key, None) is not None:
            cfg[key] = getattr(args, key)
    if not cfg["tables"] and not cfg["texts"]:
        raise ValueError("nothing to mask: give a config file or --table/--text")
    if not cfg.get("out"):
        raise ValueError("--out is required (or `out` in the config)")
    return cfg


def mask_command(args: argparse.Namespace) -> int:
    from .api import MaskingError, mask
    from .vault import Vault

    try:
        cfg = _config(args)
        if cfg.get("seed") is not None:
            vault = Vault.from_seed(str(cfg["seed"]))
        else:
            path = Path(cfg.get("vault") or ".maskara/vault.db")
            if not path.exists():
                print(f"maskara: new vault {path} (key {path}.key: keep it private and out of git)", file=sys.stderr)
            vault = Vault(path)
        started = time.perf_counter()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            result = mask(tables=cfg["tables"], texts=cfg["texts"], subjects=cfg.get("subjects"),
                          preset=cfg.get("preset", "balanced"), vault=vault, detector=cfg.get("detector", "auto"),
                          columns=cfg.get("columns"), namespace=cfg.get("namespace", "default"),
                          email_domain=cfg.get("email_domain"), patterns=cfg.get("patterns"))
        for w in caught:
            print(str(w.message), file=sys.stderr)
    except MaskingError as e:
        print(f"maskara: {e}", file=sys.stderr)
        return FAILED
    except (OSError, ValueError, TypeError, tomllib.TOMLDecodeError, ImportError) as e:
        print(f"maskara: {e}", file=sys.stderr)
        return USAGE
    try:
        written = result.save(cfg["out"])
    except OSError as e:
        print(f"maskara: could not write {cfg['out']}: {e}", file=sys.stderr)
        return FAILED
    s = result.summary()
    print(f"masked {sum(s['rows'].values())} rows in {time.perf_counter() - started:.1f}s: {s['replaced']} values "
          f"replaced, {s['personas']} personas, detectors {' + '.join(s['detectors'])}", file=sys.stderr)
    from .report import headline_lines

    for label, value in headline_lines(result.report.to_dict()):
        print(f"  {label:<12}  {value}", file=sys.stderr)
    for path in written:
        print(path)
    return OK


def demo_command(args: argparse.Namespace) -> int:
    from . import demo

    if args.export:
        from . import ui

        for path in ui.export(args.export, args.preset):
            print(path)
        return OK
    result, seconds = demo.run(args.preset)
    print(demo.render(result, seconds))
    if args.out:
        for path in result.save(args.out):
            print(path)
    return OK if not demo.leaks(result) and not result.report.headline["originals_found"] else FAILED


def main(argv: list[str] | None = None) -> int:
    from .bench.corpora import CORPORA
    from .bench.systems import NAMES
    from .detect.packs import PACKS
    from .persona import PRESETS

    parser = argparse.ArgumentParser(prog="maskara", description="Swap personal data for consistent personas.")
    parser.add_argument("--version", action="version", version=f"maskara {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    m = sub.add_parser("mask", help="mask tables and texts", description="Mask tables and free text together, "
                       "so one person becomes one persona everywhere. Flags extend the TOML config.")
    m.add_argument("config", nargs="?", help="TOML config: tables, texts, subjects, columns, preset, vault, ...")
    m.add_argument("--table", action="append", metavar="NAME=PATH", help="a .csv or .jsonl table (repeatable)")
    m.add_argument("--text", action="append", metavar="NAME=PATH", help="a .txt or .jsonl text collection")
    m.add_argument("--subject", action="append", metavar="NAME=COLUMN", help="the column holding the person's key")
    m.add_argument("--column", action="append", metavar="NAME.COLUMN=ROLE", help="override an inferred column role")
    m.add_argument("--preset", choices=sorted(PRESETS))
    m.add_argument("--vault", help="vault file (default .maskara/vault.db); keeps personas stable across runs")
    m.add_argument("--seed", help="public seed instead of a vault: reproducible by anyone, for demos and tests")
    m.add_argument("--detector", help="auto (default), rules, gliner2 or opf")
    m.add_argument("--pattern", action="append", metavar="PACK",
                   help=f"add a pattern pack to the rules (repeatable): {', '.join(sorted(PACKS))}")
    m.add_argument("--namespace")
    m.add_argument("--email-domain", dest="email_domain")
    m.add_argument("--out", help="output directory")

    d = sub.add_parser("demo", help="mask the bundled sample store data and show the result")
    d.add_argument("--out", help="also write the masked files here")
    d.add_argument("--preset", choices=sorted(PRESETS), default="balanced")
    d.add_argument("--export", metavar="DIR", help="write the static showroom (same as maskara ui --export)")

    r = sub.add_parser("report", help="print a saved report", description="Print the report a masking run "
                       "saved (report.json), and optionally render report.html again.")
    r.add_argument("path", help="output directory of `maskara mask`/`demo --out`, or its report.json")
    r.add_argument("--html", action="store_true", help="also (re)write report.html next to it")

    u = sub.add_parser("ui", help="open the local UI in the browser", description="Serve the maskara UI on "
                       "127.0.0.1 (random port, session token in the URL): view runs, mask the sample data or "
                       "your own files. Nothing leaves this machine.")
    u.add_argument("--port", type=int, default=0, help="port on 127.0.0.1 (default: a free one)")
    u.add_argument("--no-browser", action="store_true", help="print the URL instead of opening a browser")
    u.add_argument("--demo", action="store_true", help="start with the sample data already masked")
    u.add_argument("--export", metavar="DIR", help="write the static showroom (sample data only) to DIR and exit")
    u.add_argument("--preset", choices=sorted(PRESETS), default="balanced", help="preset of the exported demo")

    b = sub.add_parser("bench", help="score systems on benchmark corpora")
    b.add_argument("--corpus", nargs="+", choices=sorted(CORPORA), default=sorted(CORPORA))
    b.add_argument("--system", nargs="+", choices=NAMES, default=["none", "oracle-redact"])
    b.add_argument("--limit", type=int, help="first N documents of each corpus")
    b.add_argument("--out", default="runs", help="directory for results and saved system outputs")
    b.add_argument("--rescore", action="store_true", help="score saved outputs again instead of running systems")
    b.add_argument("--qa", choices=("linking", "llm"), help="also run Entity QA on corpora with questions "
                   "(llm: MASKARA_QA_BASE_URL + MASKARA_QA_MODEL, or ANTHROPIC_API_KEY)")
    hp = sub.add_parser("hero", help="draw the privacy/utility hero chart from saved runs")
    hp.add_argument("--corpus", default="linked", choices=sorted(CORPORA))
    hp.add_argument("--runs", default="runs", help="directory `maskara bench` wrote to")
    hp.add_argument("--external", metavar="SVG", help="draw the public chart over TAB, ABCD and Nemotron-PII "
                    "into this file instead")
    args = parser.parse_args(argv)
    commands = {"mask": mask_command, "demo": demo_command, "bench": bench, "report": report_command,
                "ui": ui_command, "hero": hero_command}
    return commands[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
