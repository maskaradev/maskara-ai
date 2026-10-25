"use client"

import { useMessages } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { RunStatus, StageStatus } from "@/lib/types"

const STYLES: Record<StageStatus | RunStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  succeeded: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  skipped: "bg-muted text-muted-foreground",
}

export function StatusBadge({ status, className }: { status: StageStatus | RunStatus; className?: string }) {
  const m = useMessages()
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-semibold", STYLES[status], className)}>
      {status === "running" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {m.status[status]}
    </span>
  )
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
