"use client"

import { Play } from "@carbon/icons-react"
import { Fragment, useEffect, useRef, useState } from "react"

import { ErrorNote, Legend, MARK_STYLE, Metric, ModelToggle, ms, pct, scoreTone } from "@/components/playground/shared"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useMessages } from "@/lib/i18n"
import { f1, isScoredLabel, precision, recall, scoreSpans, type DetectedSpan } from "@/lib/pii/span-eval"
import {
  TEXT_MODELS,
  detectTextSpans,
  loadTextCorpora,
  mapLimit,
  markSpans,
  scoreSample,
  type Mark,
  type TextCorpus,
  type TextModelId,
} from "@/lib/playground"
import type { SpanReport } from "@/lib/types"
import { cn } from "@/lib/utils"

type CorpusId = TextCorpus["id"] | "custom"
type Scope = "sample" | "all"

type Result =
  | { status: "running"; done: number; total: number }
  | { status: "error"; error: string }
  /** Spans per sample id ("custom" for pasted text); `report` covers the whole scope that was run. */
  | { status: "done"; ms: number; spans: Record<string, DetectedSpan[]>; report?: SpanReport; scope: Scope }

/** Requests in flight per model when scoring a whole corpus; rules run locally and can go wider. */
const CONCURRENCY: Record<TextModelId, number> = { rules: 16, "privacy-filter": 4, claude: 4 }

function MarkedText({ text, marks }: { text: string; marks: Mark[] }) {
  const m = useMessages().playground.legend
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const [i, mark] of marks.entries()) {
    if (mark.start > cursor) parts.push(<Fragment key={`t${i}`}>{text.slice(cursor, mark.start)}</Fragment>)
    parts.push(
      <mark key={i} title={[m[mark.kind], mark.label ?? mark.type].filter(Boolean).join(" · ")} className={cn("rounded-[3px] px-0.5", MARK_STYLE[mark.kind])}>
        {text.slice(mark.start, mark.end)}
      </mark>,
    )
    cursor = mark.end
  }
  if (cursor < text.length) parts.push(<Fragment key="end">{text.slice(cursor)}</Fragment>)
  return <div className="max-h-[30rem] overflow-y-auto font-mono text-xs leading-6 break-words whitespace-pre-wrap">{parts}</div>
}

export function TextPanel() {
  const m = useMessages().playground
  const [corpora, setCorpora] = useState<TextCorpus[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [corpusId, setCorpusId] = useState<CorpusId>("nemotron-pii")
  const [sampleId, setSampleId] = useState<string>("")
  const [custom, setCustom] = useState("")
  const [models, setModels] = useState<Set<TextModelId>>(() => new Set(TEXT_MODELS.map((x) => x.id)))
  const [scope, setScope] = useState<Scope>("sample")
  const [results, setResults] = useState<Partial<Record<TextModelId, Result>>>({})
  const runId = useRef(0)

  useEffect(() => {
    loadTextCorpora().then(
      (c) => {
        setCorpora(c)
        setSampleId(c[0].samples[0]?.id ?? "")
      },
      (e: Error) => setLoadError(e.message),
    )
  }, [])

  const corpus = corpora?.find((c) => c.id === corpusId)
  const sample = corpus?.samples.find((s) => s.id === sampleId) ?? corpus?.samples[0]
  const text = corpusId === "custom" ? custom : (sample?.text ?? "")
  const gold = corpusId === "custom" ? undefined : sample?.gold
  const key = corpus?.key
  const shownId = corpusId === "custom" ? "custom" : (sample?.id ?? "")
  const goldSamples = corpus?.samples.filter((s) => s.gold) ?? []
  const canScoreAll = corpusId !== "custom" && !!key && goldSamples.length > 1
  const running = Object.values(results).some((r) => r?.status === "running")

  // Results belong to the text they were run on; start fresh when it changes.
  const reset = () => {
    runId.current++
    setResults({})
  }

  async function run() {
    const id = ++runId.current
    const chosen = TEXT_MODELS.filter((x) => models.has(x.id)).map((x) => x.id)
    const all = scope === "all" && canScoreAll
    const patch = (model: TextModelId, r: Result) => {
      if (runId.current === id) setResults((prev) => ({ ...prev, [model]: r }))
    }
    setResults(Object.fromEntries(chosen.map((x) => [x, { status: "running", done: 0, total: all ? goldSamples.length : 1 }])))
    await Promise.all(
      chosen.map(async (model) => {
        const started = performance.now()
        try {
          if (all && key) {
            const spans = await mapLimit(goldSamples, CONCURRENCY[model], (s) => detectTextSpans(model, s.text), (done) =>
              patch(model, { status: "running", done, total: goldSamples.length }),
            )
            const report = scoreSpans(key, goldSamples.map((s, i) => ({ record: s.id, text: s.text, gold: s.gold!, detected: spans[i] })))
            const byId = Object.fromEntries(goldSamples.map((s, i) => [s.id, spans[i]]))
            patch(model, { status: "done", ms: performance.now() - started, spans: byId, report, scope: "all" })
          } else {
            const spans = await detectTextSpans(model, text)
            const report = key && sample && gold && corpusId !== "custom" ? scoreSample(key, sample, spans) : undefined
            patch(model, { status: "done", ms: performance.now() - started, spans: { [shownId]: spans }, report, scope: "sample" })
          }
        } catch (e) {
          patch(model, { status: "error", error: e instanceof Error ? e.message : String(e) })
        }
      }),
    )
  }

  if (loadError) return <ErrorNote message={loadError} />
  if (!corpora) return <Skeleton className="h-96 w-full" />

  const done = TEXT_MODELS.filter((x) => results[x.id]?.status === "done")
  const aggregates = done.flatMap((x) => {
    const r = results[x.id]
    return r?.status === "done" && r.scope === "all" && r.report ? [{ id: x.id, report: r.report }] : []
  })

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-16 lg:w-80 lg:shrink-0">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{m.dataset}</span>
          <Select
            value={corpusId}
            onValueChange={(v) => {
              const next = v as CorpusId
              setCorpusId(next)
              setSampleId(corpora.find((c) => c.id === next)?.samples[0]?.id ?? "")
              if (next !== "nemotron-pii") setScope("sample")
              reset()
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {corpora.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {m.corpora[c.id]}
                  <span className="text-muted-foreground">· {c.key ? m.goldBadge : m.noGold}</span>
                </SelectItem>
              ))}
              <SelectItem value="custom">{m.customText}</SelectItem>
            </SelectContent>
          </Select>
          {corpus && (
            <span className="text-[11px] text-muted-foreground">
              {corpus.source} · {corpus.license}
            </span>
          )}
        </label>

        {corpus && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{m.sample}</span>
            <Select
              value={sample?.id}
              onValueChange={(v) => {
                setSampleId(v)
                // A corpus-wide run already covers every sample; a single-sample run doesn't.
                if (scope === "sample") reset()
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {corpus.samples.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-mono text-xs">{s.id}</span> {s.title}
                    {s.detail && <span className="text-muted-foreground">· {s.detail}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}

        {canScoreAll && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-[3px] text-xs font-medium">
            {(["sample", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn("rounded-md px-2 py-1 transition-colors", scope === s ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {s === "sample" ? m.scope.sample : m.scope.all(goldSamples.length)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{m.modelsLabel}</span>
          {TEXT_MODELS.map((x) => (
            <ModelToggle
              key={x.id}
              name={m.models[x.id].name}
              body={m.models[x.id].body}
              host={x.host}
              checked={models.has(x.id)}
              onChange={(on) =>
                setModels((prev) => {
                  const next = new Set(prev)
                  if (on) next.add(x.id)
                  else next.delete(x.id)
                  return next
                })
              }
            />
          ))}
        </div>

        {corpusId === "custom" && models.has("claude") && custom.trim() && (
          <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">{m.customWarn}</p>
        )}
        <Button onClick={run} disabled={running || !models.size || !text.trim()}>
          <Play />
          {m.run}
        </Button>
        {!models.size && <p className="text-xs text-muted-foreground">{m.pickModel}</p>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {corpusId === "custom" ? (
          <textarea
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              reset()
            }}
            placeholder={m.customPlaceholder}
            rows={8}
            className="w-full rounded-xl border bg-card p-4 font-mono text-xs leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        ) : (
          sample && (
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-medium">{sample.id}</span>
                <span className="text-muted-foreground">
                  {sample.title}
                  {sample.detail && ` · ${sample.detail}`}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {gold ? `${m.answerKey}: ${gold.filter((g) => isScoredLabel(g.label)).length}` : m.noGold}
                </span>
              </div>
              <MarkedText
                text={sample.text}
                marks={(gold ?? []).filter((g) => isScoredLabel(g.label)).map((g) => ({ start: g.start, end: g.end, kind: "extra", label: g.label }))}
              />
            </section>
          )
        )}

        {Object.keys(results).length > 0 && <Legend kinds={gold ? ["hit", "miss", "false", "extra"] : ["found"]} />}

        <div className={cn("grid gap-4", models.size > 1 && "xl:grid-cols-2", models.size > 2 && "2xl:grid-cols-3")}>
          {TEXT_MODELS.filter((x) => results[x.id]).map((x) => {
            const r = results[x.id]!
            return (
              <section key={x.id} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{m.models[x.id].name}</h3>
                  {r.status === "running" && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{m.running(r.done, r.total)}</span>
                  )}
                  {r.status === "done" && r.scope === "all" && (
                    <span className="ml-auto text-[11px] text-muted-foreground">{m.scope.all(r.report?.docs ?? 0)}</span>
                  )}
                </div>
                {r.status === "running" && <Skeleton className="h-40 w-full" />}
                {r.status === "error" && <ErrorNote message={r.error} />}
                {r.status === "done" && !r.spans[shownId] && <p className="text-xs text-muted-foreground">{m.notRun}</p>}
                {r.status === "done" && r.spans[shownId] && (
                  <>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {r.report ? (
                        <>
                          <Metric label={m.metrics.recall} value={pct(recall(r.report))} tone={scoreTone(recall(r.report))} />
                          <Metric label={m.metrics.precision} value={pct(precision(r.report))} />
                          <Metric label={m.metrics.f1} value={pct(f1(r.report))} />
                        </>
                      ) : (
                        <Metric label={m.metrics.flagged} value={String(r.spans[shownId].length)} />
                      )}
                      <Metric label={m.metrics.time} value={ms(r.ms)} />
                    </div>
                    <div className="border-t pt-3">
                      <MarkedText text={text} marks={markSpans(r.spans[shownId], gold)} />
                    </div>
                  </>
                )}
              </section>
            )
          })}
        </div>

        {aggregates.length > 0 && <ByLabel reports={aggregates} />}
        <p className="text-[11px] text-muted-foreground">{m.synthetic}</p>
      </div>
    </div>
  )
}

/** Recall per answer-key category, one column per model: where each one leaks. */
function ByLabel({ reports }: { reports: { id: TextModelId; report: SpanReport }[] }) {
  const m = useMessages().playground
  const labels = reports[0].report.byLabel.map((l) => l.label)
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">{m.byLabel}</h3>
        <p className="text-xs text-muted-foreground">{m.byLabelHint(reports[0].report.docs)}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{m.category}</th>
              <th className="px-3 py-2 text-right font-medium">n</th>
              {reports.map((r) => (
                <th key={r.id} className="px-3 py-2 text-right font-medium">
                  {m.models[r.id].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {labels.map((label) => (
              <tr key={label}>
                <td className="px-3 py-1.5 font-mono">{label}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                  {reports[0].report.byLabel.find((l) => l.label === label)?.gold}
                </td>
                {reports.map((r) => {
                  const row = r.report.byLabel.find((l) => l.label === label)
                  const v = row && row.gold ? row.caught / row.gold : null
                  const tone = scoreTone(v)
                  return (
                    <td
                      key={r.id}
                      className={cn(
                        "px-3 py-1.5 text-right font-mono tabular-nums",
                        tone === "good" && "text-emerald-700 dark:text-emerald-300",
                        tone === "warn" && "text-amber-700 dark:text-amber-300",
                        tone === "bad" && "text-red-600 dark:text-red-400",
                      )}
                    >
                      {pct(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
