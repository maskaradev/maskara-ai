"use client"

import { AlertTriangle, Hospital, Play } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { loadHospitalSample } from "@/lib/datasets"
import { startRun } from "@/lib/pipeline/run"
import { useMessages } from "@/lib/i18n"
import { ROLES } from "@/lib/roles"
import { useAppStore, useHydrated } from "@/lib/store"
import type { ColumnRole } from "@/lib/types"

const LLM_ROLES: ColumnRole[] = ["free_text", "transcript", "image"]

export function NewJobForm() {
  const requested = useSearchParams().get("dataset")
  const router = useRouter()
  const m = useMessages()
  const t = m.newJob
  const hydrated = useHydrated()
  const { datasets, setColumnRole, upsertDataset } = useAppStore()
  const [datasetId, setDatasetId] = useState<string | null>(requested)
  const dataset = datasets.find((d) => d.id === datasetId) ?? datasets[0]

  const counts = dataset
    ? {
        llmCells: dataset.tables.reduce(
          (n, tbl) => n + tbl.columns.filter((c) => LLM_ROLES.includes(tbl.roles[c])).reduce((sum, c) => sum + tbl.rows.filter((r) => r[c]).length, 0),
          0,
        ),
        rows: dataset.tables.reduce((n, tbl) => n + tbl.rows.length, 0),
      }
    : null

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={t.trail} />
      <main className="flex flex-1 flex-col gap-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>

        {!hydrated ? (
          <Skeleton className="h-64 w-full" />
        ) : !dataset ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground">{t.noDataset}</p>
            <Button onClick={async () => upsertDataset(await loadHospitalSample())}>
              <Hospital />
              {m.datasets.loadSample}
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5 text-sm">
                {t.dataset}
                <Select value={dataset.id} onValueChange={setDatasetId}>
                  <SelectTrigger className="w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {dataset.tables.map((table) => (
                <section key={table.name} className="flex flex-col gap-2 rounded-xl border p-4">
                  <h2 className="text-sm font-semibold">
                    {table.name} <span className="font-normal text-muted-foreground">· {t.rows(table.rows.length)}</span>
                  </h2>
                  <div className="grid gap-x-6 gap-y-1.5 lg:grid-cols-2">
                    {table.columns.map((c) => {
                      const sample = table.rows.find((r) => r[c])?.[c] ?? ""
                      return (
                        <div key={c} className="grid grid-cols-[1fr_210px] items-center gap-3 border-b py-1.5 last:border-0">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium">{c}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{sample}</div>
                          </div>
                          <Select value={table.roles[c]} onValueChange={(v) => setColumnRole(dataset.id, table.name, c, v as ColumnRole)}>
                            <SelectTrigger size="sm" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {m.roles[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>

            <aside className="flex h-fit flex-col gap-4 rounded-xl border p-4 xl:sticky xl:top-4">
              <h2 className="text-sm font-semibold">{t.summary}</h2>
              <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
                <dt className="text-muted-foreground">{t.tables}</dt>
                <dd>{dataset.tables.length}</dd>
                <dt className="text-muted-foreground">{t.rowsLabel}</dt>
                <dd>{counts?.rows}</dd>
                <dt className="text-muted-foreground">{t.llmCells}</dt>
                <dd>{counts?.llmCells}</dd>
              </dl>
              <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[12.5px] text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>{t.warning}</p>
              </div>
              <Button onClick={() => router.push(`/jobs/${startRun(dataset.id)}`)}>
                <Play />
                {t.run}
              </Button>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
