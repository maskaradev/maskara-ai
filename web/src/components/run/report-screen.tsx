"use client"

import { CheckmarkFilled, WarningAlt } from "@carbon/icons-react"

import { PageHeader } from "@/components/page-header"
import { CategoryDot, PageIntro, SampleBanner, Section, StatTile } from "@/components/run/shared"
import { useMessages } from "@/lib/i18n"
import { num, pct, type Report } from "@/lib/run"
import { cn } from "@/lib/utils"

function Card({ title, ok, measured, notMeasured, children, className }: {
  title: string
  ok?: boolean
  measured: string
  notMeasured?: string
  children: React.ReactNode
  className?: string
}) {
  const c = useMessages().common
  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border bg-card p-4", className)}>
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {ok === true && <CheckmarkFilled className="size-4 text-emerald-600 dark:text-emerald-400" />}
        {ok === false && <WarningAlt className="size-4 text-amber-600 dark:text-amber-400" />}
        {title}
      </h3>
      <div className="flex flex-1 flex-col gap-3 text-[13px]">{children}</div>
      <details className="group text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">
          {c.measured} / {c.notMeasured}
        </summary>
        <dl className="mt-2 flex flex-col gap-2 leading-relaxed">
          <div>
            <dt className="font-medium text-foreground">{c.measured}</dt>
            <dd>{measured}</dd>
          </div>
          {notMeasured && (
            <div>
              <dt className="font-medium text-foreground">{c.notMeasured}</dt>
              <dd>{notMeasured}</dd>
            </div>
          )}
        </dl>
      </details>
    </section>
  )
}

function Bars({ data, dots }: { data: Record<string, number>; dots?: boolean }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, n]) => n))
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([k, n]) => (
        <li key={k} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 truncate">
            {dots && <CategoryDot category={k} />}
            {dots ? k.toLowerCase() : k}
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="text-right font-mono tabular-nums">{num(n)}</span>
        </li>
      ))}
    </ul>
  )
}

function Figures({ items }: { items: [string, React.ReactNode, boolean?][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, value, bad]) => (
        <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">{label}</dt>
          <dd className={cn("font-mono text-lg font-semibold tabular-nums", bad && "text-destructive")}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const th = "px-2.5 py-1.5 text-left font-medium whitespace-nowrap"
const td = "px-2.5 py-1.5"

export function ReportScreen({ report }: { report: Report }) {
  const messages = useMessages()
  const m = messages.report
  const hd = report.headline
  const { reappearance: re, quasi_identifiers: qi, detections: det } = report.privacy
  const f = report.fidelity

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail]} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-8">
        <SampleBanner />
        <PageIntro title={m.title} description={m.description} />

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4 [&>*]:bg-background">
          <StatTile value={hd.originals_found} of={`/ ${num(hd.originals_scanned)}`} label={m.tiles.originals} tone={hd.originals_found ? "bad" : undefined} />
          <StatTile value={hd.broken_joins} of={`/ ${num(hd.joins_checked)}`} label={m.tiles.joins} tone={hd.broken_joins ? "bad" : undefined} />
          <StatTile value={pct(hd.date_gaps_exact)} label={m.tiles.dates} />
          <StatTile value={pct(hd.format_valid)} label={m.tiles.formats} />
          <StatTile value={pct(hd.placeholder_share)} label={m.tiles.placeholders} />
          <StatTile value={pct(hd.non_pii_changed)} label={m.tiles.nonPii} />
          {hd.max_unique_share != null && <StatTile value={pct(hd.max_unique_share)} label={m.tiles.unique} />}
          {hd.max_linkage_rate != null && <StatTile value={pct(hd.max_linkage_rate)} label={m.tiles.linkage} />}
        </div>

        <Section title={m.privacy}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={m.reappearance.title} ok={re.found === 0} measured={re.measured} notMeasured={re.not_measured}>
              <Figures
                items={[
                  [m.reappearance.scanned, num(re.scanned)],
                  [m.reappearance.exact, re.exact, re.exact > 0],
                  [m.reappearance.normalized, re.normalized, re.normalized > 0],
                  [m.reappearance.partial, re.partial],
                ]}
              />
              {re.hits.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {re.hits.map((h, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 rounded bg-amber-500/15 px-1 font-mono text-[10px] text-amber-800 dark:text-amber-200">{h.level}</span>
                      <span>
                        {m.reappearance.hit(
                          h.label,
                          `${h.found_in.source}.${h.found_in.column} #${h.found_in.row + 1}`,
                          `${h.original_at.source}.${h.original_at.column} #${h.original_at.row + 1}`,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={m.quasi.title} measured={qi.measured} notMeasured={qi.not_measured}>
              {Object.entries(qi.tables).map(([name, t]) => {
                const max = Math.max(1, ...Object.values(t.k))
                return (
                  <div key={name} className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="font-mono font-medium">{name}</span>
                      <span className="text-muted-foreground">
                        {m.quasi.columns}: <span className="font-mono text-foreground">{t.columns.join(", ")}</span>
                      </span>
                      <span className="text-muted-foreground">
                        {m.quasi.kept}: <span className="font-mono text-foreground">{t.kept.join(", ") || "—"}</span>
                      </span>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] text-muted-foreground">{m.quasi.k}</p>
                      <div className="flex h-24 items-end gap-2">
                        {Object.entries(t.k).map(([k, n]) => (
                          <div key={k} className="flex flex-1 flex-col items-center gap-1">
                            <span className="font-mono text-[11px] tabular-nums">{n}</span>
                            <span
                              className={cn("w-full rounded-t", k === "1" ? "bg-amber-500/70" : "bg-foreground/60")}
                              style={{ height: `${(n / max) * 56 + 2}px` }}
                            />
                            <span className="font-mono text-[11px] text-muted-foreground">k={k}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs">{m.quasi.unique(t.unique, pct(t.unique_share))}</p>
                    {t.linkage && (
                      <p className="text-xs">{m.quasi.linkage(t.linkage.reidentified, t.linkage.attempted, pct(t.linkage.rate))}</p>
                    )}
                  </div>
                )
              })}
            </Card>

            <Card title={m.detections.title} measured={det.measured} notMeasured={det.not_measured} className="lg:col-span-2">
              <Figures
                items={[
                  [m.detections.replaced, num(det.replaced)],
                  [m.detections.kept, num(det.kept_by_policy)],
                ]}
              />
              <div className="grid gap-6 md:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-muted-foreground">{m.detections.byCategory}</p>
                  <Bars data={det.by_category} dots />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-muted-foreground">{m.detections.byDetector}</p>
                  <Bars data={det.by_detector} />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-muted-foreground">{m.detections.byLink}</p>
                  <Bars data={Object.fromEntries(Object.entries(det.by_link).map(([k, n]) => [messages.common.links[k] ?? k, n]))} />
                </div>
              </div>
              {det.unlinked.mentions > 0 && <p className="text-xs text-muted-foreground">{m.detections.unlinked(det.unlinked.mentions)}</p>}
            </Card>
          </div>
        </Section>

        <Section title={m.fidelity}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={m.joins.title} ok={f.joins.broken === 0} measured={f.joins.measured} notMeasured={f.joins.not_measured}>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className={th}>{m.joins.from}</th>
                      <th className={th}>{m.joins.to}</th>
                      <th className={cn(th, "text-right")}>{m.joins.checked}</th>
                      <th className={cn(th, "text-right")}>{m.joins.broken}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.joins.pairs.map((p) => (
                      <tr key={p.from + p.to} className="border-t">
                        <td className={cn(td, "font-mono")}>{p.from}</td>
                        <td className={cn(td, "font-mono")}>{p.to}</td>
                        <td className={cn(td, "text-right font-mono tabular-nums")}>{p.checked}</td>
                        <td className={cn(td, "text-right font-mono tabular-nums", p.broken && "text-destructive")}>{p.broken}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">{m.joins.textRefs(f.joins.text_refs.checked, f.joins.text_refs.broken)}</p>
            </Card>

            <Card title={m.dates.title} ok={f.date_gaps.exact === f.date_gaps.pairs} measured={f.date_gaps.measured} notMeasured={f.date_gaps.not_measured}>
              <Figures
                items={[
                  [m.dates.people, f.date_gaps.people],
                  [m.dates.pairs, num(f.date_gaps.pairs)],
                  [m.dates.exact, pct(f.date_gaps.exact_share)],
                  [m.dates.maxError, f.date_gaps.max_error_days, f.date_gaps.max_error_days > 0],
                ]}
              />
            </Card>

            <Card title={m.distributions.title} measured={f.distributions.measured} notMeasured={f.distributions.not_measured}>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className={th}>{m.distributions.table}</th>
                      <th className={th}>{m.distributions.test}</th>
                      <th className={cn(th, "text-right")}>{m.distributions.distance}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.distributions.columns.map((col) => (
                      <tr key={col.table + col.column} className="border-t">
                        <td className={cn(td, "font-mono")}>
                          {col.table}.{col.column}
                        </td>
                        <td className={cn(td, "text-muted-foreground")}>
                          {col.test.toUpperCase()}
                          {col.what ? ` · ${col.what}` : ""}
                        </td>
                        <td className={cn(td, "text-right font-mono tabular-nums")}>
                          {col.value === 0 ? <span className="text-muted-foreground">{m.distributions.identical}</span> : col.value.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex flex-col gap-4">
              <Card title={m.formats.title} ok={f.formats.valid === f.formats.checked} measured={f.formats.measured} notMeasured={f.formats.not_measured}>
                <Figures items={Object.entries(f.formats.kinds).map(([k, v]) => [k, pct(v.share), v.share < 1] as [string, string, boolean])} />
              </Card>
              <Card title={m.schema.title} ok={f.schema.ok} measured={f.schema.measured}>
                <ul className="flex flex-col gap-1 text-xs">
                  {Object.entries(f.schema.tables).map(([name, t]) => (
                    <li key={name} className="flex items-center gap-2">
                      <span className="w-20 font-mono">{name}</span>
                      <span className="font-mono tabular-nums">
                        {t.rows_before} → {t.rows_after}
                      </span>
                      <span className="ml-auto text-muted-foreground">{t.columns_same ? m.schema.same : m.schema.changed}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <Card title={m.placeholders.title} ok={f.placeholders.placeholders === 0} measured={f.placeholders.measured}>
              <p>{m.placeholders.body(f.placeholders.placeholders, f.placeholders.replaced)}</p>
            </Card>

            <Card title={m.nonPii.title} ok={f.non_pii.share === 0} measured={f.non_pii.measured} notMeasured={f.non_pii.not_measured}>
              <p>{m.nonPii.chars(f.non_pii.text_chars_changed, f.non_pii.text_chars)}</p>
              <p>{m.nonPii.cells(f.non_pii.kept_cells_changed, f.non_pii.kept_cells)}</p>
            </Card>
          </div>
        </Section>

        <Section title={m.notMeasuredTitle}>
          <ul className="flex flex-col divide-y rounded-xl border text-[13px]">
            {report.not_measured.map((line) => (
              <li key={line} className="px-4 py-3 leading-relaxed text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </div>
  )
}
