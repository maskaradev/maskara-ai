"use client"

import { Hospital, Loader2, Play, Sparkles } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { cn } from "cn"

import { AiGoalDialog, GoalSummary, hasGoal, type Goal } from "@/components/ai-goal-panel"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { loadHospitalSample } from "@/lib/datasets"
import type { InferredRole } from "@/lib/llm/role-classifier"
import { startRun } from "@/lib/pipeline/run"
import { useLocale, useMessages } from "@/lib/i18n"
import { ROLES, ROLE_TREATMENT, TREATMENTS, roleForTreatment, type Treatment } from "@/lib/roles"
import { useAppStore, useHydrated } from "@/lib/store"
import type { ColumnRole } from "@/lib/types"

const LLM_ROLES: ColumnRole[] = ["free_text", "transcript", "image"]

const TREATMENT_STYLE: Record<Treatment, string> = {
  kept: "bg-muted text-muted-foreground",
  pseudonymized: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  persona: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  date_shifted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  synthesized: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  ai_redacted: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
}

// Paced so each column visibly flips during a demo.
const SCAN_MS = 110
const SETTLE_MS = 150

type AutoState =
  | { phase: "idle" }
  | { phase: "thinking" }
  | { phase: "applying"; done: number; total: number }
  | { phase: "done"; total: number; changed: number }
  | { phase: "error"; message: string }

const colKey = (table: string, column: string) => `${table}\u0000${column}`
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function TreatmentOption({ treatment }: { treatment: Treatment }) {
  const m = useMessages()
  return (
    <span className={cn("inline-flex w-[104px] justify-center rounded px-1.5 py-px font-mono text-[10.5px]", TREATMENT_STYLE[treatment])}>
      {m.treatments[treatment]}
    </span>
  )
}

export function NewJobForm() {
  const requested = useSearchParams().get("dataset")
  const router = useRouter()
  const m = useMessages()
  const locale = useLocale()
  const t = m.newJob
  const hydrated = useHydrated()
  const { datasets, setColumnRole, upsertDataset } = useAppStore()
  const [datasetId, setDatasetId] = useState<string | null>(requested)
  const dataset = datasets.find((d) => d.id === datasetId) ?? datasets[0]

  const [auto, setAuto] = useState<AutoState>({ phase: "idle" })
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [goalOpen, setGoalOpen] = useState(false)
  const [goal, setGoal] = useState<Goal>({ tags: [], text: "" })
  const [usedGoal, setUsedGoal] = useState<Goal | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const busy = auto.phase === "thinking" || auto.phase === "applying"

  const counts = dataset
    ? {
        llmCells: dataset.tables.reduce(
          (n, tbl) => n + tbl.columns.filter((c) => LLM_ROLES.includes(tbl.roles[c])).reduce((sum, c) => sum + tbl.rows.filter((r) => r[c]).length, 0),
          0,
        ),
        rows: dataset.tables.reduce((n, tbl) => n + tbl.rows.length, 0),
      }
    : null

  function resetAuto() {
    setAuto({ phase: "idle" })
    setUsedGoal(null)
    setReasons({})
    setChanged(new Set())
  }

  async function autoDetect() {
    if (!dataset || busy) return
    const ds = dataset
    const runGoal = hasGoal(goal) ? { tags: goal.tags, text: goal.text.trim() } : null
    setGoalOpen(false)
    setUsedGoal(runGoal)
    const columns = ds.tables.flatMap((tbl) => tbl.columns.map((c) => ({ table: tbl.name, column: c, before: tbl.roles[c] })))
    setReasons({})
    setChanged(new Set())
    setPending(new Set(columns.map((c) => colKey(c.table, c.column))))
    setAuto({ phase: "thinking" })

    let inferred: InferredRole[]
    try {
      const res = await fetch("/api/infer-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          ...(runGoal ? { goal: runGoal } : {}),
          tables: ds.tables.map((tbl) => ({
            name: tbl.name,
            columns: tbl.columns.map((c) => ({
              name: c,
              samples: [...new Set(tbl.rows.map((r) => r[c]).filter(Boolean))].slice(0, 3).map((v) => v.slice(0, 200)),
            })),
          })),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      inferred = body.columns
    } catch (error) {
      setPending(new Set())
      setAuto({ phase: "error", message: error instanceof Error ? error.message : String(error) })
      return
    }

    const byKey = new Map(inferred.filter((r) => ROLES.includes(r.role)).map((r) => [colKey(r.table, r.column), r]))
    let changedCount = 0
    for (const [i, col] of columns.entries()) {
      const key = colKey(col.table, col.column)
      setActive(key)
      rowRefs.current.get(key)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      await sleep(SCAN_MS)
      const result = byKey.get(key)
      if (result) {
        if (ROLE_TREATMENT[result.role] !== ROLE_TREATMENT[col.before]) {
          setChanged((s) => new Set(s).add(key))
          changedCount++
        }
        if (result.role !== col.before) setColumnRole(ds.id, col.table, col.column, result.role)
        setReasons((r) => ({ ...r, [key]: result.reason }))
      }
      setPending((s) => {
        const next = new Set(s)
        next.delete(key)
        return next
      })
      setAuto({ phase: "applying", done: i + 1, total: columns.length })
      await sleep(SETTLE_MS)
    }
    setActive(null)
    setAuto({ phase: "done", total: columns.length, changed: changedCount })
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={t.trail} back={{ href: requested ? "/datasets" : "/jobs", label: t.back }} />
      <main className="flex flex-1 flex-col gap-6 px-6 py-8">
        {!hydrated ? (
          <Skeleton className="h-64 w-full" />
        ) : !dataset ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground">{t.noDataset}</p>
            <Button onClick={async () => upsertDataset(await loadHospitalSample())}>
              <Hospital />
              {m.datasets.loadSample}
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  {t.dataset}
                  <Select
                    value={dataset.id}
                    disabled={busy}
                    onValueChange={(id) => {
                      setDatasetId(id)
                      resetAuto()
                    }}
                  >
                    <SelectTrigger className="w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="ml-auto flex items-center gap-3">
                  {auto.phase === "done" && <p className="text-[12.5px] text-muted-foreground">{t.autoDone(auto.total, auto.changed)}</p>}
                  {auto.phase === "error" && <p className="max-w-md truncate text-[12.5px] text-destructive" title={auto.message}>{t.autoFailed(auto.message)}</p>}
                  <Button
                    variant="outline"
                    onClick={() => setGoalOpen(true)}
                    disabled={busy}
                    aria-haspopup="dialog"
                    title={t.autoDetectHint}
                    data-tour="auto-detect"
                    className="min-w-44 disabled:opacity-90"
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {auto.phase === "thinking" ? t.analyzing : auto.phase === "applying" ? t.applying(auto.done, auto.total) : t.autoDetect}
                  </Button>
                </div>
              </div>

              <AiGoalDialog open={goalOpen} onOpenChange={setGoalOpen} goal={goal} onChange={setGoal} onRun={autoDetect} />
              {usedGoal && auto.phase !== "idle" && auto.phase !== "error" && <GoalSummary goal={usedGoal} />}

              {dataset.tables.map((table) => (
                <section key={table.name} className="flex flex-col gap-2 rounded-xl border p-4">
                  <h2 className="text-sm font-semibold">
                    {table.name} <span className="font-normal text-muted-foreground">· {t.rows(table.rows.length)}</span>
                  </h2>
                  <div className="grid gap-x-6 gap-y-1.5 lg:grid-cols-2">
                    {table.columns.map((c, idx) => {
                      const key = colKey(table.name, c)
                      const sample = table.rows.find((r) => r[c])?.[c] ?? ""
                      const reason = reasons[key]
                      const role = table.roles[c]
                      return (
                        <div
                          key={c}
                          ref={(el) => {
                            if (el) rowRefs.current.set(key, el)
                            else rowRefs.current.delete(key)
                          }}
                          className={cn(
                            "-mx-2 grid grid-cols-[1fr_180px] items-center gap-3 rounded-md border-b px-2 py-1.5 transition-all duration-300 last:border-0",
                            active === key && "bg-muted ring-1 ring-foreground/20",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-[13px] font-medium">
                              {c}
                              {changed.has(key) && (
                                <span className="rounded bg-foreground px-1 text-[10px] font-normal text-background">{t.changed}</span>
                              )}
                            </div>
                            {reason ? (
                              <div className="flex items-center gap-1 truncate text-[11px] text-foreground/70" title={sample}>
                                <Sparkles className="size-3 shrink-0" />
                                <span className="truncate">{reason}</span>
                              </div>
                            ) : (
                              <div className="truncate text-[11px] text-muted-foreground">{sample}</div>
                            )}
                          </div>
                          {pending.has(key) ? (
                            <div className="relative flex h-7 items-center gap-1.5 overflow-hidden rounded-md border border-dashed border-foreground/30 bg-muted/50 px-2.5 text-[12px] text-muted-foreground">
                              <Sparkles className="size-3.5 animate-pulse" />
                              {t.analyzingCell}
                              <span
                                className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-linear-to-r from-transparent via-foreground/10 to-transparent"
                                style={{ animationDelay: `${idx * 70}ms` }}
                              />
                            </div>
                          ) : (
                            <div key={ROLE_TREATMENT[role]} className={cn(reason && "animate-in fade-in zoom-in-90 duration-500")}>
                              <Select
                                value={ROLE_TREATMENT[role]}
                                disabled={busy}
                                onValueChange={(v) => setColumnRole(dataset.id, table.name, c, roleForTreatment(v as Treatment, c, table.rows, role))}
                              >
                                <SelectTrigger size="sm" className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TREATMENTS.map((tr) => (
                                    <SelectItem key={tr} value={tr}>
                                      <TreatmentOption treatment={tr} />
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>

            <aside className="flex h-fit flex-col gap-4 rounded-xl border p-4 xl:sticky xl:top-4">
              <h2 className="text-sm font-semibold">{t.summary}</h2>
              <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
                <dt className="text-muted-foreground">{t.tables}</dt>
                <dd>{dataset.tables.length}</dd>
                <dt className="text-muted-foreground">{t.rowsLabel}</dt>
                <dd>{counts?.rows}</dd>
                <dt className="text-muted-foreground">{t.llmCells}</dt>
                <dd>{counts?.llmCells}</dd>
              </dl>
              <Button disabled={busy} onClick={() => router.push(`/jobs/${startRun(dataset.id)}`)} data-tour="run-job">
                <Play />
                {t.run}
              </Button>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
