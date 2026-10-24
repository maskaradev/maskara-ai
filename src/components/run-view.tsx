"use client"

import { RotateCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { AgentPanel } from "@/components/agent-panel"
import { PipelineGraph, stageDuration } from "@/components/pipeline-graph"
import { QualityView, utilityFor } from "@/components/quality-view"
import { ResultsView } from "@/components/results-view"
import { StatusBadge, formatDuration } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNow } from "@/hooks/use-now"
import { startRun } from "@/lib/pipeline/run"
import { useMessages } from "@/lib/i18n"
import { STAGE_BY_ID } from "@/lib/pipeline/stages"
import { useAppStore } from "@/lib/store"
import type { Run, StageId } from "@/lib/types"
import { cn } from "@/lib/utils"

function SummaryCard({ label, value, detail, tone }: { label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-4",
        tone === "good" && "border-emerald-500/30",
        tone === "bad" && "border-red-500/40 bg-red-500/[0.03]",
        tone === "warn" && "border-amber-500/40",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

function StageDetail({ run, id, now }: { run: Run; id: StageId; now: number }) {
  const m = useMessages()
  const def = STAGE_BY_ID[id]
  const text = m.graph.stages[id]
  const s = run.stages[id]
  return (
    <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{text.label}</h3>
          <StatusBadge status={s.status} />
          <span className="text-xs text-muted-foreground tabular-nums">{stageDuration(s, now)}</span>
        </div>
        <p className="text-sm text-muted-foreground">{text.description}</p>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-muted-foreground">{m.run.runsIn}</dt>
          <dd className={cn(def.location === "external-api" && "font-medium text-amber-700 dark:text-amber-300")}>
            {m.graph.locations[def.location]}
          </dd>
          <dt className="text-muted-foreground">{m.run.onPrem}</dt>
          <dd>{text.production}</dd>
          <dt className="text-muted-foreground">{m.run.progress}</dt>
          <dd className="tabular-nums">
            {s.done} / {s.total}
          </dd>
        </dl>
      </div>
      <div className="flex min-h-32 flex-col gap-1 rounded-lg bg-muted/50 p-3 font-mono text-[12px]">
        {s.error && <div className="text-red-600 dark:text-red-400">✕ {s.error}</div>}
        {s.logs.map((l, i) => (
          <div key={i} className="text-muted-foreground">
            <span className="text-foreground/50">›</span> {l}
          </div>
        ))}
        {!s.logs.length && !s.error && <div className="text-muted-foreground">{m.run.noOutput}</div>}
      </div>
    </section>
  )
}

export function RunView({ run }: { run: Run }) {
  const router = useRouter()
  const m = useMessages()
  const r = m.run
  const now = useNow(run.status === "running")
  const [selected, setSelected] = useState<StageId | null>(null)
  const datasetExists = useAppStore((s) => s.datasets.some((d) => d.id === run.datasetId))
  const failedStage = (Object.keys(run.stages) as StageId[]).find((id) => run.stages[id].status === "failed")
  const runningStage = (Object.keys(run.stages) as StageId[]).find((id) => run.stages[id].status === "running")
  const focus = selected ?? failedStage ?? runningStage ?? "identify"
  const leaks = run.report?.leaks.length
  const utility = useMemo(() => utilityFor(run, m.utility), [run, m.utility])

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{m.jobs.runTitle(run.number)}</h2>
            <StatusBadge status={run.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {run.datasetName} · {r.started(new Date(run.startedAt).toLocaleString(m.localeTag))} · {run.id}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={!datasetExists || run.status === "running"} onClick={() => router.push(`/jobs/${startRun(run.datasetId)}`)}>
          <RotateCw />
          {r.runAgain}
        </Button>
      </div>

      {run.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">{run.error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label={r.status}
          value={r.statusValue[run.status]}
          detail={formatDuration((run.finishedAt ?? now) - run.startedAt)}
          tone={run.status === "failed" ? "bad" : run.status === "succeeded" ? "good" : undefined}
        />
        <SummaryCard label={r.rowsRead} value={run.rowsProcessed} detail={r.fromLocalDb} />
        <SummaryCard label={r.valuesReplaced} value={run.entitiesReplaced} detail={r.valuesReplacedDetail} />
        <SummaryCard
          label={r.leakCheck}
          value={leaks === undefined ? "—" : r.leaks(leaks)}
          detail={run.report?.media ? r.mediaKey(run.report.media.found, run.report.media.total) : r.afterLanes}
          tone={leaks === undefined ? undefined : leaks === 0 ? "good" : "bad"}
        />
        <SummaryCard
          label={r.utility}
          value={utility ? r.utilityValue(utility.passed, utility.total) : "—"}
          detail={r.utilityDetail}
          tone={!utility ? undefined : utility.passed === utility.total ? "good" : "bad"}
        />
        <SummaryCard
          label={r.apiCalls}
          value={run.apiCalls}
          detail={r.apiCallsDetail(run.cacheHits)}
          tone="warn"
        />
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">{r.tabs.flow}</TabsTrigger>
          <TabsTrigger value="results">{r.tabs.results}</TabsTrigger>
          <TabsTrigger value="validation">{r.tabs.quality}</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline" className="flex flex-col gap-4 pt-2">
          <PipelineGraph run={run} now={now} selected={focus} onSelect={setSelected} />
          {(focus === "identify" || focus === "generate") && (
            <section className="rounded-xl border p-4">
              <AgentPanel key={focus} run={run} agent={focus} />
            </section>
          )}
          <StageDetail run={run} id={focus} now={now} />
        </TabsContent>
        <TabsContent value="results" className="pt-2">
          <ResultsView run={run} />
        </TabsContent>
        <TabsContent value="validation" className="pt-2">
          <QualityView run={run} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
