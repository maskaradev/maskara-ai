"use client"

import { ArrowRight, Chemistry, Compare, DataBase } from "@carbon/icons-react"
import Link from "next/link"

import { Redact, type IconType } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { StatusBadge, formatDuration } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { useMessages } from "@/lib/i18n"
import { useAppStore, useHydrated } from "@/lib/store"

type CardKey = "datasets" | "mask" | "playground" | "lab"

// Shortcuts match the sidebar order (⌘1 is Home).
const CARDS: { key: CardKey; href: string; icon: IconType; shortcut: number }[] = [
  { key: "datasets", href: "/datasets", icon: DataBase, shortcut: 2 },
  { key: "mask", href: "/jobs/new", icon: Redact, shortcut: 3 },
  { key: "playground", href: "/playground", icon: Compare, shortcut: 4 },
  { key: "lab", href: "/lab", icon: Chemistry, shortcut: 5 },
]

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {value === undefined ? <Skeleton className="h-7 w-10" /> : <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>}
    </div>
  )
}

function RecentRuns() {
  const m = useMessages()
  const hydrated = useHydrated()
  const runs = useAppStore((s) => s.runs)
  if (!hydrated) return <Skeleton className="h-40 w-full" />
  if (!runs.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{m.home.noRuns}</p>
        <Button size="sm" variant="outline" asChild>
          <Link href="/datasets">{m.home.loadSamples}</Link>
        </Button>
      </div>
    )
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border">
      {runs.slice(0, 5).map((r) => (
        <li key={r.id}>
          <Link href={`/jobs/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
            <StatusBadge status={r.status} />
            <span className="text-sm font-medium">{m.jobs.runTitle(r.number)}</span>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{r.datasetName}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {r.finishedAt ? formatDuration(r.finishedAt - r.startedAt) : "…"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function HomeScreen() {
  const messages = useMessages()
  const m = messages.home
  const hydrated = useHydrated()
  const datasets = useAppStore((s) => s.datasets.length)
  const runs = useAppStore((s) => s.runs.length)
  const personas = useAppStore((s) => Object.keys(s.personas).length)

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail]} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 py-10">
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">{m.startHere}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CARDS.map(({ key, href, icon: Icon, shortcut }) => (
              <Link
                key={key}
                href={href}
                className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center rounded-lg border bg-background">
                    <Icon className="size-4" />
                  </span>
                  <Kbd>⌘{shortcut}</Kbd>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    {m.cards[key].title}
                    <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </span>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{m.cards[key].body}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold">{messages.sidebar.workspace}</h2>
            <div className="grid grid-cols-3 divide-x rounded-xl border lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
              <Stat label={m.stats.datasets} value={hydrated ? datasets : undefined} />
              <Stat label={m.stats.runs} value={hydrated ? runs : undefined} />
              <Stat label={m.stats.personas} value={hydrated ? personas : undefined} />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{m.recentRuns}</h2>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/jobs">
                  {m.allRuns}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
            <RecentRuns />
          </div>
        </section>
      </main>
    </div>
  )
}
