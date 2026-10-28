"use client"

import Link from "next/link"
import { useState } from "react"

import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/run/persona-card"
import { CategoryChip, MentionTips, OriginalsSwitch, PageIntro, tipsFor } from "@/components/run/shared"
import { Input as SearchInput } from "@/components/ui/input"
import { useMessages } from "@/lib/i18n"
import type { Mention, Persona } from "@/lib/run"
import { cn } from "@/lib/utils"

const SHOWN = 300

export function PersonasScreen({ personas, selected: p, mentions, originals: available }: {
  personas: Persona[]
  selected: Persona
  mentions: Mention[]
  originals: boolean
}) {
  const messages = useMessages()
  const m = messages.personas
  const c = messages.common
  const [originals, setOriginals] = useState(true)
  const [query, setQuery] = useState("")
  const showBefore = available && originals
  const q = query.toLowerCase()
  const shown = personas.filter(
    (x) => !q || x.name.toLowerCase().includes(q) || (showBefore && x.original?.toLowerCase().includes(q)),
  )
  const facts = [
    ["sex", p.sex],
    ["age", p.age],
    ["email", p.email],
    ["phone", p.phone],
    ["street", p.street],
    ["city", [p.city, p.state, p.zip].filter(Boolean).join(", ")],
    ["occupation", (p.occupation || "").replace(/_/g, " ")],
  ].filter(([, v]) => v != null && v !== "") as [string, string | number][]

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail, p.name]} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">
        <PageIntro title={m.title} description={m.description}>
          <OriginalsSwitch checked={originals} onChange={setOriginals} available={available} />
        </PageIntro>

        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="flex flex-col gap-2 lg:sticky lg:top-16 lg:max-h-[calc(100svh-6rem)]">
            <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={c.filter} aria-label={c.filter} />
            <nav className="flex max-h-80 flex-col gap-0.5 overflow-y-auto lg:max-h-none">
              {shown.map((x) => (
                <Link
                  key={x.id}
                  href={`/personas/${x.id}`}
                  scroll={false}
                  aria-current={x.id === p.id ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-muted",
                    x.id === p.id && "bg-muted",
                  )}
                >
                  <Avatar name={x.name} className="size-7 text-[10px]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{x.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {showBefore && x.original ? <s>{x.original}</s> : [x.sex, x.age, x.state].filter((v) => v != null).join(" · ")}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{x.mentions}</span>
                </Link>
              ))}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <section className="flex flex-col gap-5 rounded-xl border bg-card p-5">
              <div className="flex items-center gap-4">
                <Avatar name={p.name} className="size-14 text-base" />
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-xl font-semibold tracking-tight">{p.name}</h2>
                  {showBefore && p.original && (
                    <span className="text-sm text-muted-foreground">
                      {m.was} <s>{p.original}</s>
                    </span>
                  )}
                </div>
                <span className="ml-auto text-xs text-muted-foreground">{m.mentions(p.mentions)}</span>
              </div>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {facts.map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <dt className="text-[11px] text-muted-foreground">{m.facts[k]}</dt>
                    <dd className="text-[13px] break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="mr-1 text-muted-foreground">{m.seenIn}</span>
                {Object.entries(p.inputs).map(([k, n]) => (
                  <Link key={k} href={`/datasets/${encodeURIComponent(k)}`} className="rounded border px-1.5 py-0.5 font-mono hover:bg-muted">
                    {k} · {n}
                  </Link>
                ))}
              </div>
            </section>

            <MentionTips tips={tipsFor(mentions, showBefore)} className="overflow-x-auto rounded-lg border">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/50 text-left text-xs">
                  <tr>
                    {[c.where, c.value, c.category, c.detector].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mentions.slice(0, SHOWN).map((x) => {
                    const href =
                      x.start != null
                        ? `/datasets/${encodeURIComponent(x.source)}#text-${x.row}-${encodeURIComponent(x.column)}`
                        : `/datasets/${encodeURIComponent(x.source)}`
                    return (
                      <tr key={x.i} data-m={x.i} className="border-t [&.mention-hot]:bg-muted/60">
                        <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                          <Link href={href} className="underline-offset-2 hover:underline">
                            {x.source}.{x.column} #{x.row + 1}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5">
                          {showBefore && x.original != null && (
                            <>
                              <s className="text-muted-foreground">{x.original}</s>
                              <span className="text-muted-foreground"> → </span>
                            </>
                          )}
                          {x.replacement}
                        </td>
                        <td className="px-3 py-1.5">
                          <CategoryChip category={x.category} label={`${x.category.toLowerCase()} · ${x.label}`} />
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">{x.detector}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </MentionTips>
            {mentions.length > SHOWN && <p className="text-xs text-muted-foreground">{m.firstOf(SHOWN, mentions.length)}</p>}
          </div>
        </div>
      </main>
    </div>
  )
}
