"use client"

import { FilePlus2 } from "lucide-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { RunList } from "@/components/run-list"
import { RunView } from "@/components/run-view"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMessages } from "@/lib/i18n"
import { useAppStore, useHydrated } from "@/lib/store"

export function JobsScreen({ runId }: { runId?: string }) {
  const hydrated = useHydrated()
  const runs = useAppStore((s) => s.runs)
  const run = runId ? runs.find((r) => r.id === runId) : runs[0]
  const m = useMessages().jobs

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail, run ? m.runShort(run.number) : m.runs]} />
      <main className="flex flex-1 flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
          <p className="text-sm text-muted-foreground">{m.subtitle}</p>
        </div>
        {!hydrated ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="flex flex-col gap-6 2xl:flex-row">
            <RunList runs={runs} selectedId={run?.id} />
            {run ? (
              <RunView key={run.id} run={run} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {runId ? m.gone : m.empty}
                </p>
                <Button asChild>
                  <Link href="/jobs/new">
                    <FilePlus2 />
                    {m.newJob}
                  </Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
