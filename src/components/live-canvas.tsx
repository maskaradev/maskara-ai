"use client"

import { useEffect, useRef, useState } from "react"

import { useMessages } from "@/lib/i18n"
import { drawRepaintedFaces, loadImage, loadRaster, paintRegions, rasterSize, type Raster } from "@/lib/pipeline/image"
import type { Box, ImageItem, ImageRegion } from "@/lib/types"
import { cn } from "@/lib/utils"

// Demo view of the media agents: one canvas that animates original → identified → generated.
// Photos: a scan bar reveals the OCR layout and the detected PII, then a second bar wipes in the
// generated photo (repainted faces, persona values). Documents: the scan bar drops blanks over the PII,
// then the blanks fill in one after another in reading order.

export type Phase = "original" | "identify" | "generate"

const PHASES: Phase[] = ["original", "identify", "generate"]

export function phaseOf(item: ImageItem, until: Phase = "generate"): Phase {
  const phase = item.status === "generated" ? "generate" : item.status === "identified" ? "identify" : "original"
  return PHASES[Math.min(PHASES.indexOf(phase), PHASES.indexOf(until))]
}

type Layers = { raster: Raster; repainted: HTMLImageElement | null }

function load(item: ImageItem, phase: Phase): Promise<Layers> {
  const repaint = phase === "generate" && item.repainted ? loadImage(item.repainted) : null
  return Promise.all([loadRaster(item), repaint]).then(([raster, repainted]) => ({ raster, repainted }))
}

// Items finishing in the same tick (all pages of a PDF, a batch of photos) start one after another.
const STAGGER_MS = 200
let nextStart = 0
function claimDelay(): number {
  const now = performance.now()
  const start = Math.max(now, nextStart)
  nextStart = start + STAGGER_MS
  return start - now
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** Photos keep the original pixels in the identify phase: PII is boxed, not blanked, so the face swap shows. */
function paintDetected(ctx: CanvasRenderingContext2D, regions: ImageRegion[]) {
  const unit = Math.max(1.5, ctx.canvas.width / 600)
  for (const r of regions) {
    const w = r.x1 - r.x0
    const h = r.y1 - r.y0
    ctx.setLineDash([])
    if (r.visual === "face") {
      // Viewfinder corners.
      const c = Math.min(w, h) * 0.22
      ctx.strokeStyle = "rgba(239,68,68,0.95)"
      ctx.lineWidth = unit * 2
      ctx.beginPath()
      for (const [x, y, dx, dy] of [
        [r.x0, r.y0, 1, 1],
        [r.x1, r.y0, -1, 1],
        [r.x0, r.y1, 1, -1],
        [r.x1, r.y1, -1, -1],
      ]) {
        ctx.moveTo(x + dx * c, y)
        ctx.lineTo(x, y)
        ctx.lineTo(x, y + dy * c)
      }
      ctx.stroke()
    } else {
      ctx.fillStyle = "rgba(239,68,68,0.14)"
      ctx.fillRect(r.x0, r.y0, w, h)
      ctx.strokeStyle = "rgba(220,38,38,0.9)"
      ctx.lineWidth = unit
      ctx.strokeRect(r.x0, r.y0, w, h)
    }
    if (!r.first) continue
    const label = r.visual ? r.visual.toUpperCase() : r.type
    const size = Math.round(unit * 6.5)
    ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`
    const tw = ctx.measureText(label).width + size * 0.8
    const th = size * 1.4
    const ty = r.y0 - th >= 0 ? r.y0 - th : r.y1
    ctx.fillStyle = "rgba(220,38,38,0.95)"
    ctx.fillRect(r.x0, ty, tw, th)
    ctx.fillStyle = "#fff"
    ctx.textBaseline = "middle"
    ctx.fillText(label, r.x0 + size * 0.4, ty + th / 2)
  }
}

type Visible = (b: Box) => boolean
const all: Visible = () => true

function drawPhase(ctx: CanvasRenderingContext2D, item: ImageItem, phase: Phase, layers: Layers, layout: boolean, visible: Visible = all) {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(layers.raster, 0, 0)
  if (phase === "original") return
  if (phase === "generate") {
    if (layers.repainted) drawRepaintedFaces(ctx, layers.repainted, item.regions, item.words)
    paintRegions(ctx, item.regions, "generate", { facesRepainted: !!layers.repainted })
    return
  }
  const regions = item.regions.filter(visible)
  const words = item.words.filter(visible)
  const blocks = (item.blocks ?? []).filter((b) => visible(b.bbox))
  if (item.kind === "document") {
    paintRegions(ctx, regions, "identify", { words, blocks, showLayout: layout })
  } else {
    if (layout) paintRegions(ctx, [], "identify", { words, blocks, showLayout: true })
    paintDetected(ctx, regions)
  }
}

function offscreen(ctx: CanvasRenderingContext2D, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = ctx.canvas.width
  c.height = ctx.canvas.height
  paint(c.getContext("2d")!)
  return c
}

/** A glowing scan bar at `pos` (x for a vertical bar, y for a horizontal one) with a fading trail behind it. */
function drawBar(ctx: CanvasRenderingContext2D, pos: number, vertical: boolean, rgb: string) {
  const { width, height } = ctx.canvas
  const span = vertical ? width : height
  const across = vertical ? height : width
  const trail = span * 0.08
  const core = Math.max(3, span * 0.005)
  ctx.save()
  const g = vertical ? ctx.createLinearGradient(pos - trail, 0, pos, 0) : ctx.createLinearGradient(0, pos - trail, 0, pos)
  g.addColorStop(0, `rgba(${rgb},0)`)
  g.addColorStop(1, `rgba(${rgb},0.35)`)
  ctx.fillStyle = g
  if (vertical) ctx.fillRect(pos - trail, 0, trail, across)
  else ctx.fillRect(0, pos - trail, across, trail)
  ctx.shadowColor = `rgba(${rgb},1)`
  ctx.shadowBlur = core * 6
  ctx.fillStyle = `rgba(${rgb},1)`
  if (vertical) ctx.fillRect(pos - core / 2, 0, core, across)
  else ctx.fillRect(0, pos - core / 2, across, core)
  ctx.fillStyle = "rgba(255,255,255,0.9)"
  ctx.shadowBlur = 0
  if (vertical) ctx.fillRect(pos - core / 6, 0, core / 3, across)
  else ctx.fillRect(0, pos - core / 6, across, core / 3)
  ctx.restore()
}

const SKY = "56,189,248"
const EMERALD = "16,185,129"

/** One step of the animation; `frame` draws time `t` (ms) and returns true when the step is over. */
type Step = (t: number) => boolean

/** original → identify: the scan bar drops the layout boxes and PII marks as it passes them. */
function scanStep(ctx: CanvasRenderingContext2D, item: ImageItem, layers: Layers, layout: boolean): Step {
  const { width, height } = ctx.canvas
  const vertical = item.kind === "photo"
  const duration = vertical ? 1100 : 1300
  return (t) => {
    const p = Math.min(1, t / duration)
    const pos = ease(p) * (vertical ? width : height) * 1.04
    drawPhase(ctx, item, "identify", layers, layout, (b) => (vertical ? b.x0 : b.y0) <= pos)
    if (p < 1) drawBar(ctx, pos, vertical, SKY)
    return p >= 1
  }
}

/** identify → generate for photos: a vertical bar wipes the generated image over the identified one. */
function sweepStep(ctx: CanvasRenderingContext2D, item: ImageItem, layers: Layers, layout: boolean): Step {
  const { width, height } = ctx.canvas
  const before = offscreen(ctx, (c) => drawPhase(c, item, "identify", layers, layout))
  const after = offscreen(ctx, (c) => drawPhase(c, item, "generate", layers, layout))
  const duration = 1600
  return (t) => {
    const p = Math.min(1, t / duration)
    const x = ease(p) * width
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(before, 0, 0)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, x, height)
    ctx.clip()
    ctx.drawImage(after, 0, 0)
    ctx.restore()
    if (p < 1) drawBar(ctx, x, true, EMERALD)
    return p >= 1
  }
}

/** identify → generate for documents: blanks fill with persona values one by one, typed left to right. */
function typeStep(ctx: CanvasRenderingContext2D, item: ImageItem, layers: Layers, layout: boolean): Step {
  const { width, height } = ctx.canvas
  const regions = [...item.regions].sort((a, b) => Math.round(a.y0 / 12) - Math.round(b.y0 / 12) || a.x0 - b.x0)
  const n = regions.length
  const per = Math.min(260, Math.max(80, 2600 / Math.max(n, 1)))
  const fade = 350
  const glow = 450
  const identified = offscreen(ctx, (c) => drawPhase(c, item, "identify", layers, layout))
  const unit = Math.max(1.5, width / 600)
  return (t) => {
    // The layout boxes fade out first, then the fill starts.
    if (t < fade) {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(layers.raster, 0, 0)
      paintRegions(ctx, regions, "identify")
      ctx.globalAlpha = 1 - t / fade
      ctx.drawImage(identified, 0, 0)
      ctx.globalAlpha = 1
      return false
    }
    const tt = t - fade
    const k = Math.floor(tt / per)
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(layers.raster, 0, 0)
    paintRegions(ctx, regions.slice(k + 1), "identify")
    paintRegions(ctx, regions.slice(0, Math.min(k, n)), "generate")
    ctx.save()
    ctx.shadowColor = `rgba(${EMERALD},1)`
    ctx.lineWidth = unit * 1.5
    // Just-filled blanks keep a fading glow.
    for (let j = Math.max(0, k - 4); j < Math.min(k, n); j++) {
      const a = 1 - (tt - (j + 1) * per) / glow
      if (a <= 0) continue
      const r = regions[j]
      ctx.strokeStyle = `rgba(${EMERALD},${a})`
      ctx.shadowBlur = unit * 6 * a
      ctx.strokeRect(r.x0 - unit, r.y0 - unit, r.x1 - r.x0 + 2 * unit, r.y1 - r.y0 + 2 * unit)
    }
    ctx.restore()
    const cur = regions[k]
    if (cur) {
      const frac = (tt - k * per) / per
      paintRegions(ctx, [cur], "identify")
      const reach = (cur.x1 - cur.x0) * 1.4 + 6
      const x = cur.x0 - 2 + reach * frac
      ctx.save()
      ctx.beginPath()
      ctx.rect(cur.x0 - 2, cur.y0 - 4, reach * frac, cur.y1 - cur.y0 + 8)
      ctx.clip()
      paintRegions(ctx, [cur], "generate")
      ctx.restore()
      ctx.save()
      ctx.shadowColor = `rgba(${EMERALD},1)`
      ctx.shadowBlur = unit * 8
      ctx.strokeStyle = `rgba(${EMERALD},0.95)`
      ctx.lineWidth = unit * 1.5
      ctx.strokeRect(cur.x0 - unit, cur.y0 - unit, cur.x1 - cur.x0 + 2 * unit, cur.y1 - cur.y0 + 2 * unit)
      ctx.fillStyle = `rgba(${EMERALD},1)`
      ctx.fillRect(Math.min(x, cur.x0 + reach), cur.y0, unit * 1.5, cur.y1 - cur.y0)
      ctx.restore()
    }
    return tt >= n * per + glow
  }
}

const HOLD_MS = 450

/**
 * Canvas for one media item that animates whenever the item moves forward a phase (and, with
 * `animateOnMount`, plays original → current phase once on mount). `steps` adds the phase strip.
 */
export function LiveCanvas({
  item,
  animateOnMount = false,
  layout = true,
  steps = false,
  until = "generate",
  className,
  canvasClassName,
  onCanvas,
}: {
  item: ImageItem
  animateOnMount?: boolean
  /** Show the OCR word and layout boxes in the identify phase. */
  layout?: boolean
  steps?: boolean
  /** Stop at this phase even if the item is further along (the identification agent's view). */
  until?: Phase
  className?: string
  canvasClassName?: string
  onCanvas?: (canvas: HTMLCanvasElement) => void
}) {
  const m = useMessages().agents
  const ref = useRef<HTMLCanvasElement>(null)
  const latest = useRef(item)
  const shown = useRef<{ id: string; phase: Phase } | null>(null)
  const anim = useRef<{ phase: Phase; cancel: () => void } | null>(null)
  const generation = useRef(0)
  const [displayed, setDisplayed] = useState<Phase>("original")

  useEffect(() => {
    latest.current = item
  })

  useEffect(
    () => () => {
      anim.current?.cancel()
      anim.current = null
      generation.current++
      // Lets a remount (or React's dev double-mount) play its mount animation again.
      shown.current = null
    },
    [],
  )

  useEffect(() => {
    const phase = phaseOf(item, until)
    const prev = shown.current?.id === item.id ? shown.current.phase : null
    // An animation towards this phase is already playing; it draws the latest item when it ends.
    if (anim.current && anim.current.phase === phase && prev === phase) return
    anim.current?.cancel()
    anim.current = null
    const gen = ++generation.current

    let from: Phase | null = null
    if (!reducedMotion()) {
      if (prev && PHASES.indexOf(phase) > PHASES.indexOf(prev)) from = prev
      else if (!prev && animateOnMount && phase !== "original") from = "original"
    }
    shown.current = { id: item.id, phase }

    let cancelled = false
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const handle = {
      phase,
      cancel: () => {
        cancelled = true
        cancelAnimationFrame(raf)
        clearTimeout(timer)
      },
    }
    if (from) anim.current = handle

    load(item, phase).then(
      (layers) => {
        const canvas = ref.current
        if (cancelled || gen !== generation.current || !canvas) return
        const size = rasterSize(layers.raster)
        if (canvas.width !== size.width || canvas.height !== size.height) {
          canvas.width = size.width
          canvas.height = size.height
        }
        const ctx = canvas.getContext("2d")!
        const finish = () => {
          if (anim.current === handle) anim.current = null
          const now = latest.current.id === item.id && phaseOf(latest.current, until) === phase ? latest.current : item
          drawPhase(ctx, now, phase, layers, layout)
          setDisplayed(phase)
          onCanvas?.(canvas)
        }
        if (!from) return finish()

        drawPhase(ctx, item, from, layers, layout)
        setDisplayed(from)
        // original → identify → generate, one step per phase boundary, with a short hold between.
        const path = PHASES.slice(PHASES.indexOf(from), PHASES.indexOf(phase) + 1)
        const makers = path.slice(1).map((to) =>
          to === "identify" ? scanStep : item.kind === "document" ? typeStep : sweepStep,
        )
        let index = 0
        const run = () => {
          if (cancelled) return
          if (index >= makers.length) return finish()
          const step = makers[index](ctx, item, layers, layout)
          setDisplayed(path[index + 1])
          const t0 = performance.now()
          const frame = (now: number) => {
            if (cancelled) return
            if (step(now - t0)) {
              index++
              timer = setTimeout(run, index < makers.length ? HOLD_MS : 0)
            } else raf = requestAnimationFrame(frame)
          }
          raf = requestAnimationFrame(frame)
        }
        timer = setTimeout(run, claimDelay())
      },
      () => {
        if (anim.current === handle) anim.current = null
      },
    )
  }, [item, animateOnMount, layout, until, onCanvas])

  return (
    <div className={cn("relative", className)}>
      <canvas ref={ref} className={cn("block h-auto w-full rounded border bg-white", canvasClassName)} />
      {steps && (
        <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-1 text-[11px] font-semibold text-white/50 backdrop-blur-sm">
          {PHASES.slice(0, PHASES.indexOf(until) + 1).map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && <span className="text-white/40">→</span>}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 transition-colors duration-300",
                  p === displayed && p === "original" && "bg-white/90 text-black",
                  p === displayed && p === "identify" && "bg-sky-400 text-black",
                  p === displayed && p === "generate" && "bg-emerald-400 text-black",
                )}
              >
                {m.phases[p]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
