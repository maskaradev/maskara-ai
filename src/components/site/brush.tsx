"use client"

import { useEffect, useRef } from "react"

/**
 * The logo's mascara wand, drawn large behind a section: a handle, a stem, and a brush of fine bristles
 * that the pointer sweeps as it passes and that spring back. Geometry follows LOGO_PATH in logo.tsx, in
 * its 24-unit grid: handle from 1 to 6, stem to 22.5, bristles from 9 to 21.
 */

type Props = {
  /** Where the middle of the wand sits, as fractions of the section. */
  center?: [number, number]
  /** Rotation in degrees; positive turns clockwise. */
  angle?: number
  /** Handle on the right instead of the left. */
  flip?: boolean
  /** Wand length as a fraction of the section width. */
  span?: number
}

type Half = { x: number; side: -1 | 1; length: number; a: number; v: number; at: number; kicked: boolean }

const STIFFNESS = 170
const DAMPING = 9
const REACH = 110 // px around a bristle that the pointer touches
const SWEEP = 22 // how hard a passing pointer pushes
const WAVE_MS = 700 // the opening sweep runs handle to tip in this long

/** Bristle length along the brush, after the logo: full just past the handle, tapering to a third at the tip. */
function envelope(t: number) {
  const rise = Math.min(1, 0.72 + t * 1.6)
  const fall = 1 - Math.pow(Math.max(0, t - 0.2) / 0.8, 1.8) * 0.62
  return rise * fall
}

export function Brush({ center = [0.5, 0.5], angle = 0, flip = false, span = 1.2 }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [cx, cy] = center

  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext("2d")!
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    let width = 0
    let height = 0
    let unit = 0
    let halves: Half[] = []
    let color = ""
    let frame = 0
    let last = 0
    let visible = false
    let introAt = 0
    let movedAt = 0
    const pointer = { x: NaN, y: NaN, px: NaN, py: NaN, clientX: NaN, clientY: NaN }

    const layout = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = el.clientWidth
      height = el.clientHeight
      el.width = Math.round(width * dpr)
      el.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // On a phone the wand runs off both edges so its bristles stay as bold as on a desktop.
      unit = (width * span * (width < 640 ? 1.9 : 1)) / 21.5
      const reach = Math.min(7.5 * unit, height * 0.3)
      const brush = 12 * unit
      // Few, bold bristles like the logo's, not a fur.
      const count = Math.max(10, Math.min(24, Math.round(brush / 40)))
      const old = halves
      halves = []
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1)
        for (const side of [-1, 1] as const) {
          const prev = old[halves.length]
          halves.push({
            x: (8 + 12 * t) * unit,
            side,
            length: reach * envelope(t),
            a: prev?.a ?? 0,
            v: prev?.v ?? 0,
            at: t * WAVE_MS,
            kicked: prev?.kicked ?? false,
          })
        }
      }
    }

    const readColor = () => {
      color = getComputedStyle(el).getPropertyValue("--brush").trim() || "#ebebeb"
    }

    /** Section pixels → wand pixels: x along the wand from the handle end, y across it. */
    const toWand = (x: number, y: number) => {
      const dx = x - cx * width
      const dy = y - cy * height
      let lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos
      if (flip) lx = -lx
      return { x: lx + 10.75 * unit, y: ly }
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(cx * width, cy * height)
      ctx.rotate(rad)
      if (flip) ctx.scale(-1, 1)
      ctx.translate(-10.75 * unit, 0)
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineCap = "round"

      ctx.lineWidth = Math.max(3, unit * 0.25)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(21.5 * unit, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(0, -0.32 * unit, 5 * unit, 0.64 * unit, 0.32 * unit)
      ctx.fill()

      ctx.lineWidth = Math.max(5, unit * 0.36)
      ctx.beginPath()
      for (const h of halves) {
        // Bend as a curve: the root stays upright, the tip swings by the bristle's angle.
        ctx.moveTo(h.x, 0)
        ctx.quadraticCurveTo(
          h.x,
          h.side * h.length * 0.55,
          h.x + h.length * Math.sin(h.a),
          h.side * h.length * Math.cos(h.a),
        )
      }
      ctx.stroke()
      ctx.restore()
    }

    const step = (now: number) => {
      frame = 0
      const dt = Math.min(0.033, (now - (last || now)) / 1000) || 1 / 60
      last = now

      // Pointer motion in wand space, from where it was last frame (scrolling moves it too).
      let vx = 0
      let vy = 0
      if (!Number.isNaN(pointer.clientX)) {
        const rect = el.getBoundingClientRect()
        const p = toWand(pointer.clientX - rect.left, pointer.clientY - rect.top)
        if (!Number.isNaN(pointer.px)) {
          vx = (p.x - pointer.px) / dt
          vy = (p.y - pointer.py) / dt
        }
        pointer.x = p.x
        pointer.y = p.y
        pointer.px = p.x
        pointer.py = p.y
      }
      const moving = Math.abs(vx) + Math.abs(vy) > 1

      let energy = 0
      const intro = introAt ? now - introAt : -1
      for (const h of halves) {
        if (intro >= h.at && !h.kicked) {
          h.kicked = true
          h.v += 3.2
        }
        if (moving) {
          const dirX = Math.sin(h.a)
          const dirY = h.side * Math.cos(h.a)
          const rx = pointer.x - h.x
          const ry = pointer.y
          const along = Math.max(0, Math.min(h.length, rx * dirX + ry * dirY))
          const d = Math.hypot(rx - along * dirX, ry - along * dirY)
          if (d < REACH) {
            // Touching near the tip moves a bristle more than touching near its root.
            const w = (1 - d / REACH) ** 2 * (0.35 + 0.65 * (along / h.length))
            const push = vx * Math.cos(h.a) - vy * h.side * Math.sin(h.a)
            h.v += (push / h.length) * w * SWEEP * dt
          }
        }
        for (let k = 0; k < 2; k++) {
          const sub = dt / 2
          h.v += (-STIFFNESS * h.a - DAMPING * h.v) * sub
          h.a = Math.max(-1.2, Math.min(1.2, h.a + h.v * sub))
        }
        energy += h.a * h.a + h.v * h.v * 0.01
      }
      draw()
      const introRunning = introAt > 0 && intro < WAVE_MS + 50
      // Stay awake briefly after the pointer last moved, so the next frame can read its speed.
      const tracking = now - movedAt < 120
      if (visible && (moving || tracking || energy > 1e-6 || introRunning)) frame = requestAnimationFrame(step)
      else {
        // Asleep: forget the last position so waking doesn't read the gap as one fast sweep.
        last = 0
        pointer.px = NaN
        pointer.py = NaN
      }
    }

    const wake = () => {
      if (!frame && visible && !still) frame = requestAnimationFrame(step)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      pointer.clientX = e.clientX
      pointer.clientY = e.clientY
      movedAt = performance.now()
      wake()
    }

    readColor()
    layout()
    draw()

    const resize = new ResizeObserver(() => {
      layout()
      draw()
    })
    resize.observe(el)
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !introAt && !still) introAt = performance.now()
      wake()
    })
    seen.observe(el)
    const theme = new MutationObserver(() => {
      readColor()
      draw()
    })
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    const onScroll = () => wake()
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      seen.disconnect()
      theme.disconnect()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("scroll", onScroll)
    }
  }, [cx, cy, angle, flip, span])

  return <canvas className="brush" ref={canvas} aria-hidden="true" />
}
