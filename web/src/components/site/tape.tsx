"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Types each line, holds it, erases it, moves on. Runs only while on screen;
 * reduced motion gets the first line held still.
 */
export function Tape({ prompt, lines }: { prompt: string; lines: string[] }) {
  const root = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(lines[0])

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !root.current) return
    let line = 0
    let ch = 0
    let erasing = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = (ms: number) => {
      timer = setTimeout(tick, ms)
    }
    const tick = () => {
      const full = lines[line]
      if (!erasing) {
        ch++
        setText(full.slice(0, ch))
        if (ch >= full.length) {
          erasing = true
          return schedule(1900)
        }
        return schedule(26 + Math.random() * 44)
      }
      ch = Math.max(0, ch - 3)
      setText(full.slice(0, ch))
      if (ch === 0) {
        erasing = false
        line = (line + 1) % lines.length
        return schedule(360)
      }
      schedule(14)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer)
        if (entry.isIntersecting) schedule(0)
      },
      { threshold: 0.35 },
    )
    observer.observe(root.current)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [lines])

  return (
    <div className="tape" ref={root} aria-hidden="true">
      <b>{prompt}</b>
      <span>{text}</span>
    </div>
  )
}
