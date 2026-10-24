"use client"

import { Search } from "lucide-react"
import { useState } from "react"

import { PageHeader } from "@/components/page-header"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useMessages } from "@/lib/i18n"
import { personaAge } from "@/lib/personas"
import { useAppStore, useHydrated } from "@/lib/store"
import type { PersonaKind } from "@/lib/types"
import { cn } from "@/lib/utils"

const KIND_ORDER: PersonaKind[] = ["patient", "relative", "provider", "other"]

const KIND_STYLE: Record<PersonaKind, string> = {
  patient: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  relative: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  provider: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  other: "bg-muted text-muted-foreground",
}

export default function PersonaLibraryPage() {
  const hydrated = useHydrated()
  const personas = useAppStore((s) => s.personas)
  const t = useMessages().personas
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const list = Object.values(personas)
    .filter((p) => `${p.firstName} ${p.lastName} ${p.kind} ${t.kinds[p.kind]} ${p.datasetName}`.toLowerCase().includes(q))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.lastName.localeCompare(b.lastName))

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={t.trail} />
      <main className="flex flex-1 flex-col gap-6 px-6 py-8">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="pl-9" />
        </div>

        {!hydrated ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <section className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">{t.count(list.length)}</span>
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => {
                const age = personaAge(p)
                return (
                  <li key={p.key} className="flex flex-col gap-1 rounded-lg border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {p.kind === "provider" ? "Dr. " : ""}
                        {p.firstName} {p.lastName}
                        {age !== null && <span className="font-normal text-muted-foreground">, {age}</span>}
                      </span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", KIND_STYLE[p.kind])}>{t.kinds[p.kind]}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[p.sex !== "U" ? p.sex : null, p.phone, p.email].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.street} · {t.shifted(`${p.dateOffsetDays > 0 ? "+" : ""}${p.dateOffsetDays}`)} · {p.datasetName}
                    </div>
                  </li>
                )
              })}
              {list.length === 0 && (
                <li className="col-span-full rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                  {q ? t.noMatch(query) : t.empty}
                </li>
              )}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
