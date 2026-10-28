// maskara UI: renders a run bundle (maskara.bundle/1, see maskara/ui/bundle.py). No dependencies.
// Modes: "local" (served by `maskara ui` on 127.0.0.1, can run masking through /api/run) and
// "static" (the exported showroom: the bundle is inlined in the page, nothing is sent anywhere).
// Every value from the bundle goes into the DOM as text; only the report fragment, which maskara
// renders and escapes itself, is inserted as HTML.
(() => {
  "use strict";
  const CONFIG = JSON.parse(document.getElementById("maskara-config").textContent);
  const LOCAL = CONFIG.mode === "local";
  const REPO = "https://github.com/maskaradev/maskara-ai";
  const INSTALL = "pip install git+" + REPO;
  const WAITLIST = "https://maskara.dev/#waitlist";
  const LIMIT = 100;
  const LOGO = '<svg viewBox="93 107 312 312" fill="currentColor" aria-hidden="true"><g transform="rotate(45 256 256)"><path d="M239.3 70 241.4 77.6 232.2 85.2 236.5 92.8 225.9 100.4 232.5 108 221.4 115.6 230 123.2 219.2 130.8 229.4 138.4 219.6 146 230.6 153.6 222.5 161.2 233.6 168.8 227.6 176.4 237.9 184 234.3 191.6 243 199.2 239.3 206.8 244 214.4 239.3 222 272.6 222 268 214.4 272.6 206.8 269 199.2 277.7 191.6 274.1 184 284.4 176.4 278.4 168.8 289.5 161.2 281.4 153.6 292.4 146 282.6 138.4 292.8 130.8 282 123.2 290.6 115.6 279.5 108 286.1 100.4 275.5 92.8 279.8 85.2 270.6 77.6 272.6 70Z"/><rect x="248" y="210" width="16" height="112" rx="3"/><rect x="220" y="316" width="72" height="126" rx="12"/></g></svg>';
  const GITHUB = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.64 7.64 0 0 1 8 3.87c.68 0 1.36.09 2 .26 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';
  const MOON = '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M13.5 5.4A11 11 0 1 0 26.6 18.5 9 9 0 0 1 13.5 5.4Z"/></svg>';

  let B = null; // the bundle
  let D = null; // indexes over it
  const ui = { originals: true, limit: LIMIT, filter: "" };

  // -- helpers --------------------------------------------------------------------------------------

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "svg") el.innerHTML = v; // constant icons above
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }
  const key = (s, r, c) => s + "\u0000" + r + "\u0000" + c;
  const fmt = (v) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));
  const pct = (x, d = 1) => (x == null ? "n/a" : (100 * x).toFixed(d) + "%");
  const enc = encodeURIComponent;
  const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const plural = (n, word) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

  function index(bundle) {
    const fields = bundle.mentions.fields;
    const inputs = {};
    for (const inp of bundle.inputs) {
      inp.col = Object.fromEntries(inp.columns.map((c, j) => [c.name, j]));
      inputs[inp.name] = inp;
    }
    const cells = new Map();
    const mentions = bundle.mentions.rows.map((r, i) => {
      const m = { i };
      fields.forEach((f, j) => (m[f] = r[j]));
      const k = key(m.source, m.row, m.column);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(m);
      return m;
    });
    const personas = Object.fromEntries(bundle.personas.map((p) => [p.id, p]));
    const d = { inputs, cells, mentions, personas };
    for (const m of mentions) {
      const after = fmt(cellOf(bundle, d, "after", m.source, m.row, m.column));
      m.replacement = m.start == null ? after : Array.from(after).slice(m.out_start, m.out_end).join("");
    }
    // Every free-text cell, for the text viewer.
    d.texts = [];
    for (const inp of bundle.inputs)
      for (const c of inp.columns.filter((c) => c.role === "text"))
        bundle.rows[inp.name].after.forEach((row, r) => {
          if (typeof row[inp.col[c.name]] === "string" && row[inp.col[c.name]].trim())
            d.texts.push({ source: inp.name, row: r, column: c.name, n: (cells.get(key(inp.name, r, c.name)) || []).length });
        });
    return d;
  }

  function cellOf(bundle, d, side, source, row, column) {
    const rows = bundle.rows[source][side];
    return rows ? rows[row][d.inputs[source].col[column]] : undefined;
  }
  const cell = (side, s, r, c) => cellOf(B, D, side, s, r, c);
  const showBefore = () => B.meta.originals && ui.originals;

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: Object.assign({ "X-Maskara-Token": CONFIG.token }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
    return data;
  }

  // -- highlighted text -----------------------------------------------------------------------------

  function marked(text, ms, side) {
    const cps = Array.from(fmt(text));
    const spans = ms.filter((m) => m.start != null)
      .map((m) => (side === "before" ? [m.start, m.end, m] : [m.out_start, m.out_end, m]))
      .sort((a, b) => a[0] - b[0]);
    const out = [];
    let pos = 0;
    for (const [a, b, m] of spans) {
      if (a < pos) continue;
      out.push(cps.slice(pos, a).join(""));
      out.push(h("mark", { class: `hl c-${m.category} ${side}${m.changed ? "" : " kept"}`, "data-m": m.i }, cps.slice(a, b).join("")));
      pos = b;
    }
    out.push(cps.slice(pos).join(""));
    return out;
  }

  function legend(ms) {
    const counts = {};
    for (const m of ms) counts[m.category] = (counts[m.category] || 0) + 1;
    return h("div", { class: "legend" },
      Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) =>
        h("span", { class: `dot c-${c}` }, c.toLowerCase(), h("b", {}, n))));
  }

  const tip = h("div", { class: "tip", hidden: true });
  function showTip(el, ev) {
    const m = D.mentions[+el.dataset.m];
    const p = m.persona && D.personas[m.persona];
    const rows = [
      ["detector", m.detector + (m.score < 1 ? ` (${m.score})` : "")],
      ["persona", p ? p.name : "no known person"],
      p && p.original && showBefore() ? ["original", p.original] : null,
      ["owner by", { row: "the row's subject", known: "a value in the tables", context: "the only person in the text", name: "the same name elsewhere", value: "nobody (keyed on the value)" }[m.link] || m.link],
      m.changed ? null : ["kept", "by the preset's policy"],
    ].filter(Boolean);
    tip.replaceChildren(h("b", { class: `dot c-${m.category}` }, `${m.category.toLowerCase()} · ${m.label}`),
      h("dl", {}, rows.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])));
    tip.hidden = false;
    const x = Math.min(ev.clientX + 14, window.innerWidth - 336);
    const y = ev.clientY + 18 + tip.offsetHeight > window.innerHeight ? ev.clientY - tip.offsetHeight - 12 : ev.clientY + 18;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  document.addEventListener("mouseover", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-m]");
    document.querySelectorAll(".hot").forEach((x) => x.classList.remove("hot"));
    if (!el || !D) return (tip.hidden = true);
    document.querySelectorAll(`[data-m="${el.dataset.m}"]`).forEach((x) => x.classList.add("hot"));
    showTip(el, ev);
  });

  // -- chrome ---------------------------------------------------------------------------------------

  function route() {
    const [view, ...rest] = location.hash.slice(1).split("/").map(decodeURIComponent);
    return { view: view || "overview", rest };
  }

  function topBar(view) {
    const tabs = [["overview", "Overview"], ["tables", "Tables"], ["texts", "Texts"], ["personas", "Personas"], ["report", "Report"]];
    if (LOCAL) tabs.push(["run", "Run"]);
    const theme = () => {
      const now = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = now === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("maskara-theme", next); } catch (e) { /* private mode */ }
    };
    return h("header", { class: "top" }, h("div", { class: "wrap" },
      h("a", { class: "brand", href: "#overview", svg: LOGO + "<b>maskara</b>" }),
      h("nav", { class: "tabs" }, tabs.map(([v, label]) =>
        h("a", { href: "#" + v, "aria-current": v === view ? "page" : null }, label))),
      h("div", { class: "top-end" },
        h("span", { class: "badge" }, h("i"), LOCAL ? "local · nothing leaves this machine" : "showroom · precomputed"),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Toggle theme", svg: MOON, onclick: theme }))));
  }

  function copyCommand() {
    const btn = h("button", { type: "button" }, "Copy");
    btn.addEventListener("click", () => navigator.clipboard.writeText(INSTALL).then(() => {
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    }));
    return h("span", { class: "cmd" }, h("code", {}, h("b", {}, "$"), INSTALL), btn);
  }

  function banner() {
    if (LOCAL) return null;
    return h("div", { class: "banner" }, h("div", { class: "wrap" },
      h("span", {}, h("strong", {}, "Synthetic sample data"), " — run maskara locally on your own data. Nothing here was uploaded; every value on both sides is synthetic."),
      h("span", { class: "links" }, copyCommand(),
        h("a", { class: "btn btn-secondary", href: REPO, svg: GITHUB + "GitHub" }),
        h("a", { class: "btn btn-primary", href: WAITLIST }, "Join the waitlist"))));
  }

  function footer() {
    return h("footer", { class: "foot" },
      h("span", {}, `maskara ${B ? B.meta.maskara : ""} · Apache-2.0`),
      h("a", { href: REPO }, "GitHub"),
      LOCAL ? h("span", {}, "Served from 127.0.0.1; this page talks to nothing else.") : h("a", { href: "https://maskara.dev" }, "maskara.dev"));
  }

  function pageHead(kicker, title, sub, extra) {
    return h("div", { class: "page-hd" }, h("div", {}, h("p", { class: "kicker" }, kicker), h("h1", {}, title), sub ? h("p", { class: "sub" }, sub) : null), extra || null);
  }

  // -- views ----------------------------------------------------------------------------------------

  function overview() {
    const r = B.report, hd = r.headline;
    const rows = B.inputs.reduce((n, x) => n + x.rows, 0);
    const tiles = [
      [String(hd.originals_found), `of ${hd.originals_scanned}`, "known identifiers found in the output" + (hd.originals_partial ? ` · ${hd.originals_partial} partial to review` : ""), hd.originals_found ? "bad" : ""],
      [String(hd.broken_joins), `of ${hd.joins_checked}`, "joins broken that worked before", hd.broken_joins ? "bad" : ""],
      [pct(hd.date_gaps_exact, 0), "", `of ${hd.date_gaps_checked} per-person date gaps exact`, ""],
      [String(hd.personas), "", `personas for ${plural(hd.replaced, "replaced value")}`, ""],
    ];
    const featured = D.texts.slice(0, 60).reduce((best, t) => {
      const cats = new Set((D.cells.get(key(t.source, t.row, t.column)) || []).map((m) => m.category)).size;
      return !best || cats > best.cats ? Object.assign({ cats }, t) : best;
    }, null);
    return [
      pageHead(B.meta.synthetic ? "Sample run · synthetic data" : "Your run",
        B.meta.title || "Same people, new faces.",
        `${plural(rows, "row")} across ${plural(B.inputs.length, "input")}, masked with preset ${B.meta.preset} and detectors ${B.meta.detectors.join(" + ")}${B.meta.seed ? `, public seed "${B.meta.seed}"` : ""}. Every person became one persona in every table and text.`),
      B.meta.notices.map((n) => h("p", { class: "notice" }, n)),
      h("div", { class: "rp" }, h("div", { class: "tiles" }, tiles.map(([big, small, label, tone]) =>
        h("div", { class: "tile " + tone }, h("b", {}, big, h("small", {}, small)), h("span", {}, label))))),
      featured ? [h("h2", { class: "sec" }, "Before and after"), textPanes(featured, true)] : null,
      h("h2", { class: "sec" }, "Inputs"),
      h("div", { class: "inputs" }, B.inputs.map((inp) => {
        const replaced = D.mentions.filter((m) => m.source === inp.name && m.changed).length;
        const href = inp.kind === "table" ? `#tables/${enc(inp.name)}` : `#texts/${enc(inp.name)}`;
        return h("a", { class: "inp", href },
          h("h3", {}, inp.name, h("small", {}, inp.file || inp.kind)),
          h("p", {}, `${plural(inp.rows, inp.kind === "table" ? "row" : "text")} · ${plural(replaced, "value")} replaced`),
          h("div", { class: "chips" }, inp.columns.map((c) => roleChip(c, true))));
      })),
      h("h2", { class: "sec" }, "One persona everywhere"),
      h("div", { class: "people" }, B.personas.slice(0, 6).map(personaLink)),
    ];
  }

  function roleChip(c, withName) {
    return h("span", { class: "role" + (c.category && c.role !== "keep" ? ` c-${c.category}` : ""), title: withName ? c.role : null },
      withName ? `${c.name}` : c.role);
  }

  function personaLink(p) {
    const where = Object.entries(p.inputs).map(([k, n]) => `${k} ${n}`).join(" · ");
    return h("a", { class: "person-link", href: `#personas/${enc(p.id)}` }, h("div", { class: "who" },
      h("span", { class: "avatar" }, initials(p.name)),
      h("div", {}, h("b", {}, p.name), h("small", {}, where))));
  }

  function tables(name) {
    const list = B.inputs.filter((x) => x.kind === "table");
    if (!list.length) return [pageHead("Tables", "No tables in this run."), null];
    const inp = D.inputs[name] && D.inputs[name].kind === "table" ? D.inputs[name] : list[0];
    const before = showBefore();
    const rows = B.rows[inp.name].after;
    const shown = rows.slice(0, ui.limit);
    const ms = D.mentions.filter((m) => m.source === inp.name && m.start == null);
    return [
      pageHead("Tables", [inp.name, " ", h("span", {}, inp.file ? `· ${inp.file}` : "")],
        `${plural(inp.rows, "row")}. Column roles were inferred from headers and values${inp.subject ? `; rows belong to the person in ${inp.subject}` : ""}. Replaced cells are tinted by category${before ? ", with the original struck above" : ""}; hover one for its persona.`),
      h("nav", { class: "pills" }, list.map((x) => h("a", { href: `#tables/${enc(x.name)}`, "aria-current": x === inp ? "page" : null }, x.name, h("small", {}, x.rows)))),
      h("div", { class: "toolbar" }, originalsSwitch(), legend(ms)),
      h("div", { class: "scroll" }, h("table", { class: "grid" },
        h("thead", {}, h("tr", {}, h("th", { class: "n" }, "#"), inp.columns.map((c) =>
          h("th", {}, h("div", {}, c.name, roleChip(c, false)))))),
        h("tbody", {}, shown.map((row, r) => h("tr", {}, h("td", { class: "n" }, r + 1),
          inp.columns.map((c) => tableCell(inp, r, c, before))))))),
      rows.length > shown.length ? h("div", { class: "more" }, h("button", { class: "btn btn-secondary", type: "button", onclick: () => { ui.limit = Infinity; render(); } }, `Show all ${rows.length} rows`)) : null,
    ];
  }

  function originalsSwitch() {
    if (!B.meta.originals) return h("span", { class: "status" }, "originals not included in this bundle");
    const box = h("input", { type: "checkbox", checked: ui.originals, onchange: () => { ui.originals = box.checked; render(); } });
    return h("label", { class: "switch" }, box, B.meta.synthetic ? "Show originals (synthetic)" : "Show originals (local only)");
  }

  function tableCell(inp, r, c, before) {
    const after = cell("after", inp.name, r, c.name);
    const ms = D.cells.get(key(inp.name, r, c.name)) || [];
    if (c.role === "text") {
      const text = fmt(after);
      return h("td", { class: "txt" }, text ? h("a", { href: `#texts/${enc(inp.name)}/${r}/${enc(c.name)}` }, `open · ${ms.length}`) : null, text.slice(0, 90));
    }
    const m = ms.find((x) => x.start == null);
    if (!m) return h("td", {}, fmt(after));
    return h("td", { class: "rep", "data-m": m.i },
      before ? h("span", { class: "was" }, fmt(cell("before", inp.name, r, c.name))) : null,
      h("span", { class: `now c-${m.category}${m.changed ? "" : " kept"}` }, fmt(after)));
  }

  function textPanes(t, compact) {
    const ms = D.cells.get(key(t.source, t.row, t.column)) || [];
    const before = showBefore();
    const changed = ms.filter((m) => m.changed).length;
    const pane = (side, label) => h("div", { class: "pane " + side },
      h("div", { class: "pane-hd" }, h("b", {}, label), side === "after" ? h("span", { class: "state" }, `${changed} replaced`) : h("span", { class: "state" }, B.meta.synthetic ? "synthetic original" : "original · local only")),
      h("pre", { class: "prose" }, marked(cell(side, t.source, t.row, t.column), ms, side)));
    return [
      h("div", { class: "text-hd" }, h("h3", {}, `${t.source} · row ${t.row + 1}${t.column !== "text" ? ` · ${t.column}` : ""}`),
        compact ? h("a", { class: "status", href: `#texts/${enc(t.source)}/${t.row}/${enc(t.column)}` }, "open in Texts →") : null, legend(ms)),
      h("div", { class: "panes" + (before ? "" : " one") }, before ? pane("before", "before") : null, pane("after", "after")),
    ];
  }

  function texts(source, row, column) {
    if (!D.texts.length) return [pageHead("Texts", "No free text in this run.")];
    const t = D.texts.find((x) => x.source === source && x.row === +row && (column == null || x.column === column)) ||
      D.texts.find((x) => x.source === source) || D.texts[0];
    const ms = (D.cells.get(key(t.source, t.row, t.column)) || []).slice().sort((a, b) => a.start - b.start);
    const before = showBefore();
    const search = h("input", { type: "search", placeholder: "Filter texts…", value: ui.filter, "aria-label": "Filter texts" });
    const items = h("div", {});
    const fill = () => {
      const q = search.value.toLowerCase();
      ui.filter = search.value;
      items.replaceChildren(...D.texts.filter((x) => !q || fmt(cell("after", x.source, x.row, x.column)).toLowerCase().includes(q) || x.source.includes(q)).slice(0, 400).map((x) =>
        h("a", { href: `#texts/${enc(x.source)}/${x.row}/${enc(x.column)}`, "aria-current": x === t ? "page" : null },
          h("b", {}, `${x.source} #${x.row + 1}`, h("small", {}, x.n)),
          h("span", {}, fmt(cell("after", x.source, x.row, x.column)).replace(/\s+/g, " ").slice(0, 80)))));
    };
    search.addEventListener("input", fill);
    fill();
    return [
      pageHead("Texts", "Free text, span by span", `Each detected value is replaced in place; the rest of the text is untouched. Colors are categories; hover a value for its detector, persona and how its owner was found.`, originalsSwitch()),
      h("div", { class: "split" }, h("aside", { class: "list" }, search, items), h("div", {},
        textPanes(t, false),
        h("table", { class: "audit" }, h("thead", {}, h("tr", {}, ["value", "category", "detector", "persona", "owner by"].map((x) => h("th", {}, x)))),
          h("tbody", {}, ms.map((m) => {
            const p = m.persona && D.personas[m.persona];
            const orig = before ? Array.from(fmt(cell("before", m.source, m.row, m.column))).slice(m.start, m.end).join("") : null;
            return h("tr", { "data-m": m.i },
              h("td", {}, orig != null ? [h("s", {}, orig), " → "] : null, m.replacement),
              h("td", {}, h("span", { class: `role c-${m.category}` }, `${m.category.toLowerCase()} · ${m.label}`)),
              h("td", { class: "mono" }, m.detector),
              h("td", {}, p ? h("a", { href: `#personas/${enc(p.id)}` }, p.name) : h("span", { class: "status" }, "—")),
              h("td", { class: "mono" }, m.link));
          }))))),
    ];
  }

  function personas(id) {
    if (!B.personas.length) return [pageHead("Personas", "No personas in this run.")];
    const p = D.personas[id] || B.personas[0];
    const before = showBefore();
    const search = h("input", { type: "search", placeholder: "Filter personas…", "aria-label": "Filter personas" });
    const items = h("div", {});
    const fill = () => {
      const q = search.value.toLowerCase();
      items.replaceChildren(...B.personas.filter((x) => !q || x.name.toLowerCase().includes(q) || (before && x.original && x.original.toLowerCase().includes(q))).map((x) =>
        h("a", { href: `#personas/${enc(x.id)}`, "aria-current": x === p ? "page" : null },
          h("b", {}, x.name, h("small", {}, x.mentions)),
          h("span", {}, [x.sex, x.age, [x.city, x.state].filter(Boolean).join(", ")].filter((v) => v != null && v !== "").join(" · ")))));
    };
    search.addEventListener("input", fill);
    fill();
    const ms = D.mentions.filter((m) => m.persona === p.id);
    const facts = [["sex", p.sex], ["age", p.age], ["email", p.email], ["phone", p.phone], ["street", p.street],
      ["city", [p.city, p.state, p.zip].filter(Boolean).join(", ")], ["occupation", (p.occupation || "").replace(/_/g, " ")]];
    return [
      pageHead("Personas", "One person, one persona", "A persona is drawn once per person and reused in every table and text, so joins, histories and date gaps survive. Every field is synthetic."),
      h("div", { class: "split" }, h("aside", { class: "list" }, search, items), h("div", {},
        h("section", { class: "pcard" }, h("div", { class: "who" }, h("span", { class: "avatar big" }, initials(p.name)),
          h("div", {}, h("h2", {}, p.name), before && p.original ? h("span", { class: "was" }, "was ", h("s", {}, p.original)) : null)),
          h("dl", { class: "facts" }, facts.filter(([, v]) => v != null && v !== "").map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v)))),
          h("div", { class: "where" }, Object.entries(p.inputs).map(([k, n]) => h("span", { class: "role" }, `${k} · ${n}`)))),
        h("table", { class: "audit" }, h("thead", {}, h("tr", {}, ["where", "value", "category", "detector"].map((x) => h("th", {}, x)))),
          h("tbody", {}, ms.slice(0, 300).map((m) => {
            const isText = m.start != null;
            const href = isText ? `#texts/${enc(m.source)}/${m.row}/${enc(m.column)}` : `#tables/${enc(m.source)}`;
            const orig = before ? Array.from(fmt(cell("before", m.source, m.row, m.column))).slice(m.start ?? 0, m.end ?? undefined).join("") : null;
            return h("tr", { "data-m": m.i },
              h("td", { class: "mono" }, h("a", { href }, `${m.source}.${m.column} #${m.row + 1}`)),
              h("td", {}, orig != null ? [h("s", {}, orig), " → "] : null, m.replacement),
              h("td", {}, h("span", { class: `role c-${m.category}` }, `${m.category.toLowerCase()} · ${m.label}`)),
              h("td", { class: "mono" }, m.detector));
          }))),
        ms.length > 300 ? h("p", { class: "status" }, `first 300 of ${ms.length}`) : null)),
    ];
  }

  function report() {
    const body = h("div", {});
    body.innerHTML = B.report_html; // rendered and escaped by maskara.report.html
    return [pageHead("Report", "Privacy and fidelity, measured", "Computed during the run from the originals in memory; the report itself holds counts and locations, never original values. Each card says what it measured and what it could not."), body];
  }

  function runForm() {
    const rows = h("div", {});
    const addRow = (kind = "table", name = "", path = "", subject = "") => {
      const row = h("div", { class: "row" },
        h("select", { "aria-label": "kind" }, h("option", { value: "table", selected: kind === "table" }, "table"), h("option", { value: "text", selected: kind === "text" }, "texts")),
        h("input", { placeholder: "name", value: name, "aria-label": "input name" }),
        h("input", { placeholder: "/path/to/file.csv or .jsonl", value: path, "aria-label": "file path" }),
        h("input", { placeholder: "subject column", value: subject, "aria-label": "subject column" }),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Remove", onclick: () => row.remove() }, "×"));
      rows.append(row);
    };
    addRow();
    const preset = h("select", {}, ["balanced", "strict", "max_utility"].map((p) => h("option", { value: p }, p)));
    const detector = h("select", {}, [["rules", "rules (no model)"], ["auto", "auto (GLiNER2 if installed)"], ["gliner2", "gliner2"], ["opf", "opf"]].map(([v, l]) => h("option", { value: v }, l)));
    const out = h("input", { placeholder: "optional: /path/to/output-dir" });
    const status = h("span", { class: "status" });
    const err = h("p", { class: "err" });
    const go = async (body, btn) => {
      btn.disabled = true;
      err.textContent = "";
      status.textContent = "masking… (originals stay in this process)";
      try {
        const res = await api("/api/run", body);
        B = res.bundle;
        D = index(B);
        ui.limit = LIMIT;
        status.textContent = res.written ? `wrote ${res.written.length} files` : "";
        location.hash = "#overview";
        render();
      } catch (e) {
        err.textContent = e.message;
        status.textContent = "";
      } finally {
        btn.disabled = false;
      }
    };
    const demoBtn = h("button", { class: "btn btn-primary", type: "button" }, "Mask the sample store data");
    demoBtn.addEventListener("click", () => go({ demo: true, preset: preset.value }, demoBtn));
    const runBtn = h("button", { class: "btn btn-primary", type: "button" }, "Run on these files");
    runBtn.addEventListener("click", () => {
      const body = { tables: {}, texts: {}, subjects: {}, preset: preset.value, detector: detector.value, out: out.value.trim() || null };
      for (const row of rows.children) {
        const [kind, name, path, subject] = [...row.querySelectorAll("select, input")].map((x) => x.value.trim());
        if (!path) continue;
        const n = name || path.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
        body[kind === "table" ? "tables" : "texts"][n] = path;
        if (subject) body.subjects[n] = subject;
      }
      go(body, runBtn);
    });
    return [
      pageHead("Run", "Mask data on this machine", "Paths are read by the maskara process on this computer. Nothing is uploaded: this page and its server only talk over 127.0.0.1, and the originals stay in memory."),
      h("div", { class: "form" },
        h("fieldset", {}, h("legend", {}, "Try it"), h("div", { class: "actions" }, demoBtn, h("span", { class: "status" }, "an online store: customers, agents, orders, tickets and notes (synthetic, bundled)"))),
        h("fieldset", {}, h("legend", {}, "Your files"), rows,
          h("button", { class: "btn btn-secondary", type: "button", onclick: () => addRow() }, "+ Add a file"),
          h("p", { class: "hint" }, "Tables: .csv or .jsonl. Texts: .txt or .jsonl (strings, or objects with a \"text\" field). The subject column holds the person's key; rows of different files with the same key are the same person.")),
        h("fieldset", {}, h("legend", {}, "Options"), h("div", { class: "opts" },
          h("label", {}, "Preset", preset), h("label", {}, "Detector", detector), h("label", {}, "Write masked files to", out)),
          h("p", { class: "hint" }, "Without an output directory nothing is written. Personas here use a fresh key per run; use `maskara mask --vault` for stable personas across runs.")),
        h("div", { class: "actions" }, runBtn, status), err),
    ];
  }

  function empty() {
    return h("div", { class: "empty" }, h("h2", {}, "No run yet"), h("p", {}, "Mask the bundled sample data or your own files to see the result here."),
      h("a", { class: "btn btn-primary", href: "#run" }, "Start a run"));
  }

  function render() {
    const { view, rest } = route();
    let body;
    if (view === "run" && LOCAL) body = runForm();
    else if (!B) body = [pageHead("maskara", "Same people, new faces."), empty()];
    else if (view === "tables") body = tables(rest[0]);
    else if (view === "texts") body = texts(rest[0], rest[1], rest[2]);
    else if (view === "personas") body = personas(rest[0]);
    else if (view === "report") body = report();
    else body = overview();
    tip.hidden = true;
    document.getElementById("app").replaceChildren(topBar(view), banner() || "", h("main", {}, h("div", { class: "wrap" }, body, footer())), tip);
  }

  let lastView = null;
  window.addEventListener("hashchange", () => {
    const view = route().view;
    if (view !== lastView) { ui.limit = LIMIT; window.scrollTo(0, 0); }
    lastView = view;
    render();
  });

  async function start() {
    try {
      const saved = localStorage.getItem("maskara-theme");
      if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
    } catch (e) { /* private mode */ }
    if (LOCAL) {
      B = (await api("/api/bundle")).bundle;
    } else {
      B = JSON.parse(document.getElementById("maskara-bundle").textContent);
    }
    if (B) D = index(B);
    lastView = route().view;
    render();
  }
  start().catch((e) => {
    document.getElementById("app").replaceChildren(h("p", { class: "boot" }, "maskara could not start: " + e.message));
  });
})();
