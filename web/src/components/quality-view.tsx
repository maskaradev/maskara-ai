"use client"

import { Check, Minus, ScanSearch, ShieldCheck, Sparkles, X } from "lucide-react"
import { Fragment, useMemo } from "react"

import { useMessages, type Messages } from "@/lib/i18n"
import { f1, precision, recall } from "@/lib/pii/span-eval"
import { computeUtility } from "@/lib/pipeline/utility"
import type { Run, SpanReport, UtilityCheck, UtilityReport } from "@/lib/types"
import { cn } from "@/lib/utils"

const DAY = 86_400_000

/** Recomputed from the output when available so labels follow the current language. */
export function utilityFor(run: Run, u: Messages["utility"]): UtilityReport | null {
  return run.output ? computeUtility(run.output, u, run.images) : (run.report?.utility ?? null)
}

function Result({ pass }: { pass: UtilityCheck["pass"] }) {
  if (pass === null) return <Minus className="size-4 text-muted-foreground" />
  return pass ? (
    <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
  ) : (
    <X className="size-4 text-red-600 dark:text-red-400" />
  )
}

function Timeline({ dates }: { dates: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-[12px]">
      {dates.map((d, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="px-1 text-[11px] text-muted-foreground tabular-nums">
              —{Math.round((Date.parse(d) - Date.parse(dates[i - 1])) / DAY)}d→
            </span>
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{d}</span>
        </Fragment>
      ))}
    </div>
  )
}

function UtilitySection({ utility }: { utility: UtilityReport }) {
  const m = useMessages()
  const q = m.quality
  const groups = [...new Set(utility.checks.map((c) => c.group))]
  const allPass = utility.passed === utility.total
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4" />
            {q.utilityTitle}
          </h3>
          <p className="text-xs text-muted-foreground">{q.utilityDesc}</p>
        </div>
        <div className="flex items-baseline gap-3">
          {utility.textKeptPct !== null && (
            <span className="text-xs text-muted-foreground">{q.textKept(Math.round(utility.textKeptPct * 100))}</span>
          )}
          <span
            className={cn(
              "rounded-md px-2 py-1 text-sm font-semibold tabular-nums",
              allPass ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300",
            )}
          >
            {q.checksPassed(utility.passed, utility.total)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{q.measure}</th>
              <th className="px-3 py-2 font-medium">{q.original}</th>
              <th className="px-3 py-2 font-medium">{q.masked}</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr className="border-t bg-muted/20">
                  <td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {m.utility.groups[group]}
                  </td>
                </tr>
                {utility.checks
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <tr key={c.id} className={cn("border-t align-top", c.pass === false && "bg-red-500/5")}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{c.label}</div>
                        <div className="text-[11.5px] text-muted-foreground">{c.description}</div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{c.original}</td>
                      <td className="px-3 py-2 tabular-nums">{c.masked}</td>
                      <td className="px-3 py-2">
                        <Result pass={c.pass} />
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {utility.timelines.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold">{q.timelinesTitle}</h4>
          <p className="text-[11.5px] text-muted-foreground">{q.timelinesDesc}</p>
          <div className="grid gap-2 lg:grid-cols-2">
            {utility.timelines.map((t) => (
              <div key={t.person} className="flex flex-col gap-1.5 rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground">
                  {t.person} → {t.maskedPerson}
                </div>
                <div className="grid grid-cols-[62px_1fr] items-center gap-x-2 gap-y-1.5">
                  <span className="text-[11px] text-red-700 dark:text-red-300">{q.original}</span>
                  <Timeline dates={t.original} />
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-300">{q.masked}</span>
                  <Timeline dates={t.masked} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function PrivacySection({ run }: { run: Run }) {
  const q = useMessages().quality
  const r = run.report!
  const types = Object.entries(r.entitiesByType).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...types.map(([, n]) => n))
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ShieldCheck className="size-4" />
          {q.privacyTitle}
        </h3>
        <p className="text-xs text-muted-foreground">{q.privacyDesc(r.checkedValues)}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">{q.originalInOutput}</div>
          {r.leaks.length === 0 ? (
            <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{q.zeroLeaks}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px]">
              {r.leaks.map((l) => (
                <li key={l.value + l.where} className="flex justify-between gap-3 rounded bg-red-500/10 px-2 py-1">
                  <span className="font-medium">{l.value}</span>
                  <span className="text-muted-foreground">{l.where}</span>
                </li>
              ))}
            </ul>
          )}
          {r.keptByPolicy > 0 && (
            <p className="text-[11.5px] text-muted-foreground">{q.keptByPolicy(r.keptByPolicy)}</p>
          )}
        </div>

        {r.media && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground">{q.mediaKey}</div>
            <p className="text-2xl font-semibold tabular-nums">
              {r.media.found}/{r.media.total}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {q.caught(Math.round((r.media.found / Math.max(1, r.media.total)) * 100))}
              </span>
            </p>
            {r.media.missed.length > 0 && (
              <ul className="flex flex-col gap-1 text-[13px]">
                {r.media.missed.map((m) => (
                  <li key={m.record + m.value} className="flex justify-between gap-3 rounded bg-amber-500/10 px-2 py-1">
                    <span>{m.value}</span>
                    <span className="text-muted-foreground">{m.record}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">{q.replacedByType}</div>
          {types.map(([type, n]) => (
            <div key={type} className="grid grid-cols-[96px_1fr_32px] items-center gap-2 text-[11.5px]">
              <span className="text-muted-foreground">{type}</span>
              <div className="h-1.5 rounded bg-muted">
                <div className="h-full rounded bg-emerald-500/70" style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <span className="text-right tabular-nums">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)

function DetectionSection({ report }: { report: SpanReport }) {
  const q = useMessages().quality
  const scores = [
    { label: q.recall, hint: q.recallHint(report.caught, report.gold), value: recall(report) },
    { label: q.precision, hint: q.precisionHint(report.correct, report.correct + report.wrong), value: precision(report) },
    { label: "F1", hint: q.f1Hint, value: f1(report) },
  ]
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ScanSearch className="size-4" />
          {q.spanTitle}
        </h3>
        <p className="text-xs text-muted-foreground">{q.spanDesc(report.source, report.docs)}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {scores.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 rounded-lg border p-3">
            <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
            <span className="text-2xl font-semibold tabular-nums">{pct(s.value)}</span>
            <span className="text-[11.5px] text-muted-foreground tabular-nums">{s.hint}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">{q.byLabel}</div>
          {report.byLabel.map((l) => (
            <div key={l.label} className="grid grid-cols-[150px_1fr_44px] items-center gap-2 text-[11.5px]">
              <span className="truncate text-muted-foreground" title={l.type}>
                {l.label}
              </span>
              <div className="h-1.5 rounded bg-muted">
                <div
                  className={cn("h-full rounded", l.caught === l.gold ? "bg-emerald-500/70" : "bg-amber-500/70")}
                  style={{ width: `${(l.caught / Math.max(1, l.gold)) * 100}%` }}
                />
              </div>
              <span className="text-right tabular-nums">
                {l.caught}/{l.gold}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">{q.missedTitle}</div>
          {report.missed.length === 0 ? (
            <p className="text-sm text-muted-foreground">{q.none}</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-auto text-[13px]">
              {report.missed.map((m, i) => (
                <li key={i} className="flex justify-between gap-3 rounded bg-amber-500/10 px-2 py-1">
                  <span className="truncate">{m.value}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {m.label} · {m.record}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">{q.falsePositivesTitle}</div>
          {report.falsePositives.length === 0 ? (
            <p className="text-sm text-muted-foreground">{q.none}</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-auto text-[13px]">
              {report.falsePositives.map((m, i) => (
                <li key={i} className="flex justify-between gap-3 rounded bg-muted px-2 py-1">
                  <span className="truncate">{m.value}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {m.type} · {m.record}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11.5px] text-muted-foreground">{q.falsePositivesNote}</p>
          {report.outOfScope > 0 && <p className="text-[11.5px] text-muted-foreground">{q.outOfScope(report.outOfScope)}</p>}
        </div>
      </div>
    </section>
  )
}

export function QualityView({ run }: { run: Run }) {
  const m = useMessages()
  const utility = useMemo(() => utilityFor(run, m.utility), [run, m.utility])
  if (!run.report && !utility) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {m.quality.pending}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {run.report && <PrivacySection run={run} />}
      {utility && <UtilitySection utility={utility} />}
      {run.report?.spans && <DetectionSection report={run.report.spans} />}
    </div>
  )
}
