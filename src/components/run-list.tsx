"use client"

import { Plus } from "lucide-react"
import Link from "next/link"

import { StatusBadge, formatDuration } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useNow } from "@/hooks/use-now"
import { useMessages } from "@/lib/i18n"
import type { Run } from "@/lib/types"
import { cn } from "@/lib/utils"

function timeLabel(ts: number, locale: string) {
  return new Date(ts).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function RunList({ runs, selectedId }: { runs: Run[]; selectedId?: string }) {
  const m = useMessages()
  const now = useNow(runs.some((r) => r.status === "running"))
  return (
    <aside className="flex w-full min-w-0 flex-col gap-3 2xl:w-72 2xl:shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{m.jobs.recentRuns}</h2>
        <Button size="sm" variant="outline" asChild>
          <Link href="/jobs/new">
            <Plus />
            {m.jobs.newRun}
          </Link>
        </Button>
      </div>
      <ul className="flex gap-1.5 overflow-x-auto pb-1 2xl:flex-col 2xl:overflow-visible 2xl:pb-0">
        {runs.map((r) => (
          <li key={r.id} className="w-60 shrink-0 2xl:w-auto">
            <Link
              href={`/jobs/${r.id}`}
              className={cn(
                "flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted",
                r.id === selectedId && "border-foreground/20 bg-muted",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={r.status} />
                <span className="text-[11px] text-muted-foreground tabular-nums">{timeLabel(r.startedAt, m.localeTag)}</span>
              </div>
              <div className="text-sm font-medium">{m.jobs.runTitle(r.number)}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.datasetName} · {formatDuration((r.finishedAt ?? now) - r.startedAt)}
              </div>
            </Link>
          </li>
        ))}
        {runs.length === 0 && (
          <li className="w-full rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{m.jobs.noRuns}</li>
        )}
      </ul>
    </aside>
  )
}
