"use client"

import { useEffect, useRef, useState } from "react"

import { useMessages } from "@/lib/i18n"
import { drawRepaintedFaces, loadImage, loadRaster, paintRegions, rasterSize, type Raster } from "@/lib/pipeline/image"
import type { Box, ImageItem, ImageRegion } from "@/lib/types"
import { cn } from "@/lib/utils"

// Demo view of the media agents: one canvas that animates original → identified → generated.
// Photos: a bar passes over and reveals the OCR layout and the detected PII, then a second pass wipes in
// the generated photo (repainted faces, persona values). Documents: the bar drops blanks over the PII,
// then the blanks fill in one after another in reading order.

export type Phase = "original" | "identify" | "generate"

export const PHASES: Phase[] = ["original", "identify", "generate"]

/** Colour dot for each phase in phase tabs. */
export const PHASE_DOT: Record<Phase, string> = {
  original: "bg-foreground/40",
  identify: "bg-amber-500",
  generate: "bg-emerald-500",
}

export const rank = (p: Phase) => PHASES.indexOf(p)

export function phaseOf(item: ImageItem, until: Phase = "generate"): Phase {
  const phase = item.status === "generated" ? "generate" : item.status === "identified" ? "identify" : "original"
  return PHASES[Math.min(rank(phase), rank(until))]
}

type Layers = { raster: Raster; repainted: HTMLImageElement | null }

function load(item: ImageItem, phase: Phase): Promise<Layers> {
  const repaint = phase === "generate" && item.repainted ? loadImage(item.repainted).catch(() => null) : null
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

/**
 * Tick height along the bar, `x` from -1 to 1: a tall swell in the middle and smaller ripples dying out
 * towards the ends. Ticks never vanish, so the nodes between ripples still show.
 */
export const barProfile = (x: number) =>
  Math.max(0.1, Math.abs(Math.cos(3.5 * Math.PI * x)) * (0.28 + 0.72 * Math.exp(-8 * x * x)))

/** The bar that passes over an image, as long as `length`, lying along x and centred on y = half. */
type Bar = { sprite: HTMLCanvasElement; half: number }

function bar(length: number): Bar {
  const b = Math.max(6, length * 0.03)
  const half = Math.ceil(b * 1.4)
  const ink = document.createElement("canvas")
  ink.width = Math.ceil(length)
  ink.height = half * 2
  const g = ink.getContext("2d")!
  g.translate(0, half)
  g.fillStyle = "#171717"
  // A hairline across the image carrying evenly spaced ticks shaped by `barProfile`.
  const unit = Math.max(1, length / 400)
  g.fillRect(0, -unit / 2, length, unit)
  const start = length * 0.04
  const end = length * 0.96
  const gap = Math.max(3, b * 0.28)
  const w = gap * 0.38
  for (let u = start; u <= end; u += gap) {
    const r = b * barProfile(((u - start) / (end - start)) * 2 - 1)
    g.fillRect(u - w / 2, -r, w, r * 2)
  }

  // A pale rim keeps it readable on dark images.
  const sprite = document.createElement("canvas")
  sprite.width = ink.width
  sprite.height = ink.height
  const ctx = sprite.getContext("2d")!
  ctx.shadowColor = "rgba(255,255,255,0.75)"
  ctx.shadowBlur = Math.max(2, b * 0.15)
  ctx.drawImage(ink, 0, 0)
  return { sprite, half }
}

/** The bar across the image at `pos`: upright for a vertical pass, else lying flat. */
function drawBar(ctx: CanvasRenderingContext2D, pass: Bar, pos: number, vertical: boolean) {
  ctx.save()
  if (vertical) {
    ctx.translate(pos, 0)
    ctx.rotate(Math.PI / 2)
  } else ctx.translate(0, pos)
  ctx.drawImage(pass.sprite, 0, -pass.half)
  ctx.restore()
}

/** Bar position at progress `p`: it enters and leaves the image whole. */
const barAt = (pass: Bar, p: number, span: number) => -pass.half + ease(p) * (span + 2 * pass.half)

const EMERALD = "16,185,129"

/** One step of the animation: `draw` paints time `t` in [0, duration] ms; played backwards, t runs down. */
type Step = { duration: number; draw: (t: number) => void }

/** original → identify: the bar drops the layout boxes and PII marks as it passes them. */
function scanStep(ctx: CanvasRenderingContext2D, item: ImageItem, layers: Layers, layout: boolean): Step {
  const { width, height } = ctx.canvas
  const vertical = item.kind === "photo"
  const pass = bar(vertical ? height : width)
  const duration = vertical ? 1100 : 1300
  const draw = (t: number) => {
    const p = Math.min(1, t / duration)
    const pos = barAt(pass, p, vertical ? width : height)
    drawPhase(ctx, item, "identify", layers, layout, (b) => (vertical ? b.x0 : b.y0) <= pos)
    if (p < 1) drawBar(ctx, pass, pos, vertical)
  }
  return { duration, draw }
}

/** identify → generate for photos: the bar wipes the generated image over the identified one. */
function sweepStep(ctx: CanvasRenderingContext2D, item: ImageItem, layers: Layers, layout: boolean): Step {
  const { width, height } = ctx.canvas
  const before = offscreen(ctx, (c) => drawPhase(c, item, "identify", layers, layout))
  const after = offscreen(ctx, (c) => drawPhase(c, item, "generate", layers, layout))
  const pass = bar(height)
  const duration = 1600
  const draw = (t: number) => {
    const p = Math.min(1, t / duration)
    const x = barAt(pass, p, width)
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(before, 0, 0)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, Math.max(0, x), height)
    ctx.clip()
    ctx.drawImage(after, 0, 0)
    ctx.restore()
    if (p < 1) drawBar(ctx, pass, x, true)
  }
  return { duration, draw }
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
  const draw = (t: number) => {
    // The layout boxes fade out first, then the fill starts.
    if (t < fade) {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(layers.raster, 0, 0)
      paintRegions(ctx, regions, "identify")
      ctx.globalAlpha = 1 - t / fade
      ctx.drawImage(identified, 0, 0)
      ctx.globalAlpha = 1
      return
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
  }
  return { duration: fade + n * per + glow, draw }
}

const HOLD_MS = 450

/**
 * Canvas for one media item that animates whenever the item moves forward a phase (and, with
 * `animateOnMount`, plays from the original (or the given phase) to the current one on mount).
 * A controlled `phase` animates there from whatever is shown, backwards too. `steps` adds the phase strip.
 */
export function LiveCanvas({
  item,
  phase: requested,
  animateOnMount = false,
  animate = true,
  stagger = false,
  layout = true,
  steps = false,
  until = "generate",
  className,
  canvasClassName,
  onCanvas,
  onPhase,
  onSettled,
}: {
  item: ImageItem
  /** Show this phase (capped at how far the item is) instead of following the item. */
  phase?: Phase
  animateOnMount?: boolean | Phase
  /** False draws every change straight away. */
  animate?: boolean
  /** Queue behind other staggered canvases that start in the same tick (a batch of items finishing together). */
  stagger?: boolean
  /** Show the OCR word and layout boxes in the identify phase. */
  layout?: boolean
  steps?: boolean
  /** Stop at this phase even if the item is further along (the identification agent's view). */
  until?: Phase
  className?: string
  canvasClassName?: string
  onCanvas?: (canvas: HTMLCanvasElement) => void
  /** The phase on screen, including the ones an animation passes through. */
  onPhase?: (phase: Phase) => void
  /** The canvas has reached its target phase (may fire again when the item redraws). */
  onSettled?: () => void
}) {
  const m = useMessages().agents
  const ref = useRef<HTMLCanvasElement>(null)
  const latest = useRef(item)
  const callbacks = useRef({ onPhase, onSettled })
  const shown = useRef<{ id: string; phase: Phase } | null>(null)
  const anim = useRef<{ phase: Phase; cancel: () => void } | null>(null)
  const generation = useRef(0)
  const [displayed, setDisplayed] = useState<Phase>("original")
  const reached = phaseOf(item, until)
  const target = requested ? PHASES[Math.min(rank(requested), rank(reached))] : reached
  const controlled = !!requested

  useEffect(() => {
    latest.current = item
    callbacks.current = { onPhase, onSettled }
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
    const phase = target
    const prev = shown.current?.id === item.id ? shown.current.phase : null
    // An animation towards this phase is already playing; it draws the latest item when it ends.
    if (anim.current && anim.current.phase === phase && prev === phase) return
    anim.current?.cancel()
    anim.current = null
    const gen = ++generation.current

    let from: Phase | null = null
    if (animate && !reducedMotion()) {
      // The item only moves forward on its own; going back is for a controlled phase (a picked tab).
      if (prev) from = rank(phase) > rank(prev) || (controlled && phase !== prev) ? prev : null
      else if (animateOnMount) {
        const start = animateOnMount === true ? "original" : animateOnMount
        if (rank(start) < rank(phase)) from = start
      }
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
    const show = (p: Phase) => {
      setDisplayed(p)
      callbacks.current.onPhase?.(p)
    }

    // A backwards animation starts from the later phase, so load what that one needs.
    load(item, from && rank(from) > rank(phase) ? from : phase).then(
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
          const now = latest.current.id === item.id && phaseOf(latest.current, until) === phaseOf(item, until) ? latest.current : item
          drawPhase(ctx, now, phase, layers, layout)
          show(phase)
          onCanvas?.(canvas)
          callbacks.current.onSettled?.()
        }
        if (!from) return finish()

        drawPhase(ctx, item, from, layers, layout)
        show(from)
        // One step per phase boundary, with a short hold between; backwards plays the same steps in reverse.
        const forward = rank(phase) > rank(from)
        const crossed = PHASES.slice(Math.min(rank(from), rank(phase)) + 1, Math.max(rank(from), rank(phase)) + 1)
        const path = (forward ? crossed : crossed.toReversed()).map((boundary) => ({
          make: boundary === "identify" ? scanStep : item.kind === "document" ? typeStep : sweepStep,
          to: forward ? boundary : PHASES[rank(boundary) - 1],
        }))
        let index = 0
        const run = () => {
          if (cancelled) return
          if (index >= path.length) return finish()
          const step = path[index].make(ctx, item, layers, layout)
          show(path[index].to)
          const t0 = performance.now()
          const frame = (now: number) => {
            if (cancelled) return
            const t = Math.min(step.duration, now - t0)
            step.draw(forward ? t : step.duration - t)
            if (t >= step.duration) {
              index++
              timer = setTimeout(run, index < path.length ? HOLD_MS : 0)
            } else raf = requestAnimationFrame(frame)
          }
          raf = requestAnimationFrame(frame)
        }
        timer = setTimeout(run, stagger ? claimDelay() : 0)
      },
      () => {
        if (anim.current === handle) anim.current = null
        callbacks.current.onSettled?.()
      },
    )
  }, [item, target, controlled, animate, animateOnMount, stagger, layout, until, onCanvas])

  return (
    <div className={cn("relative", className)}>
      <canvas ref={ref} className={cn("block h-auto w-full rounded border bg-white", canvasClassName)} />
      {steps && (
        <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1 rounded-full border bg-background/90 px-1.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur-sm">
          {PHASES.slice(0, rank(until) + 1).map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">→</span>}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 transition-colors duration-300",
                  p === displayed && p === "original" && "bg-foreground text-background",
                  p === displayed && p === "identify" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                  p === displayed && p === "generate" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
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
