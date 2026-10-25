import Papa from "papaparse"

import { locateEntities } from "@/lib/mask"
import type { DetectRequest } from "@/lib/pii-schema"
import { detectFormFields } from "@/lib/pii/form-fields"
import { isScoredLabel, scoreSpans, type DetectedSpan } from "@/lib/pii/span-eval"
import { detectFaces, loadImage, ocrImage, ocrPage, rasterSize, refineWords, type Raster } from "@/lib/pipeline/image"
import { mockDetect } from "@/lib/pipeline/mock-detector"
import { isPdf, renderPdfPage } from "@/lib/pipeline/pdf"
import type { AnswerKey, Box, DetectedEntity, EntityType, FaceBox, GoldSpan, OcrDocument, Row, SpanAnswerKey, SpanReport } from "@/lib/types"

// The Playground runs one sample through several detectors side by side and scores each against the
// sample's answer key. It reuses the masking pipeline's detectors and scoring, nothing playground-only.

export type Modality = "text" | "ocr" | "face" | "audio" | "video"

export type TextModelId = "rules" | "privacy-filter" | "claude"

/** Where a model runs, which also tells the user what it needs to work. */
export type ModelHost = "browser" | "gpu" | "api"

export const TEXT_MODELS: { id: TextModelId; host: ModelHost }[] = [
  { id: "rules", host: "browser" },
  { id: "privacy-filter", host: "gpu" },
  { id: "claude", host: "api" },
]

export type TextSample = { id: string; title: string; detail: string; text: string; gold?: GoldSpan[] }

export type TextCorpus = {
  id: "nemotron-pii" | "hospital-notes"
  source: string
  license: string
  samples: TextSample[]
  key?: SpanAnswerKey
}

export type MediaSample = { id: string; title: string; src: string; document: boolean; answers: string[] }

const NEMOTRON = "/samples/nemotron-pii/"
const HOSPITAL = "/samples/hospital/"

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`)
  return res.text()
}

const parseRows = (csv: string) => Papa.parse<Row>(csv.trim(), { header: true, skipEmptyLines: true }).data

export async function loadTextCorpora(): Promise<TextCorpus[]> {
  const [docs, key, notes] = await Promise.all([
    fetchText(NEMOTRON + "documents.csv"),
    fetchText(NEMOTRON + "answer_key.json").then((t) => JSON.parse(t) as SpanAnswerKey),
    fetchText(HOSPITAL + "clinical_notes.csv"),
  ])
  return [
    {
      id: "nemotron-pii",
      source: key.source,
      license: key.license,
      key,
      samples: parseRows(docs).map((r) => ({
        id: r.doc_id,
        title: r.document_type,
        detail: r.document_format,
        text: r.text,
        gold: key.records[r.doc_id]?.spans,
      })),
    },
    {
      id: "hospital-notes",
      source: "Riverside General Hospital (synthetic)",
      license: "Apache-2.0",
      samples: parseRows(notes).map((r) => ({ id: r.note_id, title: r.department, detail: r.author, text: r.note_text })),
    },
  ]
}

/** Images and PDFs from the hospital sample, each with the identifiers a masker should catch on it. */
export async function loadMediaSamples(): Promise<MediaSample[]> {
  const [csv, key] = await Promise.all([
    fetchText(HOSPITAL + "encounter_media.csv"),
    fetchText(HOSPITAL + "encounter_media_answer_key.json").then((t) => JSON.parse(t) as AnswerKey),
  ])
  return parseRows(csv)
    .filter((r) => r.image_path)
    .map((r) => ({
      id: r.record_id,
      title: r.image_type.replace(/_/g, " "),
      src: HOSPITAL + r.image_path,
      document: isPdf(r.image_path),
      answers: key[r.record_id]?.image ?? [],
    }))
}

// ---------- text detection ----------

/** Results per model and text, so switching samples or re-running doesn't call a model twice. */
const textCache = new Map<string, DetectedSpan[]>()

async function textEntities(model: TextModelId, text: string, source: DetectRequest["context"]["source"]): Promise<DetectedEntity[]> {
  if (model === "rules") {
    // Regex patterns and form-label rules only; no names it hasn't been told about.
    return [...mockDetect(text, { patientName: null, providers: [] }), ...detectFormFields(text)]
  }
  const res = await fetch("/api/detect-pii", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      context: { patientName: null, providers: [], source },
      engine: model === "claude" ? "claude" : "local",
    } satisfies DetectRequest),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `PII detection failed (${res.status})`)
  return body.entities as DetectedEntity[]
}

export async function detectTextSpans(
  model: TextModelId,
  text: string,
  source: DetectRequest["context"]["source"] = "clinical_text",
): Promise<DetectedSpan[]> {
  const key = `${model}:${source}:${text}`
  const cached = textCache.get(key)
  if (cached) return cached
  const spans = locateEntities(text, await textEntities(model, text, source)).map((s) => ({ start: s.start, end: s.end, type: s.entity.type }))
  textCache.set(key, spans)
  return spans
}

/** Runs `fn` over `items` with at most `limit` in flight, reporting progress as each finishes. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onDone?: (done: number) => void): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
      onDone?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function scoreSample(key: SpanAnswerKey, sample: TextSample, detected: DetectedSpan[]): SpanReport {
  return scoreSpans(key, [{ record: sample.id, text: sample.text, gold: sample.gold ?? [], detected }])
}

/**
 * How a stretch of text came out for one model:
 * hit = caught a scored identifier, miss = a scored identifier it didn't catch,
 * false = flagged something that isn't PII, extra = flagged an attribute the policy keeps (not scored),
 * found = flagged, on a sample without an answer key.
 */
export type MarkKind = "hit" | "miss" | "false" | "extra" | "found"

export type Mark = { start: number; end: number; kind: MarkKind; type?: EntityType; label?: string }

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end

export function markSpans(detected: DetectedSpan[], gold: GoldSpan[] | undefined): Mark[] {
  if (!gold) return detected.map((d) => ({ ...d, kind: "found" }))
  const marks: Mark[] = detected.map((d) => {
    const hits = gold.filter((g) => overlaps(d, g))
    const kind = hits.some((g) => isScoredLabel(g.label)) ? "hit" : hits.length ? "extra" : "false"
    return { start: d.start, end: d.end, kind, type: d.type, label: hits[0]?.label }
  })
  for (const g of gold) {
    if (isScoredLabel(g.label) && !detected.some((d) => overlaps(d, g))) marks.push({ start: g.start, end: g.end, kind: "miss", label: g.label })
  }
  marks.sort((a, b) => a.start - b.start || b.end - a.end)
  // Adjacent gold labels can overlap; keep the first so the text renders once.
  return marks.filter((m, i) => !marks.slice(0, i).some((p) => overlaps(p, m)))
}

// ---------- images and documents ----------

export type LoadedMedia = { raster: Raster; url: string; width: number; height: number }

export async function loadMedia(sample: MediaSample): Promise<LoadedMedia> {
  if (sample.document) {
    const canvas = await renderPdfPage(sample.src, 1)
    return { raster: canvas, url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height }
  }
  const img = await loadImage(sample.src)
  return { raster: img, url: sample.src, ...rasterSize(img) }
}

const ocrCache = new Map<string, OcrDocument>()

export async function runOcr(sample: MediaSample, media: LoadedMedia): Promise<OcrDocument> {
  const cached = ocrCache.get(sample.src)
  if (cached) return cached
  const name = sample.src.split("/").pop() ?? "image.png"
  const raw =
    media.raster instanceof HTMLCanvasElement ? await ocrPage(media.raster, name) : await ocrImage(sample.src, media.raster)
  const ocr = refineWords(media.raster, raw)
  ocrCache.set(sample.src, ocr)
  return ocr
}

/** Word boxes covered by the detected spans, i.e. what would be painted over on the image. */
export function spanBoxes(ocr: OcrDocument, spans: DetectedSpan[]): (Box & { type: EntityType })[] {
  return ocr.words.flatMap((w) => {
    const span = spans.find((s) => overlaps(s, w))
    return span ? [{ ...w.bbox, type: span.type }] : []
  })
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Whether a value appears in the text at all, ignoring case, spacing and punctuation. */
export const readIn = (text: string, value: string) => normalize(text).includes(normalize(value))

/** Answer-key values one of the detected spans covers (same matching as the run's privacy report). */
export function caughtAnswers(answers: string[], text: string, spans: DetectedSpan[]): Set<string> {
  const found = spans.map((s) => normalize(text.slice(s.start, s.end))).filter((s) => s.length >= 2)
  return new Set(
    answers.filter((a) => {
      const v = normalize(a)
      return found.some((e) => e === v || e.includes(v) || v.includes(e))
    }),
  )
}

const faceCache = new Map<string, FaceBox[]>()

export async function runFaces(sample: MediaSample, media: LoadedMedia): Promise<FaceBox[]> {
  if (!(media.raster instanceof HTMLImageElement)) throw new Error("Face detection runs on images, not PDFs.")
  const cached = faceCache.get(sample.src)
  if (cached) return cached
  const faces = await detectFaces(sample.src, media.raster)
  faceCache.set(sample.src, faces)
  return faces
}
