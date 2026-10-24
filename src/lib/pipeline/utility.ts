import { en, type Messages } from "@/lib/i18n/en"
import { normName, stripTitles } from "@/lib/mask"
import type { ImageItem, MaskedCell, MaskedTable, Segment, UtilityCheck, UtilityReport } from "@/lib/types"

// Utility = the masked data still answers the same questions as the original.
// Everything here is computed from the run output alone (each cell keeps its original).

const DAY = 86_400_000

function parseDate(s: string): number | null {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3])
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) return Date.UTC(+us[3], +us[1] - 1, +us[2])
  return null
}

function ageAt(dob: number, at: number): number {
  const b = new Date(dob)
  const d = new Date(at)
  let age = d.getUTCFullYear() - b.getUTCFullYear()
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--
  return age
}

const value = (cell: MaskedCell | undefined, side: "original" | "masked") =>
  cell?.kind === "value" ? (side === "original" ? cell.original : cell.value) : ""

const text = (t: { label: string; description: string }) => ({ label: t.label, description: t.description })
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const fmt = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "—")
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—")

type Visit = { person: string; at: number; row: string }
type Side = { visits: Visit[]; dob: Map<string, number> }

function collect(tables: MaskedTable[], side: "original" | "masked"): Side {
  const visits: Visit[] = []
  const dob = new Map<string, number>()
  for (const t of tables) {
    const pk = t.columns.find((c) => t.roles[c] === "person_key")
    if (!pk) continue
    const dobCol = t.columns.find((c) => t.roles[c] === "dob")
    const dateCols = t.columns.filter((c) => t.roles[c] === "date")
    t.rows.forEach((row, i) => {
      const person = value(row[pk], side)
      if (!person) return
      if (dobCol) {
        const d = parseDate(value(row[dobCol], side))
        if (d !== null) dob.set(person, d)
      }
      for (const c of dateCols) {
        const at = parseDate(value(row[c], side))
        if (at !== null) visits.push({ person, at, row: `${t.name}:${i}:${c}` })
      }
    })
  }
  return { visits, dob }
}

function byPerson(visits: Visit[]) {
  const m = new Map<string, Visit[]>()
  for (const v of visits) m.set(v.person, [...(m.get(v.person) ?? []), v])
  for (const list of m.values()) list.sort((a, b) => a.at - b.at || a.row.localeCompare(b.row))
  return m
}

function gaps(visits: Visit[]) {
  const out: { key: string; days: number }[] = []
  for (const list of byPerson(visits).values()) {
    for (let i = 1; i < list.length; i++) out.push({ key: `${list[i - 1].row}>${list[i].row}`, days: Math.round((list[i].at - list[i - 1].at) / DAY) })
  }
  return out
}

function revisitRate(visits: Visit[]) {
  const people = [...byPerson(visits).values()]
  const revisits = people.filter((list) => list.some((v, i) => i > 0 && (v.at - list[i - 1].at) / DAY > 0 && (v.at - list[i - 1].at) / DAY <= 30))
  return people.length ? revisits.length / people.length : NaN
}

function ageDecades(side: Side, at: number) {
  const hist = new Map<string, number>()
  for (const d of side.dob.values()) {
    const age = ageAt(d, at)
    const bucket = age >= 90 ? "90+" : `${Math.floor(age / 10) * 10}s`
    hist.set(bucket, (hist.get(bucket) ?? 0) + 1)
  }
  return hist
}

function totalVariation(a: Map<string, number>, b: Map<string, number>) {
  const na = [...a.values()].reduce((x, y) => x + y, 0) || 1
  const nb = [...b.values()].reduce((x, y) => x + y, 0) || 1
  const keys = new Set([...a.keys(), ...b.keys()])
  return [...keys].reduce((s, k) => s + Math.abs((a.get(k) ?? 0) / na - (b.get(k) ?? 0) / nb), 0) / 2
}

function richSegments(cell: MaskedCell, images: ImageItem[]): Segment[] {
  if (cell.kind === "text") return cell.segments
  if (cell.kind === "image") return images.slice(cell.item, cell.item + (cell.pages ?? 1)).flatMap((item) => item.ocr)
  if (cell.kind === "audio") return cell.transcript
  return []
}

export function computeUtility(
  tables: MaskedTable[],
  u: Messages["utility"] = en.utility,
  images: ImageItem[] = [],
): UtilityReport {
  const segmentsOf = (cell: MaskedCell) => richSegments(cell, images)
  const checks: UtilityCheck[] = []
  const add = (c: UtilityCheck) => checks.push(c)
  const orig = collect(tables, "original")
  const masked = collect(tables, "masked")
  const hasVisits = orig.visits.length > 0

  // ---- time ----
  if (hasVisits) {
    const og = gaps(orig.visits)
    const mg = new Map(gaps(masked.visits).map((g) => [g.key, g.days]))
    const same = og.filter((g) => mg.get(g.key) === g.days).length
    add({
      group: "time", id: "intervals", ...text(u.intervals),
      original: u.intervals.original(og.length), masked: u.intervals.masked(same, og.length), pass: same === og.length,
    })

    const maskedByRow = new Map(masked.visits.map((v) => [v.row, v]))
    const pairs = orig.visits
      .map((v) => ({ o: v, m: maskedByRow.get(v.row) }))
      .filter((p): p is { o: Visit; m: Visit } => !!p.m && orig.dob.has(p.o.person) && masked.dob.has(p.m.person))
    if (pairs.length) {
      const sameAge = pairs.filter((p) => ageAt(orig.dob.get(p.o.person)!, p.o.at) === ageAt(masked.dob.get(p.m.person)!, p.m.at)).length
      add({
        group: "time", id: "age-at-visit", ...text(u.ageAtVisit),
        original: u.ageAtVisit.original(pairs.length), masked: u.ageAtVisit.masked(sameAge, pairs.length), pass: sameAge / pairs.length >= 0.99,
      })
    }

    const shifts = orig.visits.map((v) => {
      const m = maskedByRow.get(v.row)
      return m ? Math.abs(Math.round((m.at - v.at) / DAY)) : 0
    })
    const maxShift = Math.max(0, ...shifts)
    add({
      group: "time", id: "shift", ...text(u.shift),
      original: "—", masked: u.shift.masked(maxShift), pass: maxShift <= 31,
    })
  }

  // ---- linkage ----
  const pkPairs = tables.flatMap((t) => {
    const pk = t.columns.find((c) => t.roles[c] === "person_key")
    return pk ? t.rows.map((r) => [value(r[pk], "original"), value(r[pk], "masked")] as const).filter(([o]) => o) : []
  })
  if (pkPairs.length) {
    const forward = new Map<string, Set<string>>()
    const backward = new Map<string, Set<string>>()
    for (const [o, m] of pkPairs) {
      forward.set(o, (forward.get(o) ?? new Set()).add(m))
      backward.set(m, (backward.get(m) ?? new Set()).add(o))
    }
    const split = [...forward.values()].filter((s) => s.size > 1).length
    const merged = [...backward.values()].filter((s) => s.size > 1).length
    add({
      group: "linkage", id: "person-key", ...text(u.personKey),
      original: u.personKey.original(forward.size), masked: u.personKey.masked(backward.size, split, merged), pass: split === 0 && merged === 0,
    })
  }

  const idMap = new Map<string, string>()
  for (const t of tables) {
    for (const c of t.columns.filter((c) => t.roles[c] === "id")) {
      for (const r of t.rows) {
        const o = value(r[c], "original").replace(/\D/g, "")
        if (o) idMap.set(o, value(r[c], "masked").replace(/\D/g, ""))
      }
    }
  }
  const textIds = tables.flatMap((t) => t.rows.flatMap((r) => Object.values(r).flatMap(segmentsOf)))
    .filter((s) => s.entity?.type === "ID_NUMBER")
    .map((s) => ({ o: s.entity!.original.replace(/\D/g, ""), m: s.text.replace(/\D/g, "") }))
    .filter((p) => idMap.has(p.o))
  if (textIds.length) {
    const consistent = textIds.filter((p) => idMap.get(p.o) === p.m).length
    add({
      group: "linkage", id: "ids", ...text(u.ids),
      original: u.ids.original(textIds.length), masked: u.ids.masked(consistent, textIds.length), pass: consistent === textIds.length,
    })
  }

  const names = new Map<string, Set<string>>()
  for (const s of tables.flatMap((t) => t.rows.flatMap((r) => Object.values(r).flatMap(segmentsOf)))) {
    if (s.entity?.type !== "PERSON") continue
    const key = normName(stripTitles(s.entity.original))
    if (key.split(" ").length < 2) continue
    names.set(key, (names.get(key) ?? new Set()).add(normName(stripTitles(s.text))))
  }
  if (names.size) {
    const inconsistent = [...names.values()].filter((s) => s.size > 1).length
    const replacements = [...names.values()].flatMap((s) => [...s])
    const collisions = replacements.length - new Set(replacements).size
    add({
      group: "linkage", id: "names", ...text(u.names),
      original: u.names.original(names.size), masked: u.names.masked(inconsistent, collisions), pass: inconsistent === 0 && collisions === 0,
    })
  }

  // ---- distribution ----
  for (const role of ["sex"] as const) {
    const col = tables.flatMap((t) => t.columns.filter((c) => t.roles[c] === role).map((c) => ({ t, c })))[0]
    if (!col) continue
    const count = (side: "original" | "masked") => {
      const m = new Map<string, number>()
      col.t.rows.forEach((r) => m.set(value(r[col.c], side), (m.get(value(r[col.c], side)) ?? 0) + 1))
      return [...m.entries()].sort().map(([k, n]) => `${k || "?"} ${n}`).join(" · ")
    }
    add({
      group: "distribution", id: "sex", ...text(u.sex),
      original: count("original"), masked: count("masked"), pass: count("original") === count("masked"),
    })
  }

  if (orig.dob.size) {
    const at = Math.max(Date.UTC(2026, 0, 1), ...orig.visits.map((v) => v.at))
    const tvd = totalVariation(ageDecades(orig, at), ageDecades(masked, at))
    const show = (h: Map<string, number>) => [...h.entries()].sort().map(([k, n]) => `${k} ${n}`).join(" · ")
    add({
      group: "distribution", id: "age-decades", ...text(u.ageDecades),
      original: show(ageDecades(orig, at)), masked: `${show(ageDecades(masked, at))} (TVD ${fmt(tvd, 2)})`, pass: tvd <= 0.1,
    })
  }

  const zipCells = tables.flatMap((t) => t.columns.filter((c) => t.roles[c] === "zip").flatMap((c) => t.rows.map((r) => r[c])))
  const zips = zipCells.filter((c) => value(c, "original"))
  if (zips.length) {
    const same = zips.filter((c) => value(c, "original").slice(0, 3) === value(c, "masked").slice(0, 3)).length
    add({
      group: "distribution", id: "zip3", ...text(u.zip3),
      original: u.zip3.original(zips.length), masked: u.zip3.masked(same, zips.length), pass: same === zips.length,
    })
  }

  const keepCells = tables.flatMap((t) => t.columns.filter((c) => t.roles[c] === "keep" || t.roles[c] === "sex").flatMap((c) => t.rows.map((r) => r[c])))
  if (keepCells.length) {
    const same = keepCells.filter((c) => value(c, "original") === value(c, "masked")).length
    const cols = [...new Set(tables.flatMap((t) => t.columns.filter((c) => t.roles[c] === "keep")))].join(", ")
    add({
      group: "distribution", id: "keep", label: u.keep.label, description: u.keep.description(cols),
      original: u.keep.original(keepCells.length), masked: u.keep.masked(same, keepCells.length), pass: same === keepCells.length,
    })
  }

  // ---- analysis parity ----
  if (hasVisits) {
    const o = revisitRate(orig.visits)
    const m = revisitRate(masked.visits)
    add({
      group: "analysis", id: "revisit", ...text(u.revisit),
      original: pct(o, 1), masked: pct(m, 1), pass: Math.abs(o - m) < 1e-9,
    })
    const og = mean(gaps(orig.visits).map((g) => g.days))
    const mg = mean(gaps(masked.visits).map((g) => g.days))
    add({
      group: "analysis", id: "mean-gap", ...text(u.meanGap),
      original: u.meanGap.value(fmt(og)), masked: u.meanGap.value(fmt(mg)), pass: Math.abs(og - mg) < 0.05,
    })
    const ages = (side: Side) =>
      mean(side.visits.filter((v) => side.dob.has(v.person)).map((v) => ageAt(side.dob.get(v.person)!, v.at)))
    const oa = ages(orig)
    const ma = ages(masked)
    if (Number.isFinite(oa)) {
      add({
        group: "analysis", id: "mean-age", ...text(u.meanAge),
        original: u.meanAge.value(fmt(oa)), masked: u.meanAge.value(fmt(ma)), pass: Math.abs(oa - ma) <= 0.5,
      })
    }
    const visitsPer = (side: Side) => mean([...byPerson(side.visits).values()].map((l) => l.length))
    add({
      group: "analysis", id: "visits-per", ...text(u.visitsPer),
      original: fmt(visitsPer(orig), 2), masked: fmt(visitsPer(masked), 2), pass: Math.abs(visitsPer(orig) - visitsPer(masked)) < 1e-9,
    })
  }

  // ---- how much free text survives untouched ----
  let total = 0
  let replaced = 0
  for (const t of tables) {
    for (const r of t.rows) {
      for (const cell of Object.values(r)) {
        if (cell.kind !== "text" && cell.kind !== "audio") continue
        for (const s of segmentsOf(cell)) {
          const len = s.entity ? s.entity.original.length : s.text.length
          total += len
          if (s.entity && s.entity.original !== s.text) replaced += len
        }
      }
    }
  }

  const scored = checks.filter((c) => c.pass !== null)
  return {
    checks,
    passed: scored.filter((c) => c.pass).length,
    total: scored.length,
    textKeptPct: total ? 1 - replaced / total : null,
    timelines: timelines(orig, masked),
  }
}

/** A few patients' visit timelines, original vs masked, for display. */
function timelines(orig: Side, masked: Side): UtilityReport["timelines"] {
  const maskedByRow = new Map(masked.visits.map((v) => [v.row, v]))
  const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10)
  return [...byPerson(orig.visits).entries()]
    .map(([person, list]) => {
      const unique = list.filter((v, i) => i === 0 || v.at !== list[i - 1].at)
      return {
        person,
        original: unique.map((v) => fmtDate(v.at)),
        masked: unique.map((v) => fmtDate(maskedByRow.get(v.row)?.at ?? v.at)),
        maskedPerson: maskedByRow.get(list[0].row)?.person ?? "",
      }
    })
    .filter((t) => t.original.length >= 2)
    .slice(0, 4)
}
