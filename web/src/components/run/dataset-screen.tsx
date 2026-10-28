"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { PageHeader } from "@/components/page-header"
import {
  CategoryChip,
  CategoryLegend,
  MentionTips,
  OriginalsSwitch,
  PageIntro,
  TextCompare,
  type TipInfo,
} from "@/components/run/shared"
import { Button } from "@/components/ui/button"
import { Input as SearchInput } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMessages } from "@/lib/i18n"
import { categoryCounts, categoryStyle, fmt, type Input, type TextDoc } from "@/lib/run"
import type { TableData } from "@/lib/run-data"
import { cn } from "@/lib/utils"

const PAGE = 50

/** `#text-<row>-<column>` opens that text in the Texts tab. */
function textFromHash(): { row: number; column: string } | null {
  const match = /^#text-(\d+)-(.+)$/.exec(window.location.hash)
  return match ? { row: Number(match[1]), column: decodeURIComponent(match[2]) } : null
}

export function DatasetScreen({ input, originals: available, table, texts }: {
  input: Input
  originals: boolean
  table: TableData | null
  texts: TextDoc[]
}) {
  const messages = useMessages()
  const m = messages.datasets
  const c = messages.common
  const [originals, setOriginals] = useState(true)
  const [tab, setTab] = useState(table ? "table" : "texts")
  const [selected, setSelected] = useState(0)
  const showBefore = available && originals

  // Follow links into a text, on load and when the hash changes.
  useEffect(() => {
    const open = () => {
      const target = textFromHash()
      if (!target) return
      const i = texts.findIndex((t) => t.row === target.row && t.column === target.column)
      if (i < 0) return
      setSelected(i)
      setTab("texts")
    }
    open()
    window.addEventListener("hashchange", open)
    return () => window.removeEventListener("hashchange", open)
  }, [texts])

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail, input.name]} back={{ href: "/datasets", label: m.back }} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">
        <PageIntro
          kicker={input.file ?? c.kinds[input.kind]}
          title={input.name}
          description={[
            input.kind === "table" ? c.rows(input.rows) : c.texts(input.rows),
            input.subject ? m.subject(input.subject) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          <OriginalsSwitch checked={originals} onChange={setOriginals} available={available} />
        </PageIntro>

        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          {table && texts.length > 0 && (
            <TabsList>
              <TabsTrigger value="table">{m.table}</TabsTrigger>
              <TabsTrigger value="texts">{m.textsTab(texts.length)}</TabsTrigger>
            </TabsList>
          )}
          {table && (
            <TabsContent value="table" className="flex flex-col gap-3">
              <TableView
                table={table}
                showBefore={showBefore}
                openText={(row, column) => {
                  window.location.hash = `text-${row}-${encodeURIComponent(column)}`
                }}
              />
            </TabsContent>
          )}
          {texts.length > 0 && (
            <TabsContent value="texts">
              <TextsView texts={texts} selected={selected} onSelect={setSelected} showBefore={showBefore} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  )
}

function TableView({ table, showBefore, openText }: {
  table: TableData
  showBefore: boolean
  openText: (row: number, column: string) => void
}) {
  const messages = useMessages()
  const m = messages.datasets
  const [limit, setLimit] = useState(PAGE)
  const { input, after, before, replaced, textCounts } = table

  const tips = useMemo(() => {
    const out: Record<number, TipInfo> = {}
    for (const [k, r] of Object.entries(replaced)) {
      const [row, column] = [Number(k.slice(0, k.indexOf(":"))), k.slice(k.indexOf(":") + 1)]
      const j = input.columns.findIndex((col) => col.name === column)
      out[r.i] = { ...r, original: showBefore && before ? fmt(before[row][j]) : null }
    }
    return out
  }, [replaced, before, input.columns, showBefore])

  const counts = useMemo(() => categoryCounts(Object.values(replaced)), [replaced])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{m.tableHint}</p>
        <CategoryLegend counts={counts} />
      </div>
      <MentionTips tips={tips} className="overflow-x-auto rounded-lg border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="w-10 px-3 py-2 text-right font-mono text-[11px] font-normal text-muted-foreground">#</th>
              {input.columns.map((col) => (
                <th key={col.name} className="px-3 py-2 align-bottom font-medium whitespace-nowrap">
                  <div className="flex flex-col items-start gap-1">
                    {col.name}
                    <CategoryChip category={col.role === "keep" ? null : col.category} label={col.role} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {after.slice(0, limit).map((row, r) => (
              <tr key={r} className="border-t align-top">
                <td className="px-3 py-2 text-right font-mono text-[11px] text-muted-foreground">{r + 1}</td>
                {input.columns.map((col, j) => {
                  const value = fmt(row[j])
                  if (col.role === "text") {
                    const n = textCounts[`${r}:${col.name}`]
                    return (
                      <td key={col.name} className="max-w-80 min-w-60 px-3 py-2">
                        {value && (
                          <button
                            type="button"
                            onClick={() => openText(r, col.name)}
                            className="mr-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium hover:bg-muted"
                          >
                            {m.openText(n ?? 0)}
                          </button>
                        )}
                        <span className="text-muted-foreground">{value.slice(0, 90)}…</span>
                      </td>
                    )
                  }
                  const rep = replaced[`${r}:${col.name}`]
                  if (!rep) {
                    return (
                      <td key={col.name} className="px-3 py-2 whitespace-nowrap">
                        {value}
                      </td>
                    )
                  }
                  return (
                    <td key={col.name} data-m={rep.i} className="cursor-default px-3 py-1.5 whitespace-nowrap [&.mention-hot_.now]:ring-2 [&.mention-hot_.now]:ring-ring">
                      <div className="flex flex-col items-start gap-0.5">
                        {showBefore && before && (
                          <span className="text-[11px] text-muted-foreground line-through decoration-muted-foreground/50">
                            {fmt(before[r][j])}
                          </span>
                        )}
                        <span className={cn("now rounded px-1", categoryStyle(rep.category), !rep.changed && "opacity-60")}>
                          {value}
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {after.length > limit && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" onClick={() => setLimit(Infinity)}>
              {messages.common.showAll(after.length)}
            </Button>
          </div>
        )}
      </MentionTips>
    </>
  )
}

function TextsView({ texts, selected, onSelect, showBefore }: {
  texts: TextDoc[]
  selected: number
  onSelect: (i: number) => void
  showBefore: boolean
}) {
  const messages = useMessages()
  const m = messages.datasets
  const c = messages.common
  const [query, setQuery] = useState("")
  const doc = texts[selected] ?? texts[0]
  const q = query.toLowerCase()
  const shown = texts
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !q || t.after.toLowerCase().includes(q))
  const spans = [...doc.mentions].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-2 lg:sticky lg:top-16 lg:max-h-[calc(100svh-6rem)]">
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={c.filter} aria-label={c.filter} />
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto lg:max-h-none">
          {shown.map(({ t, i }) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted",
                i === selected && "bg-muted",
              )}
            >
              <span className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                #{t.row + 1}
                <span className="tabular-nums">{t.mentions.length}</span>
              </span>
              <span className="line-clamp-2 text-xs">{t.after}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-sm font-medium">{m.textTitle(doc.source, doc.row, doc.column)}</h3>
          <CategoryLegend counts={categoryCounts(doc.mentions)} />
        </div>
        <p className="text-xs text-muted-foreground">{m.textsHint}</p>
        <TextCompare before={doc.before} after={doc.after} mentions={doc.mentions} showBefore={showBefore} />

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                {[c.value, c.category, c.detector, c.persona, c.foundBy].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spans.map((x) => (
                <tr key={x.i} className="border-t">
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
                  <td className="px-3 py-1.5">
                    {x.persona ? (
                      <Link href={`/personas/${x.persona}`} className="underline-offset-2 hover:underline">
                        {x.personaName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{c.none}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.links[x.link] ?? x.link}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
