import { segmentsToText } from "@/lib/mask"
import type { ColumnRole, MaskedCell, MaskedTable } from "@/lib/types"

// Group-by / aggregate queries over a run's output. Every cell keeps its original value,
// so the same query can run on the masked side and the original side and be compared.

export type Side = "masked" | "original"

export type Field = { id: string; table: string; column: string; role: ColumnRole }

export type Bucket = "none" | "year" | "month" | "age10" | "bin10"
export type FilterOp = "eq" | "ne" | "contains" | "gt" | "lt" | "empty" | "notEmpty"
export type MetricFn = "count" | "distinct" | "mean" | "sum" | "min" | "max"

export type Dim = { field: string; bucket: Bucket }
export type Filter = { field: string; op: FilterOp; value: string }
export type Metric = { fn: MetricFn; field: string }
export type Join = { table: string; on: string }

export type Query = { table: string; join: Join | null; filters: Filter[]; dims: Dim[]; metrics: Metric[] }

export type ResultRow = { key: string[]; values: (number | null)[] }

const SKIP_ROLES = new Set<ColumnRole>(["image", "audio"])
const DAY = 86_400_000

export function cellValue(cell: MaskedCell | undefined, side: Side): string {
  if (!cell) return ""
  if (cell.kind === "value") return side === "masked" ? cell.value : cell.original
  if (cell.kind === "text") return side === "masked" ? segmentsToText(cell.segments) : cell.original
  return ""
}

export function fieldsOf(table: MaskedTable): Field[] {
  return table.columns
    .filter((c) => !SKIP_ROLES.has(table.roles[c]))
    .map((c) => ({ id: `${table.name}.${c}`, table: table.name, column: c, role: table.roles[c] }))
}

/** Tables that share a column with `base`; the person-key column is preferred as the join column. */
export function joinable(tables: MaskedTable[], base: string): Join[] {
  const t = tables.find((x) => x.name === base)
  if (!t) return []
  return tables
    .filter((o) => o.name !== base)
    .flatMap((o) => {
      const shared = t.columns.filter((c) => o.columns.includes(c))
      const on = shared.find((c) => t.roles[c] === "person_key") ?? shared[0]
      return on ? [{ table: o.name, on }] : []
    })
}

export function num(s: string): number | null {
  const t = s.trim().replace(/,/g, "")
  return t !== "" && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

export function date(s: string): number | null {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3])
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) return Date.UTC(+us[3], +us[1] - 1, +us[2])
  return null
}

function ageYears(at: number): number {
  return Math.floor((Date.now() - at) / (365.2425 * DAY))
}

export function bucketValue(v: string, bucket: Bucket): string {
  if (bucket === "none" || v === "") return v
  if (bucket === "bin10") {
    const n = num(v)
    if (n === null) return v
    const lo = Math.floor(n / 10) * 10
    return `${lo}–${lo + 9}`
  }
  const d = date(v)
  if (d === null) return v
  const iso = new Date(d).toISOString()
  if (bucket === "year") return iso.slice(0, 4)
  if (bucket === "month") return iso.slice(0, 7)
  const lo = Math.floor(ageYears(d) / 10) * 10
  return `${lo}–${lo + 9}`
}

/** Base rows (left-joined with one table) as `table.column` → value maps for one side. */
export function flatten(tables: MaskedTable[], q: Pick<Query, "table" | "join">, side: Side): Record<string, string>[] {
  const base = tables.find((t) => t.name === q.table)
  if (!base) return []
  const cols = fieldsOf(base)
  const rows = base.rows.map((r) => Object.fromEntries(cols.map((f) => [f.id, cellValue(r[f.column], side)])))
  const other = q.join && tables.find((t) => t.name === q.join!.table)
  if (!q.join || !other) return rows

  const otherCols = fieldsOf(other)
  const index = new Map<string, Record<string, string>[]>()
  for (const r of other.rows) {
    const key = cellValue(r[q.join.on], side)
    const flat = Object.fromEntries(otherCols.map((f) => [f.id, cellValue(r[f.column], side)]))
    index.set(key, [...(index.get(key) ?? []), flat])
  }
  const onId = `${base.name}.${q.join.on}`
  return rows.flatMap((r) => (index.get(r[onId]) ?? [{}]).map((o) => ({ ...r, ...o })))
}

function compare(a: string, b: string): number {
  const na = num(a)
  const nb = num(b)
  if (na !== null && nb !== null) return na - nb
  const da = date(a)
  const db = date(b)
  if (da !== null && db !== null) return da - db
  return a.localeCompare(b)
}

function matches(row: Record<string, string>, f: Filter): boolean {
  const v = row[f.field] ?? ""
  switch (f.op) {
    case "empty":
      return v === ""
    case "notEmpty":
      return v !== ""
    case "eq":
      return v.toLowerCase() === f.value.toLowerCase()
    case "ne":
      return v.toLowerCase() !== f.value.toLowerCase()
    case "contains":
      return v.toLowerCase().includes(f.value.toLowerCase())
    case "gt":
      return v !== "" && compare(v, f.value) > 0
    case "lt":
      return v !== "" && compare(v, f.value) < 0
  }
}

function aggregate(rows: Record<string, string>[], m: Metric): number | null {
  if (m.fn === "count") return rows.length
  const vals = rows.map((r) => r[m.field] ?? "").filter((v) => v !== "")
  if (m.fn === "distinct") return new Set(vals).size
  const nums = vals.map(num).filter((n): n is number => n !== null)
  if (!nums.length) {
    // Dates: min/max as epoch days, so they still compare across sides.
    const dates = vals.map(date).filter((n): n is number => n !== null)
    if (!dates.length || (m.fn !== "min" && m.fn !== "max")) return null
    return (m.fn === "min" ? Math.min(...dates) : Math.max(...dates)) / DAY
  }
  switch (m.fn) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0)
    case "mean":
      return nums.reduce((a, b) => a + b, 0) / nums.length
    case "min":
      return Math.min(...nums)
    case "max":
      return Math.max(...nums)
  }
}

export function runQuery(tables: MaskedTable[], q: Query, side: Side): ResultRow[] {
  const rows = flatten(tables, q, side).filter((r) => q.filters.every((f) => matches(r, f)))
  const groups = new Map<string, { key: string[]; rows: Record<string, string>[] }>()
  for (const r of rows) {
    const key = q.dims.map((d) => bucketValue(r[d.field] ?? "", d.bucket))
    const k = JSON.stringify(key)
    const g = groups.get(k) ?? { key, rows: [] }
    g.rows.push(r)
    groups.set(k, g)
  }
  if (!q.dims.length && !groups.size) groups.set("[]", { key: [], rows: [] })
  return [...groups.values()].map((g) => ({ key: g.key, values: q.metrics.map((m) => aggregate(g.rows, m)) }))
}

/** Masked and original results joined on the group key; keys that exist on one side only get nulls on the other. */
export function compareQuery(tables: MaskedTable[], q: Query): { key: string[]; masked: (number | null)[]; original: (number | null)[] }[] {
  const masked = runQuery(tables, q, "masked")
  const original = runQuery(tables, q, "original")
  const empty = q.metrics.map(() => null)
  const out = new Map<string, { key: string[]; masked: (number | null)[]; original: (number | null)[] }>()
  for (const r of masked) out.set(JSON.stringify(r.key), { key: r.key, masked: r.values, original: empty })
  for (const r of original) {
    const k = JSON.stringify(r.key)
    const hit = out.get(k)
    if (hit) hit.original = r.values
    else out.set(k, { key: r.key, masked: empty, original: r.values })
  }
  return [...out.values()]
}

export type ColumnProfile = {
  field: Field
  filled: number
  distinct: number
  kind: FieldKind
  min: string | null
  max: string | null
  mean: number | null
  top: { value: string; n: number }[]
}

export function profile(table: MaskedTable, side: Side): ColumnProfile[] {
  return fieldsOf(table).map((field) => {
    const vals = table.rows.map((r) => cellValue(r[field.column], side)).filter((v) => v !== "")
    const counts = new Map<string, number>()
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1)
    const kind = kindOf(vals)
    const sorted = kind === "text" ? [] : [...vals].sort(compare)
    const ns = vals.map(num).filter((n): n is number => n !== null)
    return {
      field,
      filled: vals.length,
      distinct: counts.size,
      kind,
      min: sorted[0] ?? null,
      max: sorted.at(-1) ?? null,
      mean: kind === "number" && ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null,
      top: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([value, n]) => ({ value, n })),
    }
  })
}

export type FieldKind = "number" | "date" | "text"

function kindOf(vals: string[]): FieldKind {
  if (!vals.length) return "text"
  if (vals.every((v) => num(v) !== null)) return "number"
  if (vals.every((v) => date(v) !== null)) return "date"
  return "text"
}

/** Value type of every field, from its non-empty masked values. */
export function fieldKinds(tables: MaskedTable[]): Map<string, FieldKind> {
  const out = new Map<string, FieldKind>()
  for (const t of tables) {
    for (const f of fieldsOf(t)) out.set(f.id, kindOf(t.rows.map((r) => cellValue(r[f.column], "masked")).filter((v) => v !== "")))
  }
  return out
}

/** Min/max over a date field come back as epoch days. */
export function formatMetric(v: number | null, m: Metric, kinds: Map<string, FieldKind>): string {
  if (v === null) return "—"
  if ((m.fn === "min" || m.fn === "max") && kinds.get(m.field) === "date") return new Date(v * DAY).toISOString().slice(0, 10)
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)
}
