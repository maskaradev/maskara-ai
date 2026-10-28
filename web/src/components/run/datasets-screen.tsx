"use client"

import { ArrowRight, DataBase, Document } from "@carbon/icons-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { CategoryChip, PageIntro, SampleBanner } from "@/components/run/shared"
import { useMessages } from "@/lib/i18n"
import type { InputSummary } from "@/lib/run-data"

export function DatasetsScreen({ inputs }: { inputs: InputSummary[] }) {
  const messages = useMessages()
  const m = messages.datasets
  const c = messages.common
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail]} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        <SampleBanner />
        <PageIntro title={m.title} description={m.description} />
        <div className="grid gap-3 md:grid-cols-2">
          {inputs.map((inp) => {
            const Icon = inp.kind === "table" ? DataBase : Document
            return (
              <Link
                key={inp.name}
                href={`/datasets/${encodeURIComponent(inp.name)}`}
                className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg border bg-background">
                    <Icon className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1 text-sm font-medium">
                      {inp.name}
                      <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{inp.file ?? c.kinds[inp.kind]}</span>
                  </div>
                  <span className="ml-auto text-right text-xs text-muted-foreground tabular-nums">
                    {inp.kind === "table" ? c.rows(inp.rows) : c.texts(inp.rows)}
                    <br />
                    {c.valuesReplaced(inp.replaced)}
                  </span>
                </div>
                {inp.subject && <p className="text-xs text-muted-foreground">{m.subject(inp.subject)}</p>}
                <div className="flex flex-wrap gap-1">
                  {inp.columns.map((col) => (
                    <span key={col.name} title={col.role}>
                      <CategoryChip
                        category={col.role === "keep" ? null : col.category}
                        label={col.role === "keep" || col.role === col.name ? col.name : `${col.name} · ${col.role}`}
                      />
                    </span>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}
