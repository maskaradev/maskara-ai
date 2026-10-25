"use client"

import { Checkmark, Close, Play } from "@carbon/icons-react"
import { useEffect, useRef, useState } from "react"

import { ErrorNote, Metric, ModelToggle, ms, pct, scoreTone } from "@/components/playground/shared"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useMessages } from "@/lib/i18n"
import type { DetectedSpan } from "@/lib/pii/span-eval"
import {
  TEXT_MODELS,
  caughtAnswers,
  detectTextSpans,
  loadMedia,
  loadMediaSamples,
  readIn,
  runFaces,
  runOcr,
  spanBoxes,
  type LoadedMedia,
  type MediaSample,
  type TextModelId,
} from "@/lib/playground"
import type { Box, FaceBox, OcrDocument } from "@/lib/types"
import { cn } from "@/lib/utils"

function useMediaSamples() {
  const [samples, setSamples] = useState<MediaSample[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadMediaSamples().then(setSamples, (e: Error) => setError(e.message))
  }, [])
  return { samples, error }
}

function SamplePicker({ samples, value, onChange }: { samples: MediaSample[]; value: string; onChange: (id: string) => void }) {
  const m = useMessages().playground
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{m.sample}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {samples.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              <span className="font-mono text-xs">{s.id}</span> {s.title}
              {s.document && <span className="text-muted-foreground">· PDF</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[11px] text-muted-foreground">Riverside General Hospital (synthetic)</span>
    </label>
  )
}

/** The image with boxes drawn over it, positioned in percent so it scales with the layout. */
function BoxedImage({
  media,
  boxes,
  className,
}: {
  media: { url: string; width: number; height: number }
  boxes: (Box & { label?: string; tone?: "pii" | "face" })[]
  className?: string
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border bg-muted/40", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local samples and data URLs, drawn at natural aspect ratio */}
      <img src={media.url} alt="" className="block h-auto w-full" />
      {boxes.map((b, i) => (
        <div
          key={i}
          className={cn(
            "absolute rounded-[2px]",
            b.tone === "face" ? "border-2 border-sky-400 bg-sky-400/10" : "bg-foreground/85 mix-blend-normal dark:bg-black/85",
          )}
          style={{
            left: `${(b.x0 / media.width) * 100}%`,
            top: `${(b.y0 / media.height) * 100}%`,
            width: `${((b.x1 - b.x0) / media.width) * 100}%`,
            height: `${((b.y1 - b.y0) / media.height) * 100}%`,
          }}
        >
          {b.label && (
            <span className="absolute -top-5 left-0 rounded bg-sky-500 px-1 font-mono text-[10px] whitespace-nowrap text-white">{b.label}</span>
          )}
        </div>
      ))}
    </div>
  )
}

const Tick = ({ ok }: { ok: boolean }) =>
  ok ? <Checkmark className="ml-auto size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Close className="ml-auto size-3.5 text-red-500" />

type OcrResult =
  | { status: "running" }
  | { status: "error"; error: string }
  | { status: "done"; ms: number; spans: DetectedSpan[] }

export function OcrPanel() {
  const m = useMessages().playground
  const { samples, error } = useMediaSamples()
  const [sampleId, setSampleId] = useState("M001")
  const [models, setModels] = useState<Set<TextModelId>>(() => new Set(TEXT_MODELS.map((x) => x.id)))
  const [loaded, setLoaded] = useState<{ src: string; media: LoadedMedia } | null>(null)
  const [ocr, setOcr] = useState<{ status: "running" } | { status: "error"; error: string } | { status: "done"; doc: OcrDocument; ms: number } | null>(null)
  const [results, setResults] = useState<Partial<Record<TextModelId, OcrResult>>>({})
  const runId = useRef(0)
  const sample = samples?.find((s) => s.id === sampleId)
  const media = loaded && loaded.src === sample?.src ? loaded.media : null

  // Show the picked image right away, before anything runs on it.
  useEffect(() => {
    if (!sample) return
    let live = true
    loadMedia(sample).then(
      (media) => live && setLoaded({ src: sample.src, media }),
      (e: Error) => live && setOcr({ status: "error", error: e.message }),
    )
    return () => {
      live = false
    }
  }, [sample])

  // Results belong to the previous image.
  function pick(id: string) {
    runId.current++
    setSampleId(id)
    setOcr(null)
    setResults({})
  }

  async function run() {
    if (!sample || !media) return
    const id = ++runId.current
    const chosen = TEXT_MODELS.filter((x) => models.has(x.id)).map((x) => x.id)
    setResults({})
    setOcr({ status: "running" })
    let doc: OcrDocument
    const started = performance.now()
    try {
      doc = await runOcr(sample, media)
    } catch (e) {
      if (runId.current === id) setOcr({ status: "error", error: e instanceof Error ? e.message : String(e) })
      return
    }
    if (runId.current !== id) return
    setOcr({ status: "done", doc, ms: performance.now() - started })
    setResults(Object.fromEntries(chosen.map((x) => [x, { status: "running" }])))
    await Promise.all(
      chosen.map(async (model) => {
        const t0 = performance.now()
        let r: OcrResult
        try {
          const spans = await detectTextSpans(model, doc.text, "ocr")
          r = { status: "done", ms: performance.now() - t0, spans }
        } catch (e) {
          r = { status: "error", error: e instanceof Error ? e.message : String(e) }
        }
        if (runId.current === id) setResults((prev) => ({ ...prev, [model]: r }))
      }),
    )
  }

  if (error) return <ErrorNote message={error} />
  if (!samples) return <Skeleton className="h-96 w-full" />

  const answers = sample?.answers ?? []
  const doc = ocr?.status === "done" ? ocr.doc : null
  const shown = TEXT_MODELS.filter((x) => results[x.id])
  const caught = Object.fromEntries(
    shown.map((x) => {
      const r = results[x.id]
      return [x.id, r?.status === "done" && doc ? caughtAnswers(answers, doc.text, r.spans) : null]
    }),
  ) as Record<TextModelId, Set<string> | null>

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-16 lg:w-80 lg:shrink-0">
        <SamplePicker samples={samples} value={sampleId} onChange={pick} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">OCR</span>
          <ModelToggle name={m.models.ocr.name} body={m.models.ocr.body} host="gpu" checked disabled />
        </div>
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
        <Button onClick={run} disabled={!media || ocr?.status === "running" || Object.values(results).some((r) => r?.status === "running")}>
          <Play />
          {m.run}
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {ocr?.status === "error" && <ErrorNote message={ocr.error} />}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          {media ? <BoxedImage media={media} boxes={[]} /> : <Skeleton className="aspect-[4/3] w-full" />}

          <section className="flex flex-col gap-2 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{m.answerKey}</h3>
              {ocr?.status === "done" && <span className="ml-auto text-[11px] text-muted-foreground">OCR {ms(ocr.ms)}</span>}
            </div>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-medium" />
                  <th className="px-1 py-1 text-right font-medium" title={m.ocrReadHint}>
                    OCR
                  </th>
                  {shown.map((x) => (
                    <th key={x.id} className="px-1 py-1 text-right font-medium" title={m.models[x.id].name}>
                      {m.models[x.id].name.split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {answers.map((a) => (
                  <tr key={a}>
                    <td className="max-w-40 truncate py-1.5 pr-2 font-mono" title={a}>
                      {a}
                    </td>
                    <td className="px-1 py-1.5">{doc ? <Tick ok={readIn(doc.text, a)} /> : <span className="block text-right text-muted-foreground">·</span>}</td>
                    {shown.map((x) => (
                      <td key={x.id} className="px-1 py-1.5">
                        {caught[x.id] ? <Tick ok={caught[x.id]!.has(a)} /> : <span className="block text-right text-muted-foreground">·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{m.ocrReadHint}</p>
          </section>
        </div>

        {ocr?.status === "running" && <Skeleton className="h-64 w-full" />}

        {media && doc && shown.length > 0 && (
          <div className={cn("grid gap-4", shown.length > 1 && "xl:grid-cols-2", shown.length > 2 && "2xl:grid-cols-3")}>
            {shown.map((x) => {
              const r = results[x.id]!
              const hits = caught[x.id]
              const rate = hits && answers.length ? hits.size / answers.length : null
              return (
                <section key={x.id} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4">
                  <h3 className="text-sm font-semibold">{m.models[x.id].name}</h3>
                  {r.status === "running" && <Skeleton className="h-48 w-full" />}
                  {r.status === "error" && <ErrorNote message={r.error} />}
                  {r.status === "done" && (
                    <>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <Metric label={m.metrics.caught} value={hits ? `${hits.size}/${answers.length}` : "—"} tone={scoreTone(rate)} />
                        <Metric label={m.metrics.recall} value={pct(rate)} tone={scoreTone(rate)} />
                        <Metric label={m.metrics.flagged} value={String(r.spans.length)} />
                        <Metric label={m.metrics.time} value={ms(r.ms)} />
                      </div>
                      <BoxedImage media={media} boxes={spanBoxes(doc, r.spans)} />
                    </>
                  )}
                </section>
              )
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{m.synthetic}</p>
      </div>
    </div>
  )
}

export function FacePanel() {
  const m = useMessages().playground
  const { samples: all, error } = useMediaSamples()
  // The face model reads images; documents would need a page render first.
  const samples = all?.filter((s) => !s.document)
  const [sampleId, setSampleId] = useState("M008")
  const [threshold, setThreshold] = useState(0.5)
  const [loaded, setLoaded] = useState<{ src: string; media: LoadedMedia } | null>(null)
  const [result, setResult] = useState<{ status: "running" } | { status: "error"; error: string } | { status: "done"; faces: FaceBox[]; ms: number } | null>(
    null,
  )
  const runId = useRef(0)
  const sample = samples?.find((s) => s.id === sampleId)
  const media = loaded && loaded.src === sample?.src ? loaded.media : null
  const picked = all?.find((s) => s.id === sampleId)

  useEffect(() => {
    if (!picked) return
    let live = true
    loadMedia(picked).then(
      (media) => live && setLoaded({ src: picked.src, media }),
      (e: Error) => live && setResult({ status: "error", error: e.message }),
    )
    return () => {
      live = false
    }
  }, [picked])

  function pick(id: string) {
    runId.current++
    setSampleId(id)
    setResult(null)
  }

  async function run() {
    if (!sample || !media) return
    const id = ++runId.current
    setResult({ status: "running" })
    const started = performance.now()
    try {
      const faces = await runFaces(sample, media)
      if (runId.current === id) setResult({ status: "done", faces, ms: performance.now() - started })
    } catch (e) {
      if (runId.current === id) setResult({ status: "error", error: e instanceof Error ? e.message : String(e) })
    }
  }

  if (error) return <ErrorNote message={error} />
  if (!samples) return <Skeleton className="h-96 w-full" />

  const kept = result?.status === "done" ? result.faces.filter((f) => f.score >= threshold) : []
  const avg = kept.length ? kept.reduce((n, f) => n + f.score, 0) / kept.length : null

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-16 lg:w-80 lg:shrink-0">
        <SamplePicker samples={samples} value={sampleId} onChange={pick} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{m.modelsLabel}</span>
          <ModelToggle name={m.models.face.name} body={m.models.face.body} host="gpu" checked disabled />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{m.faceNote}</p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center text-xs font-medium text-muted-foreground">
            {m.threshold}
            <span className="ml-auto font-mono tabular-nums">{threshold.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="accent-primary"
          />
        </label>
        <Button onClick={run} disabled={!media || result?.status === "running"}>
          <Play />
          {m.run}
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {result?.status === "error" && <ErrorNote message={result.error} />}
        {result?.status === "done" && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border p-4">
            <Metric label={m.metrics.faces} value={`${kept.length}/${result.faces.length}`} />
            <Metric label={m.metrics.score} value={avg === null ? "—" : avg.toFixed(2)} />
            <Metric label={m.metrics.time} value={ms(result.ms)} />
          </div>
        )}
        {media ? (
          <BoxedImage
            className="max-w-3xl"
            media={media}
            boxes={kept.map((f) => ({ ...f.box, label: f.score.toFixed(2), tone: "face" as const }))}
          />
        ) : (
          <Skeleton className="aspect-[4/3] w-full max-w-3xl" />
        )}
        <p className="text-[11px] text-muted-foreground">{m.synthetic}</p>
      </div>
    </div>
  )
}
