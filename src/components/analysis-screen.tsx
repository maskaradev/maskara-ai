"use client"

import { Download, Plus, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  compareQuery,
  fieldKinds,
  fieldsOf,
  formatMetric,
  joinable,
  profile,
  runQuery,
  type Bucket,
  type Field,
  type FieldKind,
  type FilterOp,
  type MetricFn,
  type Query,
  type Side,
} from "@/lib/analysis"
import { toCsv } from "@/lib/datasets"
import { useMessages } from "@/lib/i18n"
import { useAppStore, useHydrated } from "@/lib/store"
import type { MaskedTable, Run } from "@/lib/types"
import { cn } from "@/lib/utils"

type Mode = Side | "compare"

const OPS: FilterOp[] = ["eq", "ne", "contains", "gt", "lt", "empty", "notEmpty"]
const FNS: MetricFn[] = ["count", "distinct", "mean", "sum", "min", "max"]
const BUCKETS: Record<FieldKind, Bucket[]> = {
  number: ["none", "bin10"],
  date: ["none", "year", "month", "age10"],
  text: ["none"],
}
const MAX_ROWS = 200

function defaultQuery(tables: MaskedTable[], table: string): Query {
  const t = tables.find((x) => x.name === table)
  // Start grouped by the first low-cardinality kept column, if any.
  const dim = t?.columns.find((c) => (t.roles[c] === "keep" || t.roles[c] === "sex") && new Set(t.rows.map((r) => JSON.stringify(r[c]))).size <= 20)
  return { table, join: null, filters: [], dims: dim ? [{ field: `${table}.${dim}`, bucket: "none" }] : [], metrics: [{ fn: "count", field: "" }] }
}

function FieldSelect({ fields, value, onChange, className }: { fields: Field[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger size="sm" className={cn("w-56", className)}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {fields.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Small<T extends string>({ value, options, labels, onChange, className }: { value: T; options: T[]; labels: Record<T, string>; onChange: (v: T) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="sm" className={cn("w-32", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels[o]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Row({ label, children, onAdd }: { label: string; children: React.ReactNode; onAdd: () => void }) {
  const a = useMessages().analysis
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-3">
      <span className="pt-1.5 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-1.5">
        {children}
        <Button variant="ghost" size="sm" className="h-7 self-start px-2 text-xs text-muted-foreground" onClick={onAdd}>
          <Plus />
          {a.add}
        </Button>
      </div>
    </div>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const a = useMessages().analysis
  return (
    <Button variant="ghost" size="icon" className="size-7" aria-label={a.remove} onClick={onClick}>
      <X />
    </Button>
  )
}

function downloadCsv(name: string, columns: string[], rows: string[][]) {
  const blob = new Blob([toCsv(columns, rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))))], { type: "text/csv" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function QueryPanel({ tables, query, setQuery, mode, runNumber }: { tables: MaskedTable[]; query: Query; setQuery: (q: Query) => void; mode: Mode; runNumber: number }) {
  const a = useMessages().analysis
  const [sort, setSort] = useState<{ col: number; desc: boolean } | null>(null)
  const kinds = useMemo(() => fieldKinds(tables), [tables])
  const fields = useMemo(
    () => tables.filter((t) => t.name === query.table || t.name === query.join?.table).flatMap(fieldsOf),
    [tables, query.table, query.join],
  )
  const update = (patch: Partial<Query>) => setQuery({ ...query, ...patch })
  const setAt = <K extends "filters" | "dims" | "metrics">(key: K, i: number, patch: Partial<Query[K][number]>) =>
    update({ [key]: query[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const removeAt = (key: "filters" | "dims" | "metrics", i: number) => update({ [key]: query[key].filter((_, j) => j !== i) })

  const valid: Query = {
    ...query,
    filters: query.filters.filter((f) => f.field),
    dims: query.dims.filter((d) => d.field),
    metrics: query.metrics.filter((m) => m.fn === "count" || m.field),
  }
  // Outputs are at most ~1,000 rows, so the query reruns on every render.
  const result =
    mode === "compare"
      ? compareQuery(tables, valid).map((r) => ({ key: r.key, values: r.masked, original: r.original as (number | null)[] | null }))
      : runQuery(tables, valid, mode).map((r) => ({ key: r.key, values: r.values, original: null as (number | null)[] | null }))

  const metricLabel = (m: Query["metrics"][number]) => (m.fn === "count" ? a.fns.count : `${a.fns[m.fn]}(${m.field.split(".").slice(1).join(".")})`)
  const header = [
    ...valid.dims.map((d) => (d.bucket === "none" ? d.field : `${d.field} · ${a.buckets[d.bucket]}`)),
    ...valid.metrics.flatMap((m) =>
      mode === "compare" ? [`${metricLabel(m)} · ${a.sources.masked}`, `${metricLabel(m)} · ${a.sources.original}`, a.diff] : [metricLabel(m)],
    ),
  ]
  const cells = result.map((r) => [
    ...r.key.map((k) => (k === "" ? a.blank : k)),
    ...valid.metrics.flatMap((m, i) => {
      const masked = formatMetric(r.values[i], m, kinds)
      if (!r.original) return [masked]
      const o = r.original[i]
      const v = r.values[i]
      const diff = v === null || o === null ? "—" : v === o ? "0" : formatMetric(v - o, { fn: "sum", field: "" }, kinds)
      return [masked, formatMetric(o, m, kinds), diff]
    }),
  ])
  const raw = result.map((r) => [...r.key, ...valid.metrics.flatMap((_, i) => (r.original ? [r.values[i], r.original[i], null] : [r.values[i]]))])
  const firstMetric = valid.dims.length
  // Default: first metric, descending.
  const sortCol = sort && sort.col < header.length ? sort.col : Math.min(firstMetric, header.length - 1)
  const desc = sort && sort.col < header.length ? sort.desc : true
  const order = raw
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const a = x.r[sortCol]
      const b = y.r[sortCol]
      const c = typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true })
      return desc ? -c : c
    })
    .map((x) => x.i)
  const max = Math.max(1, ...result.map((r) => r.values[0] ?? 0))
  const same = mode === "compare" ? result.filter((r) => r.original && r.values.every((v, i) => v === r.original![i])).length : 0
  const rowCount = runQuery(tables, { ...valid, dims: [], metrics: [{ fn: "count", field: "" }] }, mode === "original" ? "original" : "masked")[0]?.values[0] ?? 0

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <Row label={a.filters} onAdd={() => update({ filters: [...query.filters, { field: "", op: "eq", value: "" }] })}>
          {query.filters.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <FieldSelect fields={fields} value={f.field} onChange={(field) => setAt("filters", i, { field })} />
              <Small value={f.op} options={OPS} labels={a.ops} onChange={(op) => setAt("filters", i, { op })} />
              {f.op !== "empty" && f.op !== "notEmpty" && (
                <Input value={f.value} onChange={(e) => setAt("filters", i, { value: e.target.value })} placeholder={a.value} className="h-7 w-44" />
              )}
              <RemoveButton onClick={() => removeAt("filters", i)} />
            </div>
          ))}
        </Row>
        <Row label={a.groupBy} onAdd={() => update({ dims: [...query.dims, { field: "", bucket: "none" }] })}>
          {query.dims.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <FieldSelect fields={fields} value={d.field} onChange={(field) => setAt("dims", i, { field, bucket: "none" })} />
              <Small value={d.bucket} options={BUCKETS[kinds.get(d.field) ?? "text"]} labels={a.buckets} onChange={(bucket) => setAt("dims", i, { bucket })} />
              <RemoveButton onClick={() => removeAt("dims", i)} />
            </div>
          ))}
        </Row>
        <Row label={a.metrics} onAdd={() => update({ metrics: [...query.metrics, { fn: "count", field: "" }] })}>
          {query.metrics.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <Small value={m.fn} options={FNS} labels={a.fns} onChange={(fn) => setAt("metrics", i, { fn })} />
              {m.fn !== "count" && (
                <FieldSelect
                  fields={m.fn === "distinct" ? fields : fields.filter((f) => kinds.get(f.id) === "number" || ((m.fn === "min" || m.fn === "max") && kinds.get(f.id) === "date"))}
                  value={m.field}
                  onChange={(field) => setAt("metrics", i, { field })}
                />
              )}
              {query.metrics.length > 1 && <RemoveButton onClick={() => removeAt("metrics", i)} />}
            </div>
          ))}
        </Row>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {a.rows(rowCount, result.length)}
            {mode === "compare" && ` · ${a.same(same, result.length)}`}
          </span>
          <Button size="sm" variant="outline" disabled={!result.length} onClick={() => downloadCsv(`run-${runNumber}.${query.table}.${mode}`, header, order.map((i) => cells[i]))}>
            <Download />
            {a.csv}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {header.map((h, i) => (
                  <th
                    key={i}
                    className={cn("cursor-pointer px-3 py-2 font-medium whitespace-nowrap select-none", i >= firstMetric && "text-right")}
                    onClick={() => setSort({ col: i, desc: sortCol === i ? !desc : true })}
                  >
                    {h}
                    {i === sortCol && (desc ? " ↓" : " ↑")}
                  </th>
                ))}
                {mode !== "compare" && valid.metrics.length > 0 && <th className="w-40" />}
              </tr>
            </thead>
            <tbody>
              {order.slice(0, MAX_ROWS).map((i) => {
                const r = result[i]
                const changed = r.original && !r.values.every((v, j) => v === r.original![j])
                return (
                  <tr key={i} className={cn("border-t", changed && "bg-amber-500/5")}>
                    {cells[i].map((c, j) => (
                      <td key={j} className={cn("px-3 py-1.5 whitespace-nowrap", j >= firstMetric && "text-right tabular-nums")}>
                        {c}
                      </td>
                    ))}
                    {mode !== "compare" && valid.metrics.length > 0 && (
                      <td className="px-3 py-1.5">
                        <div className="h-1.5 rounded bg-muted">
                          <div className="h-full rounded bg-sky-500/70" style={{ width: `${(Math.max(0, r.values[0] ?? 0) / max) * 100}%` }} />
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {result.length > MAX_ROWS && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{MAX_ROWS} / {result.length}</p>}
        </div>
      </section>
    </div>
  )
}

function ProfilePanel({ table, side }: { table: MaskedTable; side: Side }) {
  const m = useMessages()
  const a = m.analysis
  const rows = useMemo(() => profile(table, side), [table, side])
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            {[a.column, a.role, a.kind, a.filled, a.distinct, a.min, a.max, a.mean, a.top].map((h) => (
              <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.field.id} className="border-t align-top">
              <td className="px-3 py-1.5 font-medium whitespace-nowrap">{p.field.column}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{m.roles[p.field.role]}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{p.kind}</td>
              <td className="px-3 py-1.5 tabular-nums">
                {p.filled}/{table.rows.length}
              </td>
              <td className="px-3 py-1.5 tabular-nums">{p.distinct}</td>
              <td className="max-w-40 truncate px-3 py-1.5 tabular-nums">{p.min ?? "—"}</td>
              <td className="max-w-40 truncate px-3 py-1.5 tabular-nums">{p.max ?? "—"}</td>
              <td className="px-3 py-1.5 tabular-nums">{p.mean === null ? "—" : p.mean.toFixed(2)}</td>
              <td className="max-w-md px-3 py-1.5">
                <div className="flex flex-wrap gap-1">
                  {p.top.map((t) => (
                    <span key={t.value} className="max-w-48 truncate rounded bg-muted px-1.5 py-0.5 text-[11.5px]" title={t.value}>
                      {t.value} <span className="text-muted-foreground tabular-nums">{t.n}</span>
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Analysis({ run }: { run: Run & { output: MaskedTable[] } }) {
  const router = useRouter()
  const a = useMessages().analysis
  const runs = useAppStore((s) => s.runs).filter((r) => r.output)
  const tables = run.output
  const [query, setQuery] = useState<Query>(() => defaultQuery(tables, tables[0]?.name ?? ""))
  const [mode, setMode] = useState<Mode>("masked")
  const joins = useMemo(() => joinable(tables, query.table), [tables, query.table])
  const table = tables.find((t) => t.name === query.table)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {a.run}
          <Select value={run.id} onValueChange={(id) => router.push(`/analysis/${id}`)}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {runs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  #{r.number} · {r.datasetName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {a.table}
          <Select value={query.table} onValueChange={(t) => setQuery(defaultQuery(tables, t))}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tables.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name} <span className="text-muted-foreground">{t.rows.length}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {joins.length > 0 && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {a.join}
            <Select
              value={query.join?.table ?? "-"}
              onValueChange={(t) => {
                const join = joins.find((j) => j.table === t) ?? null
                const prefix = query.join ? `${query.join.table}.` : null
                // Drop references to the table that is no longer joined.
                const keep = <T extends { field: string }>(xs: T[]) => (prefix ? xs.filter((x) => !x.field.startsWith(prefix)) : xs)
                setQuery({ ...query, join, filters: keep(query.filters), dims: keep(query.dims), metrics: keep(query.metrics) })
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-">{a.noJoin}</SelectItem>
                {joins.map((j) => (
                  <SelectItem key={j.table} value={j.table}>
                    {a.joinOn(j.table, j.on)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground" data-tour="analysis-source">
          {a.source}
          <div className="flex rounded-lg border p-0.5">
            {(["masked", "original", "compare"] as Mode[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setMode(s)}
                className={cn("h-6 rounded-md px-2.5 text-xs", mode === s ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {a.sources[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="query">
        <TabsList>
          <TabsTrigger value="query">{a.tabs.query}</TabsTrigger>
          <TabsTrigger value="profile">{a.tabs.profile}</TabsTrigger>
        </TabsList>
        <TabsContent value="query" className="pt-2">
          <QueryPanel tables={tables} query={query} setQuery={setQuery} mode={mode} runNumber={run.number} />
        </TabsContent>
        <TabsContent value="profile" className="pt-2">
          {table && <ProfilePanel table={table} side={mode === "original" ? "original" : "masked"} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function AnalysisScreen({ runId }: { runId?: string }) {
  const hydrated = useHydrated()
  const runs = useAppStore((s) => s.runs)
  const m = useMessages()
  const run = runId ? runs.find((r) => r.id === runId) : runs.find((r) => r.output)

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.analysis.trail, ...(run ? [m.jobs.runShort(run.number)] : [])]} />
      <main className="flex flex-1 flex-col gap-6 px-6 py-6">
        {!hydrated ? (
          <Skeleton className="h-96 w-full" />
        ) : run?.output ? (
          <Analysis key={run.id} run={run as Run & { output: MaskedTable[] }} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground">{m.analysis.empty}</p>
            <Button asChild variant="outline">
              <Link href="/jobs">{m.sidebar.jobs}</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
