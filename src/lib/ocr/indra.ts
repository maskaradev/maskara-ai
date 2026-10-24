import { z } from "zod"

import type { Box, LayoutBlock, LayoutKind, OcrDocument, OcrWord } from "@/lib/types"

// Client for the in-house GPU OCR server (indra-ocr, `datalab-to/indra-ocr`). Server-only (the
// server is on the tailnet). `node scripts/probe-ocr.mjs` dumps raw responses.
//
// POST /v1/ocr, multipart: file, format=md|text|json, mode=auto|ocr|text, math, max_pages.
// format=json returns per page: text lines with boxes and confidence, layout blocks (Surya labels:
// Section-Header, Text, Table, Page-Footer, Picture, Handwriting, …) in reading order, the page
// markdown, and the detected rotation/skew. Boxes are in source-image pixels.

const DEFAULT_URL = "https://gx10-a4ea.tail0fa1f7.ts.net:8443"
const TIMEOUT_MS = 120_000
/** Lines below this confidence are detector noise (e.g. ECG waveforms read as glyphs). */
const MIN_CONF = 0.7
const LOW_CONF = 0.9

export class OcrServerError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const BoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

const ResponseSchema = z.object({
  pages: z
    .array(
      z.object({
        rotation: z.number().default(0),
        skew: z.number().default(0),
        lines: z.array(z.object({ box: BoxSchema, text: z.string(), conf: z.number().default(1) })).default([]),
        blocks: z.array(z.object({ label: z.string(), bbox: BoxSchema, text: z.string().default("") })).default([]),
      }),
    )
    .min(1),
})

export async function runOcr(file: Blob, filename: string, size: { width: number; height: number }): Promise<OcrDocument> {
  const base = (process.env.OCR_API_URL || DEFAULT_URL).replace(/\/+$/, "")

  const form = new FormData()
  form.append("file", file, filename)
  form.append("format", "json")
  form.append("mode", "auto")
  form.append("max_pages", "1")

  let res: Response
  try {
    res = await fetch(`${base}/v1/ocr`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new OcrServerError(`OCR server timed out after ${TIMEOUT_MS / 1000}s.`, 504)
    const cause = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error)
    throw new OcrServerError(`Could not reach the OCR server at ${base} (${cause}). Is this machine on the tailnet?`, 502)
  }
  const body = await res.text()
  if (!res.ok) throw new OcrServerError(`OCR server error ${res.status}: ${body.slice(0, 300)}`, 502)

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    throw new OcrServerError(`OCR server did not return JSON (got: ${body.slice(0, 120)}…).`, 502)
  }
  const parsed = ResponseSchema.safeParse(json)
  if (!parsed.success) throw new OcrServerError(`Unexpected OCR response: ${parsed.error.issues[0]?.message ?? "invalid shape"}`, 502)
  return toDocument(parsed.data.pages[0], size)
}

type Page = z.infer<typeof ResponseSchema>["pages"][number]
type Line = { box: Box; text: string; conf: number; index: number }

const toBox = ([x0, y0, x1, y1]: [number, number, number, number]): Box => ({ x0, y0, x1, y1 })
const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0)

function layoutKind(label: string): LayoutKind {
  const l = label.toLowerCase()
  if (/section-header|title/.test(l)) return "title"
  if (/table|form/.test(l)) return "table"
  if (/picture|figure/.test(l)) return "figure"
  if (/handwriting/.test(l)) return "handwriting"
  if (/page-header|page-footer/.test(l)) return "page"
  if (/text|list|caption|footnote|formula/.test(l)) return "text"
  return "other"
}

/** Splits a line box among its words in proportion to their character positions. */
function estimateWords(line: Line): { text: string; at: number; box: Box }[] {
  const unit = (line.box.x1 - line.box.x0) / Math.max(line.text.length, 1)
  const out: { text: string; at: number; box: Box }[] = []
  let cursor = 0
  for (const part of line.text.split(/\s+/).filter(Boolean)) {
    const at = line.text.indexOf(part, cursor)
    out.push({ text: part, at, box: { ...line.box, x0: line.box.x0 + at * unit, x1: line.box.x0 + (at + part.length) * unit } })
    cursor = at + part.length
  }
  return out
}

/** Groups lines into visual rows (top to bottom), each row left to right. */
function rows(lines: Line[]): Line[][] {
  const out: Line[][] = []
  for (const line of [...lines].sort((a, b) => a.box.y0 + a.box.y1 - (b.box.y0 + b.box.y1))) {
    const mid = (line.box.y0 + line.box.y1) / 2
    const row = out.find((r) => mid > r[0].box.y0 && mid < r[0].box.y1)
    if (row) row.push(line)
    else out.push([line])
  }
  return out.map((r) => r.sort((a, b) => a.box.x0 - b.box.x0))
}

/**
 * Reading-order text built from the layout: blocks in the model's order, each block's lines
 * regrouped into rows so a form label and its value end up on one line ("Date of birth | 01/15/2011"),
 * and section headings marked with "## ". Word offsets index into this text.
 */
export function toDocument(page: Page, size: { width: number; height: number }): OcrDocument {
  const blocks: LayoutBlock[] = page.blocks.map((b) => ({ label: b.label, kind: layoutKind(b.label), bbox: toBox(b.bbox), text: b.text.trim() || undefined }))
  const all: Line[] = page.lines.map((l, index) => ({ box: toBox(l.box), text: l.text.trim(), conf: l.conf, index }))
  const lines = all.filter((l) => l.conf >= MIN_CONF && /[\p{Script=Latin}\p{Script=Hangul}\d]/u.test(l.text))

  // Each line belongs to the smallest block containing its centre; the rest go last.
  const members = new Map<number, Line[]>()
  for (const line of lines) {
    const cx = (line.box.x0 + line.box.x1) / 2
    const cy = (line.box.y0 + line.box.y1) / 2
    let owner = -1
    blocks.forEach((b, i) => {
      const inside = cx >= b.bbox.x0 - 3 && cx <= b.bbox.x1 + 3 && cy >= b.bbox.y0 - 3 && cy <= b.bbox.y1 + 3
      if (inside && (owner < 0 || area(b.bbox) < area(blocks[owner].bbox))) owner = i
    })
    members.set(owner, [...(members.get(owner) ?? []), line])
  }
  // Handwriting with no readable line in it is most likely a signature.
  blocks.forEach((b, i) => {
    if (b.kind === "handwriting" && !members.get(i)?.length) b.kind = "signature"
  })

  const words: OcrWord[] = []
  let text = ""
  const order = [...blocks.keys(), -1].filter((i) => members.get(i)?.length)
  for (const [n, blockIndex] of order.entries()) {
    if (n > 0) text += "\n\n"
    const heading = blockIndex >= 0 && blocks[blockIndex].kind === "title"
    rows(members.get(blockIndex)!).forEach((row, r) => {
      if (r > 0) text += "\n"
      if (heading) text += "## "
      row.forEach((line, c) => {
        if (c > 0) text += " | "
        for (const w of estimateWords(line)) {
          const start = text.length + w.at
          words.push({ text: w.text, line: line.index, start, end: start + w.text.length, bbox: w.box, block: blockIndex >= 0 ? blockIndex : null })
        }
        text += line.text
      })
    })
  }

  return {
    width: size.width,
    height: size.height,
    text,
    words,
    blocks,
    rotation: page.rotation,
    skew: page.skew,
    droppedLines: all.length - lines.length,
    lowConfidence: lines.filter((l) => l.conf < LOW_CONF).map((l) => l.text),
  }
}
