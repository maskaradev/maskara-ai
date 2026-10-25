"use client"

import { useState } from "react"

import { ITEM_STYLE } from "@/components/agent-panel"
import { HighlightedText } from "@/components/highlighted-text"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMessages } from "@/lib/i18n"
import { SENSITIVE_ROLES } from "@/lib/roles"
import type { ColumnRole, MaskedCell, MaskedTable, Run } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE = 25
const SCHEMA_MARK = "rounded bg-amber-500/20 px-0.5 text-amber-900 dark:text-amber-200"
const PERSONA_MARK = "rounded bg-emerald-500/15 px-0.5 text-emerald-800 dark:text-emerald-200"

type Agent = "identify" | "generate"

function tableStats(table: MaskedTable) {
  let schema = 0
  let spans = 0
  let cells = 0
  let replaced = 0
  for (const row of table.rows) {
    for (const c of table.columns) {
      const cell = row[c]
      if (cell.kind === "value") {
        if (cell.original && SENSITIVE_ROLES.includes(table.roles[c])) schema++
        if (cell.value !== cell.original) replaced++
      } else if (cell.kind === "text" && cell.agent) {
        const n = cell.segments.filter((s) => s.entity).length
        if (cell.agent.status === "identified" || cell.agent.status === "generated") cells++
        spans += n
        if (cell.agent.status === "generated") replaced += n
      }
    }
  }
  return { schema, spans, cells, replaced }
}

function DbCell({ cell, role, agent, showOriginal }: { cell: MaskedCell; role: ColumnRole; agent: Agent; showOriginal: boolean }) {
  const m = useMessages()
  const a = m.agents
  switch (cell.kind) {
    case "value": {
      if (!cell.original) return null
      if (agent === "identify") {
        return SENSITIVE_ROLES.includes(role) ? (
          <mark title={m.roles[role]} className={SCHEMA_MARK}>
            {cell.original}
          </mark>
        ) : (
          <span>{cell.original}</span>
        )
      }
      if (cell.value === cell.original) return <span>{cell.value}</span>
      return (
        <div className="flex flex-col">
          <mark title={m.results.was(m.roles[role], cell.original)} className={PERSONA_MARK}>
            {cell.value}
          </mark>
          {showOriginal && <span className="text-[11px] text-muted-foreground line-through">{cell.original}</span>}
        </div>
      )
    }
    case "text": {
      if (!cell.agent) return <span>{cell.original}</span>
      const { status, error } = cell.agent
      if (agent === "identify" && (status === "identified" || status === "generated")) {
        return <HighlightedText segments={cell.segments} mode="original" className="text-[12.5px]" />
      }
      if (agent === "generate" && status === "generated") {
        return (
          <div className="flex flex-col gap-1.5">
            <HighlightedText segments={cell.segments} mode="masked" className="text-[12.5px]" />
            {showOriginal && (
              <HighlightedText segments={cell.segments} mode="original" className="border-t pt-1.5 text-[11.5px] text-muted-foreground" />
            )}
          </div>
        )
      }
      return (
        <div className="flex flex-col gap-1">
          <span className={cn("self-start rounded px-1 text-[10px] font-semibold", ITEM_STYLE[status], status === "identifying" && "animate-pulse")}>
            {a.item[status]}
          </span>
          {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
          <span className="text-muted-foreground">{cell.original}</span>
        </div>
      )
    }
    case "image":
      return (
        <div className="flex flex-col text-muted-foreground">
          <span className="text-[10px] font-medium uppercase">→ {a.imageLane}</span>
          <span className="truncate text-[11px]">{cell.original.split("/").at(-1)}</span>
        </div>
      )
  }
}

/** Source DB with identified PII (identification agent) or the rewritten DB (generation agent). */
export function DbAgentPanel({ run, agent }: { run: Run; agent: Agent }) {
  const m = useMessages()
  const a = m.agents
  const tables = run.textDb ?? run.output
  const [tab, setTab] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  if (!tables?.length) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{a.dbWaiting}</p>
  }
  const table = tables.find((t) => t.name === tab) ?? tables[0]
  const stats = tableStats(table)
  const generated = run.stages.text_generate.status === "succeeded"
  const wide = (c: string) => table.roles[c] === "free_text" || table.roles[c] === "transcript"

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={table.name}
        onValueChange={(v) => {
          setTab(v)
          setLimit(PAGE)
        }}
      >
        <TabsList variant="line">
          {tables.map((t) => (
            <TabsTrigger key={t.name} value={t.name}>
              {t.name}
              <span className="text-xs text-muted-foreground">{t.rows.length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            {table.name} · {agent === "identify" ? a.dbIdentifiedTitle : a.dbGeneratedTitle}
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            {agent === "identify"
              ? `${a.schemaValues(stats.schema)} · ${a.llmSpans(stats.spans, stats.cells)}`
              : a.replacedValues(stats.replaced)}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {agent === "identify" ? (
            <>
              <span className={SCHEMA_MARK}>{a.legendSchema}</span>
              <span className="rounded bg-red-500/15 px-0.5 text-red-800 dark:text-red-200">{a.legendLlm}</span>
            </>
          ) : (
            generated && (
              <>
                <span className={PERSONA_MARK}>{a.legendPersona}</span>
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <Checkbox checked={showOriginal} onCheckedChange={(v) => setShowOriginal(v === true)} />
                  {a.compareOriginal}
                </label>
              </>
            )
          )}
        </div>
      </div>

      {agent === "generate" && !generated ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{a.dbNotGenerated}</p>
      ) : (
        <div className="max-h-[640px] overflow-auto rounded-lg border">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-muted text-left">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                    {c}
                    <div className="text-[10px] font-normal text-muted-foreground">{m.roles[table.roles[c]]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, limit).map((row, i) => (
                <tr key={i} className="border-t align-top">
                  {table.columns.map((c) => (
                    <td key={c} className={cn("px-3 py-2", wide(c) ? "max-w-[36rem] min-w-[22rem]" : "max-w-56 whitespace-nowrap")}>
                      <DbCell cell={row[c]} role={table.roles[c]} agent={agent} showOriginal={showOriginal} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > limit && (
            <Button variant="ghost" size="sm" className="m-2" onClick={() => setLimit(limit + PAGE)}>
              {m.results.showMore(table.rows.length - limit)}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
