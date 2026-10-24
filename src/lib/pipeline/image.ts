import type Tesseract from "tesseract.js"

import type { Box, ImageRegion } from "@/lib/types"

export type OcrWord = { text: string; line: number; start: number; end: number; bbox: Box }

export type OcrResult = { text: string; words: OcrWord[] }

let worker: Promise<Tesseract.Worker> | null = null

async function getWorker() {
  if (!worker) {
    worker = import("tesseract.js").then(({ createWorker }) => createWorker("eng"))
  }
  return worker
}

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = "anonymous"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(`Could not load ${url}`))
    img.src = url
  })
  return img
}

function toCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0)
  return canvas
}

export async function ocrImage(img: HTMLImageElement): Promise<OcrResult> {
  const w = await getWorker()
  const { data } = await w.recognize(toCanvas(img), {}, { blocks: true })
  const words: OcrWord[] = []
  const lines: string[] = []
  let offset = 0
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const parts: string[] = []
        for (const word of line.words) {
          const text = word.text.trim()
          if (!text) continue
          const start = offset + parts.join(" ").length + (parts.length ? 1 : 0)
          parts.push(text)
          words.push({ text, line: lines.length, start, end: start + text.length, bbox: word.bbox })
        }
        if (!parts.length) continue
        const lineText = parts.join(" ")
        lines.push(lineText)
        offset += lineText.length + 1
      }
    }
  }
  return { text: lines.join("\n"), words }
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const [r, g, b] = ctx.getImageData(Math.max(0, x), Math.max(0, y), 1, 1).data
  return { css: `rgb(${r},${g},${b})`, lum: 0.299 * r + 0.587 * g + 0.114 * b }
}

/**
 * Turn located PII spans into per-line boxes on the image, sampling the background
 * and ink colours so the generation agent can repaint them convincingly.
 */
export function spansToRegions(
  img: HTMLImageElement,
  ocr: OcrResult,
  spans: { start: number; end: number; type: ImageRegion["type"]; original: string }[],
): ImageRegion[] {
  const ctx = toCanvas(img).getContext("2d", { willReadFrequently: true })!
  const regions: ImageRegion[] = []
  for (const span of spans) {
    const hit = ocr.words.filter((w) => w.start < span.end && w.end > span.start)
    const byLine = new Map<number, OcrWord[]>()
    hit.forEach((w) => byLine.set(w.line, [...(byLine.get(w.line) ?? []), w]))
    let first = true
    for (const words of byLine.values()) {
      const x0 = Math.min(...words.map((w) => w.bbox.x0)) - 2
      const y0 = Math.min(...words.map((w) => w.bbox.y0)) - 2
      const x1 = Math.max(...words.map((w) => w.bbox.x1)) + 2
      const y1 = Math.max(...words.map((w) => w.bbox.y1)) + 2
      const bg = pixel(ctx, x0 - 3, Math.round((y0 + y1) / 2))
      let ink = bg
      for (let x = x0; x < x1; x += 2) {
        for (let y = y0; y < y1; y += 2) {
          const p = pixel(ctx, x, y)
          if (Math.abs(p.lum - bg.lum) > Math.abs(ink.lum - bg.lum)) ink = p
        }
      }
      regions.push({ x0, y0, x1, y1, type: span.type, original: span.original, replacement: null, first, bg: bg.css, ink: ink.css })
      first = false
    }
  }
  return regions
}

export type PaintMode = "original" | "identify" | "generate"

/** Draw OCR boxes, blanks (identify) or persona values (generate) over an image already drawn on ctx. */
export function paintRegions(
  ctx: CanvasRenderingContext2D,
  regions: ImageRegion[],
  mode: PaintMode,
  options: { words?: Box[]; showWords?: boolean } = {},
) {
  if (mode === "identify" && options.showWords) {
    ctx.strokeStyle = "rgba(59,130,246,0.55)"
    ctx.lineWidth = 1
    for (const w of options.words ?? []) ctx.strokeRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0)
  }
  if (mode === "original") return

  for (const r of regions) {
    const h = r.y1 - r.y0
    ctx.fillStyle = r.bg
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, h)

    if (mode === "identify") {
      ctx.fillStyle = "rgba(239,68,68,0.10)"
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, h)
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = "rgba(220,38,38,0.9)"
      ctx.lineWidth = 1.5
      ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, h)
      ctx.setLineDash([])
      if (r.first) {
        const size = Math.max(9, Math.min(14, Math.round(h * 0.45)))
        ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`
        ctx.fillStyle = "rgba(185,28,28,0.95)"
        ctx.textBaseline = "middle"
        ctx.fillText(r.type, r.x0 + 4, r.y0 + h / 2)
      }
      continue
    }

    if (!r.replacement) continue
    let size = Math.max(10, Math.round(h * 0.82))
    ctx.font = `600 ${size}px Arial, Helvetica, sans-serif`
    const maxWidth = (r.x1 - r.x0) * 1.35
    while (ctx.measureText(r.replacement).width > maxWidth && size > 9) {
      size--
      ctx.font = `600 ${size}px Arial, Helvetica, sans-serif`
    }
    const width = ctx.measureText(r.replacement).width
    if (width > r.x1 - r.x0) {
      ctx.fillStyle = r.bg
      ctx.fillRect(r.x1, r.y0, width - (r.x1 - r.x0) + 4, h)
    }
    ctx.fillStyle = r.ink
    ctx.textBaseline = "middle"
    ctx.fillText(r.replacement, r.x0 + 2, r.y0 + h / 2)
  }
}
