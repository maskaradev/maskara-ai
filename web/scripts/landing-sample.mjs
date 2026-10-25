#!/usr/bin/env node
// Writes src/components/site/sample-data.ts, the values the landing page shows, from the showroom bundle
// (public/demo/bundle.json: the synthetic sample store bundled with maskara, masked with the public seed).
// Nothing on the page is typed by hand: re-export the showroom, then run `node scripts/landing-sample.mjs`.
//
// It follows one customer through every input (their row, their orders, a support transcript and an agent
// note) and copies the run's report numbers.

import { readFileSync, writeFileSync } from "node:fs"

const WEB = new URL("..", import.meta.url)
const OUT = new URL("src/components/site/sample-data.ts", WEB)

/** The customer to follow, and the ticket of theirs that an agent note refers to. */
const CUSTOMER = "CUS-223800"
const TICKET = "T40292"
/** Transcript lines quoted in "Why not redact": the chat's opening line and the one with an order and a date. */
const EXCERPT_LINES = [0, 4]
const PLACEHOLDER = { PERSON: "[PERSON]", ID: "[ID]", DATE: "[DATE]", CONTACT: "[CONTACT]", ADDRESS: "[ADDRESS]" }

const bundle = JSON.parse(readFileSync(new URL("public/demo/bundle.json", WEB), "utf8"))
const rows = bundle.rows
const mentions = bundle.mentions.rows.map((r) => Object.fromEntries(bundle.mentions.fields.map((f, i) => [f, r[i]])))
const columns = Object.fromEntries(bundle.inputs.map((i) => [i.name, i.columns.map((c) => c.name)]))

const fail = (msg) => {
  throw new Error(`landing-sample: ${msg}`)
}
const record = (table, row) => Object.fromEntries(columns[table].map((c, i) => [c, rows[table].before[row][i]]))
const masked = (table, row) => Object.fromEntries(columns[table].map((c, i) => [c, rows[table].after[row][i]]))
const find = (table, test) => rows[table].before.flatMap((_, i) => (test(record(table, i)) ? [i] : []))

const custRow = find("customers", (r) => r.customer_id === CUSTOMER)[0] ?? fail(`no customer ${CUSTOMER}`)
const ticketRow = find("tickets", (r) => r.ticket_id === TICKET)[0] ?? fail(`no ticket ${TICKET}`)
const orderRows = find("orders", (r) => r.customer_id === CUSTOMER)
const noteRow =
  find("notes", (r) => r.text.includes(TICKET) && r.text.includes(CUSTOMER))[0] ?? fail(`no note on ${TICKET}`)
const personaId =
  mentions.find((m) => m.source === "customers" && m.row === custRow && m.column === "customer_id")?.persona ??
  fail("customer has no persona")
const persona = bundle.personas.find((p) => p.id === personaId)

const cust = record("customers", custRow)
const custOut = masked("customers", custRow)
const ticket = record("tickets", ticketRow)
const mainOrder = orderRows.find((r) => record("orders", r).order_number === ticket.order_number)
if (mainOrder === undefined) fail("the ticket's order is not the customer's")

/** One key per fact of this customer, so the same fact lights up together; everyone else is "other". */
function entity(m, original) {
  if (m.persona !== personaId) return "other"
  if (m.label === "id") {
    if (original.endsWith(CUSTOMER)) return "cid"
    if (original === TICKET) return "ticket"
    if (original === ticket.order_number) return "order"
    return "id"
  }
  const keys = { full_name: "name", first_name: "name", last_name: "name", person: "name", address: "addr" }
  return keys[m.label] ?? m.label
}

/** A cell: plain when it came out the same, otherwise [entity, original, masked]. */
function cell(table, row, column) {
  const before = record(table, row)[column]
  const after = masked(table, row)[column]
  const m = mentions.find((x) => x.source === table && x.row === row && x.column === column && x.start === null)
  if (before === after) return before
  if (!m) fail(`${table}[${row}].${column} changed with no mention`)
  return [entity(m, before), before, after]
}

/** Free text as runs and replaced spans, checking that everything between the spans came out untouched. */
function text(table, row, column) {
  const before = record(table, row)[column]
  const after = masked(table, row)[column]
  const spans = mentions
    .filter((m) => m.source === table && m.row === row && m.column === column && m.start !== null)
    .sort((a, b) => a.start - b.start)
  const segs = []
  let at = 0
  let outAt = 0
  for (const m of spans) {
    if (m.start < at) fail(`overlapping spans in ${table}[${row}]`)
    const gap = before.slice(at, m.start)
    if (gap !== after.slice(outAt, m.out_start)) fail(`${table}[${row}] changed outside a span`)
    if (gap) segs.push(gap)
    const o = before.slice(m.start, m.end)
    const n = after.slice(m.out_start, m.out_end)
    segs.push(o === n ? o : [entity(m, o), o, n, m.category])
    at = m.end
    outAt = m.out_end
  }
  if (before.slice(at) !== after.slice(outAt)) fail(`${table}[${row}] changed after the last span`)
  if (before.slice(at)) segs.push(before.slice(at))
  return segs
}

const strip = (segs) => segs.map((s) => (typeof s === "string" ? s : s.slice(0, 3)))

/** Splits text segments into lines; a replaced span never crosses a line break. */
function lines(segs) {
  const out = [[]]
  for (const s of segs) {
    if (typeof s !== "string") out.at(-1).push(s)
    else
      s.split("\n").forEach((part, i) => {
        if (i) out.push([])
        if (part) out.at(-1).push(part)
      })
  }
  return out
}

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const order = record("orders", mainOrder)
const orderOut = masked("orders", mainOrder)
const ticketOut = masked("tickets", ticketRow)
const shift = days(order.placed_on, orderOut.placed_on)
if (shift !== days(ticket.opened_on, ticketOut.opened_on)) fail("the customer's dates moved by different offsets")

const subject = {
  id: CUSTOMER,
  maskedId: custOut.customer_id,
  name: `${cust.first_name} ${cust.last_name}`,
  persona: persona.name,
  about: `${cust.city}, ${cust.state}`,
  shift: `${shift < 0 ? "−" : "+"}${Math.abs(shift)}d`,
}
if (subject.persona !== `${custOut.first_name} ${custOut.last_name}`) fail("persona name differs from the row")

const personaMap = [
  { entity: "name", label: "name", original: subject.name, masked: subject.persona },
  { entity: "cid", label: "customer", original: cust.customer_id, masked: custOut.customer_id },
  { entity: "email", label: "email", original: cust.email, masked: custOut.email },
  { entity: "phone", label: "phone", original: cust.phone, masked: custOut.phone },
  { entity: "addr", label: "street", original: cust.street, masked: custOut.street },
  { entity: "dob", label: "birth date", original: cust.birth_date, masked: custOut.birth_date },
  { entity: "order", label: "order", original: order.order_number, masked: orderOut.order_number },
  { entity: "ticket", label: "ticket", original: TICKET, masked: ticketOut.ticket_id },
  { entity: "date", label: "dates", original: order.placed_on, masked: orderOut.placed_on },
]

const fields = (table, row, cols) => cols.map((c) => ({ column: c, cell: cell(table, row, c) }))
const tabs = [
  {
    name: "Customer",
    file: "customers.csv",
    records: [{ meta: [`row ${custRow + 1}`], fields: fields("customers", custRow, columns.customers) }],
  },
  {
    name: "Orders",
    file: "orders.csv",
    records: orderRows.map((r) => ({ meta: [`row ${r + 1}`], fields: fields("orders", r, columns.orders) })),
  },
  {
    name: "Ticket",
    file: "tickets.csv · transcript",
    records: [
      {
        meta: [
          cell("tickets", ticketRow, "ticket_id"),
          " · ",
          cell("tickets", ticketRow, "customer_id"),
          " · order ",
          cell("tickets", ticketRow, "order_number"),
          ` · ${ticket.channel} · `,
          cell("tickets", ticketRow, "opened_on"),
        ],
        text: strip(text("tickets", ticketRow, "transcript")),
      },
    ],
  },
  {
    name: "Note",
    file: "notes.jsonl",
    records: [{ meta: [`line ${noteRow + 1}`], text: strip(text("notes", noteRow, "text")) }],
  },
]

const transcript = lines(text("tickets", ticketRow, "transcript"))
const excerpt = EXCERPT_LINES.map((i) =>
  transcript[i].map((s) => (typeof s === "string" ? s : [s[0], s[1], s[2], PLACEHOLDER[s[3]] ?? `[${s[3]}]`])),
)

const report = bundle.report
const linkage = report.privacy.quasi_identifiers.tables.customers.linkage
const evidence = {
  order: [`ORD-${order.order_number}`, `ORD-${orderOut.order_number}`],
  customer: [cust.customer_id, custOut.customer_id],
  placed: [order.placed_on, orderOut.placed_on],
  opened: [ticket.opened_on, ticketOut.opened_on],
  gap: [days(order.placed_on, ticket.opened_on), days(orderOut.placed_on, ticketOut.opened_on)],
}
if (!record("notes", noteRow).text.includes(evidence.order[0])) fail("the note doesn't carry the ORD- prefix")
if (!masked("notes", noteRow).text.includes(evidence.order[1])) fail("the masked note lost the ORD- prefix")

const numbers = {
  originalsFound: report.headline.originals_found,
  originalsScanned: report.headline.originals_scanned,
  brokenJoins: report.headline.broken_joins,
  joinsChecked: report.headline.joins_checked,
  dateGapsExact: report.headline.date_gaps_exact,
  dateGapsChecked: report.headline.date_gaps_checked,
  reidentified: linkage.reidentified,
  linkageAttempted: linkage.attempted,
  replaced: report.headline.replaced,
  personas: report.headline.personas,
}

/** JSON as TypeScript: bare keys, and arrays of plain values (spans, pairs) kept on one line. */
function json(v, indent = "") {
  const inner = indent + "  "
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== "object")) return JSON.stringify(v).replaceAll('","', '", "')
    return `[\n${v.map((x) => inner + json(x, inner)).join(",\n")},\n${indent}]`
  }
  if (v && typeof v === "object") {
    const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k))
    const flat = Object.entries(v).map(([k, x]) => `${key(k)}: ${json(x, inner)}`)
    const line = `{ ${flat.join(", ")} }`
    if (!line.includes("\n") && indent.length + line.length < 110) return line
    return `{\n${Object.entries(v)
      .map(([k, x]) => `${inner}${key(k)}: ${json(x, inner)}`)
      .join(",\n")},\n${indent}}`
  }
  return JSON.stringify(v)
}
writeFileSync(
  OUT,
  `// Generated by scripts/landing-sample.mjs from public/demo/bundle.json: the synthetic sample store bundled with
// maskara, masked with the public seed "${bundle.meta.seed}" (preset ${bundle.meta.preset}). Don't edit by hand.

/** Text with replaced spans: [entity, original, masked]. Spans sharing an entity are one fact. */
export type Seg = string | [entity: string, original: string, masked: string]
/** A table row (fields) or a text (text), with a header line. */
export type SampleRecord = { meta: Seg[]; fields?: { column: string; cell: Seg }[]; text?: Seg[] }
export type SampleTab = { name: string; file: string; records: SampleRecord[] }
/** A replaced span with what a typical redaction would have put there instead. */
export type Redactable = string | [entity: string, original: string, masked: string, placeholder: string]

/** The customer every tab follows. */
export const SUBJECT = ${json(subject)}

/** Their facts, original to persona: every input draws from the same map. */
export const PERSONA_MAP: { entity: string; label: string; original: string; masked: string }[] = ${json(personaMap)}

/** Their row, their orders, the support transcript, and the agent note about that ticket. */
export const TABS: SampleTab[] = ${json(tabs)}

/** Two lines of that transcript, for "Why not redact". */
export const EXCERPT: Redactable[][] = ${json(excerpt)}

/** [original, masked] pairs for the "How it works" cards; gap is [original, masked] days from order to ticket. */
export const EVIDENCE = ${json(evidence)}

/** The run's report (report.headline and the customers table's linkage attack). */
export const REPORT = ${json(numbers)}
`,
)
console.log(`wrote ${OUT.pathname}: ${subject.id} ${subject.name} → ${subject.persona}`)
