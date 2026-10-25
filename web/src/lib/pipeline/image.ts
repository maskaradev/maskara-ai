import { getRepaint, putRepaint, REPAINT_PREFIX } from "@/lib/face/repaint-store"
import { hash53 } from "@/lib/hash"
import { renderPdfPage } from "@/lib/pipeline/pdf"
import type { Box, FaceBox, ImageItem, ImageRegion, LayoutBlock, LayoutKind, OcrDocument, OcrWord, Point, VisualKind } from "@/lib/types"

/** A photo, or a PDF page rendered to a canvas (document lane). */
export type Raster = HTMLImageElement | HTMLCanvasElement

export const rasterSize = (r: Raster) =>
  r instanceof HTMLImageElement ? { width: r.naturalWidth, height: r.naturalHeight } : { width: r.width, height: r.height }

/** Loads a URL, or a "repaint:<id>" reference to a repainted photo kept in IndexedDB. */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  let src = url
  if (url.startsWith(REPAINT_PREFIX)) {
    const png = await getRepaint(url.slice(REPAINT_PREFIX.length))
    if (!png) throw new Error(`Could not load ${url}`)
    src = URL.createObjectURL(png)
  }
  const img = new Image()
  img.crossOrigin = "anonymous"
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Could not load ${url}`))
      img.src = src
    })
  } finally {
    if (src !== url) URL.revokeObjectURL(src)
  }
  return img
}

/** The pixels an item is drawn on: the image itself, or its rendered PDF page. */
export function loadRaster(item: Pick<ImageItem, "kind" | "src" | "page">): Promise<Raster> {
  return item.kind === "document" ? renderPdfPage(item.src, item.page ?? 1) : loadImage(item.src)
}

function toCanvas(img: Raster): HTMLCanvasElement {
  const { width, height } = rasterSize(img)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0)
  return canvas
}

async function postOcr(file: Blob, name: string, size: { width: number; height: number }): Promise<OcrDocument> {
  const form = new FormData()
  form.append("file", file, name)
  form.append("width", String(size.width))
  form.append("height", String(size.height))
  const res = await fetch("/api/ocr", { method: "POST", body: form })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `OCR failed (${res.status})`)
  return body as OcrDocument
}

const canvasPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the page."))), "image/png"))

/** OCR for one rendered PDF page; the same server and model as the photos. */
export async function ocrPage(page: HTMLCanvasElement, name: string): Promise<OcrDocument> {
  return postOcr(await canvasPng(page), name, rasterSize(page))
}

/**
 * OCR of the parts of a photo around its faces, merged back into full-image coordinates.
 * The OCR server's orientation check misreads some portraits as upside down (and then reads the
 * label strip backwards); without the face in the crop it gets the orientation right.
 */
export async function ocrAroundFaces(img: HTMLImageElement, faces: FaceBox[], name: string): Promise<OcrDocument> {
  const { width, height } = rasterSize(img)
  const u = faces.reduce((a, f) => ({ x0: Math.min(a.x0, f.box.x0), y0: Math.min(a.y0, f.box.y0), x1: Math.max(a.x1, f.box.x1), y1: Math.max(a.y1, f.box.y1) }), faces[0].box)
  const fw = u.x1 - u.x0
  const fh = u.y1 - u.y0
  // Grow the face box to cover hair and ears; barely below the chin, where label strips usually start.
  const f = { x0: Math.max(0, u.x0 - fw * 0.25), y0: Math.max(0, u.y0 - fh * 0.45), x1: Math.min(width, u.x1 + fw * 0.25), y1: Math.min(height, u.y1 + fh * 0.05) }
  const bands: Box[] = [
    { x0: 0, y0: 0, x1: width, y1: f.y0 },
    { x0: 0, y0: f.y1, x1: width, y1: height },
    { x0: 0, y0: f.y0, x1: f.x0, y1: f.y1 },
    { x0: f.x1, y0: f.y0, x1: width, y1: f.y1 },
  ]
    .map((b) => ({ x0: Math.round(b.x0), y0: Math.round(b.y0), x1: Math.round(b.x1), y1: Math.round(b.y1) }))
    .filter((b) => b.x1 - b.x0 >= 40 && b.y1 - b.y0 >= 24)
  const parts = await Promise.all(
    bands.map(async (b) => {
      const crop = document.createElement("canvas")
      crop.width = b.x1 - b.x0
      crop.height = b.y1 - b.y0
      crop.getContext("2d")!.drawImage(img, -b.x0, -b.y0)
      return { band: b, doc: await ocrPage(crop, name) }
    }),
  )
  const merged: OcrDocument = { width, height, text: "", words: [], blocks: [], rotation: 0, skew: 0, droppedLines: 0, lowConfidence: [] }
  let lines = 0
  for (const { band, doc } of parts) {
    if (!doc.text.trim()) continue
    const offset = merged.text ? merged.text.length + 2 : 0
    const move = (b: Box): Box => ({ x0: b.x0 + band.x0, y0: b.y0 + band.y0, x1: b.x1 + band.x0, y1: b.y1 + band.y0 })
    const blockBase = merged.blocks.length
    merged.text += (merged.text ? "\n\n" : "") + doc.text
    merged.words.push(...doc.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset, line: w.line + lines, bbox: move(w.bbox), block: w.block === null ? null : w.block + blockBase })))
    merged.blocks.push(...doc.blocks.map((b) => ({ ...b, bbox: move(b.bbox) })))
    merged.rotation ||= doc.rotation
    merged.droppedLines += doc.droppedLines
    merged.lowConfidence.push(...doc.lowConfidence)
    lines += Math.max(0, ...doc.words.map((w) => w.line + 1))
  }
  return merged
}

/**
 * Repaints every face in a photo as the persona (on-prem GPU model, through /api/faces/repaint) and keeps
 * the result in IndexedDB, keyed by photo + persona + prompt. Returns a "repaint:<id>" reference for loadImage.
 */
export async function repaintFaces(src: string, persona: string, prompt: string): Promise<string> {
  const file = await fetch(src).then((r) => r.blob())
  const key = new Blob([file, `\0${persona}\0${prompt}`])
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await key.arrayBuffer()))
  const id = Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")
  if (await getRepaint(id)) return REPAINT_PREFIX + id

  const form = new FormData()
  form.append("file", file, src.split("/").pop()?.split("?")[0] || "image.png")
  form.append("persona", persona)
  form.append("prompt", prompt)
  const res = await fetch("/api/faces/repaint", { method: "POST", body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Face repaint failed (${res.status})`)
  }
  await putRepaint(id, await res.blob())
  return REPAINT_PREFIX + id
}

/**
 * Copies only the faces (with hair and neck) from the repainted photo onto ctx, which holds the original.
 * The repaint model's mask reaches past the face into nearby captions, so OCR word boxes stay original;
 * the ones that are PII get their persona values painted afterwards anyway.
 */
export function drawRepaintedFaces(ctx: CanvasRenderingContext2D, repainted: HTMLImageElement, regions: ImageRegion[], words: Box[] = []) {
  const { width, height } = ctx.canvas
  const mask = document.createElement("canvas")
  mask.width = width
  mask.height = height
  const m = mask.getContext("2d")!
  for (const r of regions) {
    if (r.visual !== "face") continue
    const w = r.x1 - r.x0
    const h = r.y1 - r.y0
    m.filter = `blur(${Math.max(4, Math.round(w * 0.08))}px)`
    m.beginPath()
    m.ellipse(r.x0 + w / 2, r.y0 + h * 0.4, w * 0.85, h * 0.95, 0, 0, 2 * Math.PI)
    m.fill()
  }
  m.filter = "none"
  m.globalCompositeOperation = "destination-out"
  // Padded by about a space's width so the gaps between words on a line stay original too.
  for (const b of words) {
    const px = Math.max(3, (b.y1 - b.y0) * 0.6)
    const py = Math.max(3, (b.y1 - b.y0) * 0.25)
    m.fillRect(b.x0 - px, b.y0 - py, b.x1 - b.x0 + 2 * px, b.y1 - b.y0 + 2 * py)
  }
  m.globalCompositeOperation = "source-in"
  m.drawImage(repainted, 0, 0, width, height)
  ctx.drawImage(mask, 0, 0)
}

/** Faces from the on-prem face detector (through /api/faces, which holds the key), in image pixels. */
export async function detectFaces(src: string, img: HTMLImageElement): Promise<FaceBox[]> {
  const file = await fetch(src).then((r) => r.blob())
  const form = new FormData()
  form.append("file", file, src.split("/").pop()?.split("?")[0] || "image.png")
  const res = await fetch("/api/faces", { method: "POST", body: form })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Face detection failed (${res.status})`)
  // The detector may run on a resized copy; bring its boxes back to the image size.
  const sx = body.width ? img.naturalWidth / body.width : 1
  const sy = body.height ? img.naturalHeight / body.height : 1
  const pt = (p: Point) => ({ x: p.x * sx, y: p.y * sy })
  return (body.faces as FaceBox[]).map((f) => ({
    ...f,
    box: { x0: f.box.x0 * sx, y0: f.box.y0 * sy, x1: f.box.x1 * sx, y1: f.box.y1 * sy },
    landmarks: f.landmarks.map(pt),
  }))
}

/** Sends the image to the GPU OCR server (through /api/ocr, which holds the key). */
export async function ocrImage(src: string, img: HTMLImageElement): Promise<OcrDocument> {
  const file = await fetch(src).then((r) => {
    if (!r.ok) throw new Error(`Could not read ${src} (${r.status})`)
    return r.blob()
  })
  return postOcr(file, src.split("/").pop()?.split("?")[0] || "image.png", rasterSize(img))
}

/**
 * The OCR server boxes whole lines; word boxes inside a line start as character-count estimates.
 * Snap each estimated word boundary to the widest blank column gap near it, so a PII word in the
 * middle of a line ("DOB 01/30/1934 MRN 100512") gets a tight box.
 */
export function refineWords(img: Raster, ocr: OcrDocument): OcrDocument {
  const { width: imgW, height: imgH } = rasterSize(img)
  const ctx = toCanvas(img).getContext("2d", { willReadFrequently: true })!
  const byLine = new Map<number, OcrWord[]>()
  for (const w of ocr.words) byLine.set(w.line, [...(byLine.get(w.line) ?? []), w])
  const refined = new Map<OcrWord, Box>()
  for (const words of byLine.values()) {
    if (words.length < 2) continue
    const x0 = Math.max(0, Math.floor(words[0].bbox.x0))
    const x1 = Math.min(imgW, Math.ceil(words.at(-1)!.bbox.x1))
    const y0 = Math.max(0, Math.floor(words[0].bbox.y0))
    const y1 = Math.min(imgH, Math.ceil(words[0].bbox.y1))
    if (x1 - x0 < 4 || y1 - y0 < 2) continue
    const w = x1 - x0
    const data = ctx.getImageData(x0, y0, w, y1 - y0).data
    const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    // Background = the most common brightness in the line box (boxes are tight, so corners can be ink).
    const hist = new Array<number>(17).fill(0)
    for (let i = 0; i < data.length; i += 4) hist[Math.round(lum(i) / 16)]++
    const bg = hist.indexOf(Math.max(...hist)) * 16
    const inked = Array.from({ length: w }, (_, x) => {
      for (let y = 0; y < y1 - y0; y++) if (Math.abs(lum((y * w + x) * 4) - bg) > 60) return true
      return false
    })
    const gaps: { a: number; b: number }[] = []
    for (let x = 0; x < w; x++) {
      if (inked[x]) continue
      const a = x
      while (x < w && !inked[x]) x++
      if (a > 0 && x < w) gaps.push({ a: x0 + a, b: x0 + x })
    }
    const chars = words.at(-1)!.end - words[0].start
    const charW = w / Math.max(chars, 1)
    const boxes = words.map((word) => ({ ...word.bbox }))
    let floor = x0
    for (let k = 0; k < words.length - 1; k++) {
      const est = (words[k].bbox.x1 + words[k + 1].bbox.x0) / 2
      const near = gaps.filter((g) => g.a > floor && Math.abs((g.a + g.b) / 2 - est) < 2 * charW)
      const best = near.sort((p, q) => q.b - q.a - (p.b - p.a) || Math.abs((p.a + p.b) / 2 - est) - Math.abs((q.a + q.b) / 2 - est))[0]
      if (!best) continue
      boxes[k].x1 = best.a
      boxes[k + 1].x0 = best.b
      floor = best.b
    }
    words.forEach((word, k) => refined.set(word, boxes[k]))
  }
  return { ...ocr, words: ocr.words.map((w) => (refined.has(w) ? { ...w, bbox: refined.get(w)! } : w)) }
}

const VISUAL: Partial<Record<LayoutKind, ImageRegion["type"]>> = { signature: "PERSON" }

const isVisual = (kind: LayoutKind): kind is Extract<VisualKind, LayoutKind> => kind in VISUAL

/** Background (just left of the box) and ink (the pixel that contrasts with it most) inside a box. */
function sampleColors(ctx: CanvasRenderingContext2D, box: Box) {
  const { width, height } = ctx.canvas
  const x0 = Math.max(0, Math.floor(box.x0))
  const y0 = Math.max(0, Math.floor(box.y0))
  const w = Math.max(1, Math.min(width, Math.ceil(box.x1)) - x0)
  const h = Math.max(1, Math.min(height, Math.ceil(box.y1)) - y0)
  const [br, bgG, bb] = ctx.getImageData(Math.max(0, x0 - 3), Math.round(y0 + h / 2), 1, 1).data
  const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b
  const bgLum = lum(br, bgG, bb)
  const data = ctx.getImageData(x0, y0, w, h).data
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 4000)))
  let ink = [br, bgG, bb]
  let best = 0
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      const d = Math.abs(lum(data[i], data[i + 1], data[i + 2]) - bgLum)
      if (d > best) {
        best = d
        ink = [data[i], data[i + 1], data[i + 2]]
      }
    }
  }
  return { bg: `rgb(${br},${bgG},${bb})`, ink: `rgb(${ink.join(",")})` }
}

/**
 * Turn located PII spans into per-line boxes on the image, sampling the background
 * and ink colours so the generation agent can repaint them convincingly.
 */
export function spansToRegions(
  img: Raster,
  ocr: OcrDocument,
  spans: { start: number; end: number; type: ImageRegion["type"]; original: string }[],
): ImageRegion[] {
  const ctx = toCanvas(img).getContext("2d", { willReadFrequently: true })!
  const regions: ImageRegion[] = []
  spans.forEach((span, index) => {
    const hit = ocr.words.filter((w) => w.start < span.end && w.end > span.start)
    const byLine = new Map<number, OcrWord[]>()
    hit.forEach((w) => byLine.set(w.line, [...(byLine.get(w.line) ?? []), w]))
    let first = true
    for (const words of byLine.values()) {
      const box = {
        x0: Math.min(...words.map((w) => w.bbox.x0)) - 2,
        y0: Math.min(...words.map((w) => w.bbox.y0)) - 2,
        x1: Math.max(...words.map((w) => w.bbox.x1)) + 2,
        y1: Math.max(...words.map((w) => w.bbox.y1)) + 2,
      }
      regions.push({ ...box, ...sampleColors(ctx, box), type: span.type, original: span.original, replacement: null, first, span: index })
      first = false
    }
  })
  return regions
}

/** Layout blocks that identify someone without being text (signatures), masked whole. */
export function layoutRegions(img: Raster, blocks: LayoutBlock[]): ImageRegion[] {
  const ctx = toCanvas(img).getContext("2d", { willReadFrequently: true })!
  return blocks.flatMap((b) => {
    if (!isVisual(b.kind)) return []
    const box = { x0: b.bbox.x0 - 2, y0: b.bbox.y0 - 2, x1: b.bbox.x1 + 2, y1: b.bbox.y1 + 2 }
    return [{ ...box, ...sampleColors(ctx, box), type: VISUAL[b.kind]!, original: b.text ?? `[${b.label}]`, replacement: null, first: true, visual: b.kind }]
  })
}

const rgb = (d: Uint8ClampedArray | number[]) => `rgb(${d[0]},${d[1]},${d[2]})`

/** Mean colour of a small patch, ignoring the brightest and darkest pixels (highlights, pores). */
function patchColor(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): number[] {
  const { width, height } = ctx.canvas
  const x0 = Math.max(0, Math.round(x - r))
  const y0 = Math.max(0, Math.round(y - r))
  const w = Math.max(1, Math.min(width - x0, Math.round(2 * r)))
  const h = Math.max(1, Math.min(height - y0, Math.round(2 * r)))
  const d = ctx.getImageData(x0, y0, w, h).data
  const px: number[][] = []
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]])
  px.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
  const mid = px.slice(Math.floor(px.length * 0.2), Math.ceil(px.length * 0.8))
  return [0, 1, 2].map((c) => Math.round(mid.reduce((n, p) => n + p[c], 0) / Math.max(mid.length, 1)))
}

/**
 * Face regions for the repaint model. `bg` is the skin tone (sampled on the cheeks) and `ink` the
 * colour around the face; `bg` fills the blank when there is no repainted image.
 */
export function faceRegions(img: Raster, faces: FaceBox[]): ImageRegion[] {
  const ctx = toCanvas(img).getContext("2d", { willReadFrequently: true })!
  return faces.map((f, i) => {
    const w = f.box.x1 - f.box.x0
    const h = f.box.y1 - f.box.y0
    const [le, re, nose] = f.landmarks
    const r = Math.max(2, w * 0.05)
    const skin = le && re && nose
      ? [patchColor(ctx, (le.x + nose.x) / 2, nose.y, r), patchColor(ctx, (re.x + nose.x) / 2, nose.y, r)].reduce((a, b) => a.map((v, c) => Math.round((v + b[c]) / 2)))
      : patchColor(ctx, f.box.x0 + w / 2, f.box.y0 + h * 0.6, r)
    return {
      ...f.box,
      type: "PERSON",
      original: `[face ${i + 1} · ${Math.round(f.score * 100)}%]`,
      replacement: null,
      first: true,
      bg: rgb(skin),
      ink: rgb(patchColor(ctx, f.box.x0 + w / 2, Math.max(0, f.box.y0 - h * 0.12), r)),
      visual: "face" as const,
    }
  })
}

export type PaintMode = "original" | "identify" | "generate"

const LAYOUT_COLOR: Record<LayoutKind, string> = {
  text: "rgba(100,116,139,0.8)",
  title: "rgba(79,70,229,0.85)",
  table: "rgba(13,148,136,0.85)",
  figure: "rgba(217,119,6,0.85)",
  handwriting: "rgba(192,38,211,0.9)",
  signature: "rgba(192,38,211,0.9)",
  page: "rgba(100,116,139,0.6)",
  other: "rgba(100,116,139,0.6)",
}

function seeded(seed: string) {
  let s = hash53(seed) % 2 ** 32
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Synthetic signature scribble; seeded so the same region always looks the same. */
function paintSignature(ctx: CanvasRenderingContext2D, r: ImageRegion) {
  const w = r.x1 - r.x0
  const h = r.y1 - r.y0
  const rand = seeded(`${r.original}@${Math.round(r.x0)},${Math.round(r.y0)}`)
  ctx.fillStyle = r.bg
  ctx.fillRect(r.x0, r.y0, w, h)
  ctx.strokeStyle = r.ink
  ctx.lineWidth = Math.max(1.5, h / 22)
  ctx.lineCap = "round"
  ctx.beginPath()
  let x = r.x0 + w * 0.06
  ctx.moveTo(x, r.y0 + h * (0.4 + rand() * 0.3))
  while (x < r.x1 - w * 0.12) {
    const nx = x + w * (0.08 + rand() * 0.1)
    ctx.bezierCurveTo(x + w * 0.03, r.y0 + h * rand() * 0.4, nx - w * 0.03, r.y0 + h * (0.6 + rand() * 0.35), nx, r.y0 + h * (0.35 + rand() * 0.3))
    x = nx
  }
  ctx.stroke()
}

/** Draw OCR/layout boxes, blanks (identify) or persona values (generate) over an image already drawn on ctx. */
export function paintRegions(
  ctx: CanvasRenderingContext2D,
  regions: ImageRegion[],
  mode: PaintMode,
  options: { words?: Box[]; blocks?: LayoutBlock[]; showLayout?: boolean; facesRepainted?: boolean } = {},
) {
  if (mode === "identify" && options.showLayout) {
    ctx.lineWidth = 1
    ctx.strokeStyle = "rgba(59,130,246,0.55)"
    for (const w of options.words ?? []) ctx.strokeRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0)
    ctx.font = "600 10px Arial, Helvetica, sans-serif"
    ctx.textBaseline = "bottom"
    for (const b of options.blocks ?? []) {
      ctx.strokeStyle = ctx.fillStyle = LAYOUT_COLOR[b.kind]
      ctx.lineWidth = 1.5
      ctx.strokeRect(b.bbox.x0 - 4, b.bbox.y0 - 4, b.bbox.x1 - b.bbox.x0 + 8, b.bbox.y1 - b.bbox.y0 + 8)
      ctx.fillText(b.label, b.bbox.x0 - 4, Math.max(10, b.bbox.y0 - 5))
    }
  }
  if (mode === "original") return

  // Whole-region identifiers first, so any text redrawn over them stays on top.
  const ordered = [...regions.filter((r) => r.visual), ...regions.filter((r) => !r.visual)]
  for (const r of ordered) {
    const h = r.y1 - r.y0

    if (mode === "identify") {
      ctx.fillStyle = r.bg
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, h)
      ctx.fillStyle = "rgba(239,68,68,0.10)"
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, h)
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = "rgba(220,38,38,0.9)"
      ctx.lineWidth = 1.5
      ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, h)
      ctx.setLineDash([])
      if (r.first) {
        const size = r.visual ? 12 : Math.max(9, Math.min(14, Math.round(h * 0.45)))
        ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`
        ctx.fillStyle = "rgba(185,28,28,0.95)"
        ctx.textBaseline = "middle"
        ctx.fillText(r.visual ? r.visual.toUpperCase() : r.type, r.x0 + 4, r.visual ? r.y0 + 12 : r.y0 + h / 2)
      }
      continue
    }

    if (r.visual === "face") {
      // The repaint model already replaced the face in the base image. Without one (e.g. a run saved
      // before the avatar fallback was removed), blank the face so the original never shows.
      if (!options.facesRepainted) {
        ctx.fillStyle = r.bg
        ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, h)
      }
      continue
    }
    if (r.visual) {
      paintSignature(ctx, r)
      continue
    }
    ctx.fillStyle = r.bg
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, h)
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
