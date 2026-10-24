"use client"

import { Bot, Cloud, Database, FlaskConical, Laptop } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { StatusBadge, formatDuration } from "@/components/status-badge"
import { useMessages } from "@/lib/i18n"
import { LAST_COL, STAGES, STAGE_BY_ID, type StageLocation } from "@/lib/pipeline/stages"
import type { Run, StageId, StageState } from "@/lib/types"
import { cn } from "@/lib/utils"

const W = 172
const H = 96
const GAP_X = 36
const ROW = H + 16
const PAD = 26
const MIN_SCALE = 0.5

const x = (col: number) => col * (W + GAP_X)
const y = (lane: number) => PAD + lane * ROW

const LOCATION_ICON: Record<StageLocation, typeof Laptop> = {
  "local-db": Database,
  browser: Laptop,
  "external-api": Cloud,
  mock: FlaskConical,
}

const EDGE_COLOR: Record<StageState["status"], string> = {
  succeeded: "stroke-emerald-500/70",
  running: "stroke-sky-500",
  failed: "stroke-red-500/70",
  pending: "stroke-border",
  skipped: "stroke-border",
}

export function stageDuration(s: StageState, now: number): string | null {
  if (!s.startedAt) return null
  return formatDuration((s.finishedAt ?? now) - s.startedAt)
}

export function PipelineGraph({
  run,
  now,
  selected,
  onSelect,
}: {
  run: Run
  now: number
  selected: StageId | null
  onSelect: (id: StageId) => void
}) {
  const m = useMessages().graph
  const width = x(LAST_COL) + W
  const height = y(3) + H + 8
  const outer = width + 32
  const containerRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(outer)
  const [fit, setFit] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = fit ? Math.max(MIN_SCALE, Math.min(1, available / outer)) : 1

  return (
    <div className="relative">
      {available < outer && (
        <div className="absolute top-2 right-2 z-10 flex overflow-hidden rounded-md border bg-card text-[11px]">
          {[true, false].map((isFit) => (
            <button
              key={String(isFit)}
              type="button"
              onClick={() => setFit(isFit)}
              className={cn("px-2 py-1", isFit === fit ? "bg-muted font-medium" : "text-muted-foreground")}
            >
              {isFit ? m.fit : "100%"}
            </button>
          ))}
        </div>
      )}
      <div ref={containerRef} className="overflow-x-auto rounded-xl border bg-muted/30">
        <div style={{ width: outer * scale, height: height * scale }}>
          <div className="relative origin-top-left" style={{ width: outer, height, transform: `scale(${scale})` }}>
            {/* lane bands behind the branching columns */}
            {m.lanes.map((lane, i) => (
              <div
                key={lane}
                className={cn("absolute rounded-lg border border-dashed border-border/80", i === 0 && "border-solid border-violet-500/40 bg-violet-500/[0.04]")}
                style={{ left: 16 + x(3) - 12, top: y(i) - 6, width: (i === 0 ? x(4) : x(3)) - x(3) + W + 24, height: H + 12 }}
              >
                <span className="absolute -top-2.5 left-2 bg-muted/30 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase backdrop-blur">
                  {lane}
                </span>
              </div>
            ))}

            <svg className="pointer-events-none absolute inset-0" width={width + 32} height={height}>
              {STAGES.flatMap((from) =>
                from.next.map((toId) => {
                  const to = STAGE_BY_ID[toId]
                  const x1 = 16 + x(from.col) + W
                  const y1 = y(from.lane) + H / 2
                  const x2 = 16 + x(to.col)
                  const y2 = y(to.lane) + H / 2
                  const mid = (x1 + x2) / 2
                  const status = run.stages[from.id].status
                  const target = run.stages[toId].status
                  return (
                    <path
                      key={`${from.id}-${toId}`}
                      d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      strokeWidth={1.5}
                      strokeDasharray={target === "skipped" ? "4 4" : target === "running" ? "6 4" : undefined}
                      className={cn(EDGE_COLOR[status], target === "running" && "animate-[dash_1s_linear_infinite]")}
                    />
                  )
                }),
              )}
            </svg>

            {STAGES.map((def) => {
              const s = run.stages[def.id]
              const Icon = LOCATION_ICON[def.location]
              const pct = s.total ? Math.min(100, (s.done / s.total) * 100) : s.status === "succeeded" ? 100 : 0
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => onSelect(def.id)}
                  className={cn(
                    "absolute flex cursor-pointer flex-col gap-1 rounded-lg border bg-card p-2.5 text-left shadow-xs transition hover:border-foreground/30",
                    selected === def.id && "ring-2 ring-ring",
                    s.status === "running" && "border-sky-500/60",
                    s.status === "failed" && "border-red-500/60",
                    s.status === "skipped" && "border-dashed opacity-60",
                    def.mock && "border-dashed bg-card/60",
                    def.agent && "border-violet-500/50 shadow-sm",
                  )}
                  style={{ left: 16 + x(def.col), top: y(def.lane), width: W, height: H }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={s.status} />
                    <span className="text-[11px] text-muted-foreground tabular-nums">{stageDuration(s, now)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate text-[13px] leading-tight font-semibold">
                    {def.agent && <Bot className="size-3.5 shrink-0 text-violet-600 dark:text-violet-400" />}
                    <span className="truncate">{m.stages[def.id].label}</span>
                    {def.mock && (
                      <span className="shrink-0 rounded border border-dashed px-1 text-[9.5px] font-medium text-muted-foreground">{m.mock}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className={cn("h-full transition-all", s.status === "failed" ? "bg-red-500" : "bg-emerald-500")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {s.done}/{s.total}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "mt-auto flex items-center gap-1 truncate text-[10.5px] text-muted-foreground",
                      def.location === "external-api" && "font-medium text-amber-700 dark:text-amber-300",
                    )}
                  >
                    <Icon className="size-3 shrink-0" />
                    {m.locations[def.location]}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
