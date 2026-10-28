"""The report as HTML: a fragment the local UI embeds, and a self-contained page around it.

No scripts, no external assets: the page is one file that opens anywhere, offline. Every string from
the report is escaped (input and column names come from the user's files).
"""

from __future__ import annotations

from html import escape
from pathlib import Path

CSS = Path(__file__).with_name("report.css")


def _pct(x: float | None, digits: int = 1) -> str:
    return "n/a" if x is None else f"{100 * x:.{digits}f}%"


def _where(w: dict) -> str:
    return escape(f"{w['source']}.{w['column']} row {w['row'] + 1}")


def _scope(section: dict) -> str:
    parts = [f"<p><b>Measured:</b> {escape(section['measured'])}</p>"] if section.get("measured") else []
    if section.get("not_measured"):
        parts.append(f"<p><b>Not measured:</b> {escape(section['not_measured'])}</p>")
    return f'<div class="scope">{"".join(parts)}</div>' if parts else ""


def _card(title: str, value: str, body: str, section: dict, cls: str = "", tone: str = "") -> str:
    return (f'<article class="card {cls}"><div class="card-hd"><h3>{escape(title)}</h3>'
            f'<span class="val {tone}">{value}</span></div>{body}{_scope(section)}</article>')


def _rows(head: list[str], rows: list[list[str]], num: set[int] = frozenset()) -> str:
    th = "".join(f'<th class="{"num" if i in num else ""}">{escape(h)}</th>' for i, h in enumerate(head))
    tr = "".join("<tr>" + "".join(f'<td class="{"num" if i in num else ""}">{c}</td>' for i, c in enumerate(r))
                 + "</tr>" for r in rows)
    return f'<table class="kv"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>'


def _chips(counts: dict) -> str:
    items = sorted(counts.items(), key=lambda kv: -kv[1])
    return '<div class="chips">' + "".join(f'<span class="chip">{escape(str(k).lower())} <b>{n}</b></span>'
                                           for k, n in items) + "</div>"


def _bar(x: float) -> str:
    return f'<div class="bar"><i style="width:{max(0.0, min(1.0, x)) * 100:.1f}%"></i></div>'


def tiles(data: dict) -> str:
    h = data["headline"]
    items = [
        (str(h["originals_found"]), f"of {h['originals_scanned']}", "known identifiers found in the output"
         + (f"; {h['originals_partial']} partial matches to review" if h["originals_partial"] else ""),
         "bad" if h["originals_found"] else ""),
        (str(h["broken_joins"]), f"of {h['joins_checked']}", "joins broken that worked before",
         "bad" if h["broken_joins"] else ""),
        (_pct(h["date_gaps_exact"], 0), "", f"of {h['date_gaps_checked']} per-person date gaps exact",
         "bad" if (h["date_gaps_exact"] or 1) < 1 else ""),
        (_pct(h["format_valid"], 0), "", "of replaced emails, phones, dates and cards still parse", ""),
        (str(h["personas"]), "", (f"personas; {h['replaced']} values replaced, {_pct(h['placeholder_share'], 0)} "
                                 "placeholders"), ""),
    ]
    if h["max_unique_share"] is not None:
        items.append((_pct(h["max_unique_share"], 0), "", "of rows unique on the quasi-identifiers kept",
                      "warn" if h["max_unique_share"] > 0.2 else ""))
    return '<div class="tiles">' + "".join(
        f'<div class="tile {tone}"><b>{escape(big)}<small>{escape(small)}</small></b><span>{escape(label)}</span></div>'
        for big, small, label, tone in items) + "</div>"


def privacy(p: dict) -> str:
    re_ = p["reappearance"]
    hits = re_["hits"][:12]
    body = _rows(["level", "values"], [["exact", str(re_["exact"])], ["normalized", str(re_["normalized"])],
                                       ["partial", str(re_["partial"])], ["scanned", str(re_["scanned"])]], {1})
    if hits:
        body += '<p class="kicker" style="margin-top:14px">Where (no values shown)</p>' + _rows(
            ["level", "kind", "found in", "original at"],
            [[escape(x["level"]), escape(x["label"]), _where(x["found_in"]), _where(x["original_at"])] for x in hits])
    tone = "bad" if re_["found"] else ""
    cards = [_card("Original re-appearance", f"{re_['found']} found", body, re_, "wide", tone)]

    qi = p["quasi_identifiers"]
    for name, t in qi["tables"].items():
        rows = [[escape(label), _bar(n / t["rows"] if t["rows"] else 0), str(n)] for label, n in t.get("k", {}).items()]
        body = (f'<p class="lead" style="margin:0 0 8px">kept: <span class="mono">{escape(", ".join(t["kept"]) or "none")}'
                f"</span></p>")
        body += _rows(["k (rows sharing the values)", "", "rows"], rows, {2}) if rows else ""
        link = t["linkage"]
        body += _rows(["linkage attack", "re-identified"],
                      [[escape(", ".join(link["columns"])), (f"{link['reidentified']} of {link['attempted']} "
                                                            f"({_pct(link['rate'])})")]], {1})
        value = f"min k {t['min_k']}" if t.get("min_k") else "nothing kept"
        cards.append(_card(f"Quasi-identifiers · {name}", escape(value), body, qi,
                           tone="warn" if (t.get("unique_share") or 0) > 0.2 else ""))

    d = p["detections"]
    body = (f'<p class="kicker">By category</p>{_chips(d["by_category"])}'
            f'<p class="kicker" style="margin-top:12px">By detector</p>{_chips(d["by_detector"])}'
            f'<p class="kicker" style="margin-top:12px">Owner found by</p>{_chips(d["by_link"])}')
    cards.append(_card("Replaced values", str(d["replaced"]), body, d))
    u = d["unlinked"]
    body = _chips(u["by_category"]) if u["by_category"] else '<p class="lead" style="margin:0">None.</p>'
    cards.append(_card("Unlinked values", str(u["mentions"]), body, u, tone="warn" if u["mentions"] else ""))
    if identity := d.get("identity"):
        body = _chips(identity["by_resolution"]) + '<p>Review locations and reasons: <code>review.json</code></p>'
        cards.append(_card("Identity review", str(identity["review_mentions"]), body, identity,
                           tone="warn" if identity["review_mentions"] else ""))
    return f'<div class="cards">{"".join(cards)}</div>'


def fidelity(f: dict) -> str:
    s = f["schema"]
    body = _rows(["input", "rows before", "rows after", "columns"],
                 [[escape(n), str(t["rows_before"]), str(t["rows_after"]), "same" if t["columns_same"] else "changed"]
                  for n, t in s["tables"].items()], {1, 2})
    cards = [_card("Schema and row counts", "unchanged" if s["ok"] else "changed", body, s, tone="" if s["ok"] else "bad")]

    j = f["joins"]
    rows = [[escape(f"{p['from']} → {p['to']}"), str(p["checked"]), str(p["broken"]), str(p["spurious"])]
            for p in j["pairs"]]
    rows.append(["ids in free text → tables", str(j["text_refs"]["checked"]), str(j["text_refs"]["broken"]), "–"])
    cards.append(_card("Join integrity", f"{j['broken']} broken", _rows(["join", "checked", "broken", "spurious"],
                                                                        rows, {1, 2, 3}), j,
                       tone="bad" if j["broken"] else ""))

    g = f["date_gaps"]
    body = _rows(["", ""], [["people with two or more dates", str(g["people"])], ["gaps compared", str(g["pairs"])],
                            ["exact", str(g["exact"])], ["largest error", f"{g['max_error_days']} days"]], {1})
    cards.append(_card("Within-person date gaps", _pct(g["exact_share"]), body, g,
                       tone="bad" if (g["exact_share"] or 1) < 1 else ""))

    fm = f["formats"]
    body = _rows(["format", "checked", "valid"],
                 [[escape(k), str(v["checked"]), f"{v['valid']} ({_pct(v['share'])})"] for k, v in fm["kinds"].items()],
                 {1, 2})
    cards.append(_card("Format validity", _pct(fm["share"]), body, fm))

    dist = f["distributions"]
    rows = [[escape(f"{c['table']}.{c['column']}"), escape(c["role"] + (f" ({c['what']})" if c["what"] else "")),
             escape(c["test"].upper()), _bar(c["value"]), f"{c['value']:.3f}"] for c in dist["columns"]]
    cards.append(_card("Distribution distance", f"{len(rows)} columns",
                       _rows(["column", "role", "test", "", "distance"], rows, {4}), dist, "wide"))

    ph, n = f["placeholders"], f["non_pii"]
    body = _rows(["", ""], [["placeholders among replacements", f"{ph['placeholders']} of {ph['replaced']}"],
                            ["text characters outside replaced spans changed",
                             f"{n['text_chars_changed']} of {n['text_chars']}"],
                            ["cells of kept columns changed", f"{n['kept_cells_changed']} of {n['kept_cells']}"]], {1})
    cards.append(_card("Placeholders and over-masking", _pct(n["share"]), body,
                       {"measured": f"{ph['measured']}; {n['measured']}", "not_measured": n["not_measured"]}))
    return f'<div class="cards">{"".join(cards)}</div>'


def fragment(data: dict) -> str:
    inputs = ", ".join(f"{n} ({i['rows']} {'rows' if i['kind'] == 'table' else 'texts'})" for n, i in data["inputs"].items())
    blind = "".join(f"<li>{escape(x)}</li>" for x in data["not_measured"])
    return (f'<div class="rp">{tiles(data)}'
            f'<p class="lead" style="margin-top:14px">Preset <b>{escape(data["preset"])}</b> · detectors '
            f'{escape(" + ".join(data["detectors"]))} · {escape(inputs)} · maskara {escape(data["maskara"])}</p>'
            f'<p class="kicker" style="margin-top:40px">Privacy</p><h2 style="margin-top:0">Did anything leak?</h2>'
            f'<p class="lead">Searched in the output, using the originals in memory during the run. '
            f'This report holds no original values: counts and locations only.</p>{privacy(data["privacy"])}'
            f'<p class="kicker" style="margin-top:40px">Fidelity</p><h2 style="margin-top:0">Is it still the same data?'
            f'</h2><p class="lead">Structure, joins, date gaps, distributions and formats, before against after.</p>'
            f'{fidelity(data["fidelity"])}'
            f'<p class="kicker" style="margin-top:40px">Blind spots</p><h2 style="margin-top:0">Not measured</h2>'
            f'<p class="lead">What these numbers cannot tell you.</p><ul class="blind">{blind}</ul></div>')


def page(data: dict) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>maskara report</title>
<style>{CSS.read_text(encoding="utf-8")}
body {{ margin: 0; background: var(--bg); }}
main {{ max-width: 1080px; margin: 0 auto; padding: 48px 24px 96px; }}
header {{ display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }}
header svg {{ width: 22px; height: 22px; color: var(--ink); }}
header b {{ font: 600 17px var(--sans); letter-spacing: -.03em; color: var(--ink); }}
header span {{ color: var(--faint); font: 12.5px var(--mono); }}
</style></head>
<body><main>
<header>{LOGO}<b>maskara</b><span>report</span></header>
{fragment(data)}
</main></body></html>
"""


# The wand from web/src/components/logo.tsx.
LOGO = ('<svg viewBox="93 107 312 312" fill="currentColor" aria-hidden="true">'
        '<g transform="rotate(45 256 256)">'
        '<path d="M239.3 70 241.4 77.6 232.2 85.2 236.5 92.8 225.9 100.4 232.5 108 221.4 115.6 230 123.2 219.2 '
        '130.8 229.4 138.4 219.6 146 230.6 153.6 222.5 161.2 233.6 168.8 227.6 176.4 237.9 184 234.3 '
        '191.6 243 199.2 239.3 206.8 244 214.4 239.3 222 272.6 222 268 214.4 272.6 206.8 269 199.2 '
        '277.7 191.6 274.1 184 284.4 176.4 278.4 168.8 289.5 161.2 281.4 153.6 292.4 146 282.6 138.4 '
        '292.8 130.8 282 123.2 290.6 115.6 279.5 108 286.1 100.4 275.5 92.8 279.8 85.2 270.6 77.6 '
        '272.6 70Z"/>'
        '<rect x="248" y="210" width="16" height="112" rx="3"/>'
        '<rect x="220" y="316" width="72" height="126" rx="12"/></g></svg>')
