"use client"

import { ChevronDown, Plus } from "lucide-react"
import Link from "next/link"
import { Collapsible } from "radix-ui"
import { useMemo } from "react"

import { utilityFor } from "@/components/quality-view"
import { StatusBadge, formatDuration } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useNow } from "@/hooks/use-now"
import { useMessages } from "@/lib/i18n"
import { precision, recall } from "@/lib/pii/span-eval"
import type { Run } from "@/lib/types"
import { cn } from "@/lib/utils"

type Tone = "good" | "bad" | "warn" | undefined

const TONE: Record<NonNullable<Tone>, string> = {
  good: "text-emerald-700 dark:text-emerald-300",
  bad: "text-red-600 dark:text-red-400",
  warn: "text-amber-700 dark:text-amber-300",
}

function SummaryRow({ label, value, detail, tone }: { label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className={cn("font-semibold tabular-nums", tone && TONE[tone])}>{value}</dd>
      </div>
      {detail && <div className="text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  )
}

function RunSummary({ run }: { run: Run }) {
  const m = useMessages()
  const r = m.run
  const leaks = run.report?.leaks.length
  const utility = useMemo(() => utilityFor(run, m.utility), [run, m.utility])
  return (
    <Collapsible.Root defaultOpen className="mt-1">
      <Collapsible.Trigger className="group flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        {m.jobs.summary}
        <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <dl className="flex flex-col divide-y rounded-lg border text-xs">
          <SummaryRow label={r.rowsRead} value={run.rowsProcessed} detail={r.fromLocalDb} />
          <SummaryRow label={r.valuesReplaced} value={run.entitiesReplaced} detail={r.valuesReplacedDetail} />
          <SummaryRow
            label={r.leakCheck}
            value={leaks === undefined ? "—" : r.leaks(leaks)}
            detail={
              run.report?.spans
                ? r.spanKey(Math.round((recall(run.report.spans) ?? 0) * 100), Math.round((precision(run.report.spans) ?? 0) * 100))
                : run.report?.media
                  ? r.mediaKey(run.report.media.found, run.report.media.total)
                  : r.afterLanes
            }
            tone={leaks === undefined ? undefined : leaks === 0 ? "good" : "bad"}
          />
          <SummaryRow
            label={r.utility}
            value={utility ? r.utilityValue(utility.passed, utility.total) : "—"}
            detail={r.utilityDetail}
            tone={!utility ? undefined : utility.passed === utility.total ? "good" : "bad"}
          />
          <SummaryRow label={r.apiCalls} value={run.apiCalls} detail={r.apiCallsDetail(run.cacheHits)} tone="warn" />
        </dl>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function timeLabel(ts: number, locale: string) {
  return new Date(ts).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function RunList({ runs, selectedId }: { runs: Run[]; selectedId?: string }) {
  const m = useMessages()
  const now = useNow(runs.some((r) => r.status === "running"))
  return (
    <aside className="flex w-full min-w-0 flex-col gap-3 2xl:w-72 2xl:shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{m.jobs.recentRuns}</h2>
        <Button size="sm" variant="outline" asChild>
          <Link href="/jobs/new">
            <Plus />
            {m.jobs.newRun}
          </Link>
        </Button>
      </div>
      <ul className="flex items-start gap-1.5 overflow-x-auto pb-1 2xl:flex-col 2xl:items-stretch 2xl:overflow-visible 2xl:pb-0">
        {runs.map((r) => (
          <li key={r.id} className="w-60 shrink-0 2xl:w-auto">
            <Link
              href={`/jobs/${r.id}`}
              className={cn(
                "flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted",
                r.id === selectedId && "border-foreground/20 bg-muted",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={r.status} />
                <span className="text-[11px] text-muted-foreground tabular-nums">{timeLabel(r.startedAt, m.localeTag)}</span>
              </div>
              <div className="text-sm font-medium">{m.jobs.runTitle(r.number)}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.datasetName} · {formatDuration((r.finishedAt ?? now) - r.startedAt)}
              </div>
            </Link>
            {r.id === selectedId && <RunSummary run={r} />}
          </li>
        ))}
        {runs.length === 0 && (
          <li className="w-full rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{m.jobs.noRuns}</li>
        )}
      </ul>
    </aside>
  )
}
