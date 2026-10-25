"use client"

import type Anthropic from "@anthropic-ai/sdk"
import { Add, ArrowUp, ChevronRight, CircleDash, DataTable, Download, Security, StopFilledAlt } from "@carbon/icons-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { create } from "zustand"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { downloadCsv } from "@/lib/datasets"
import { useMessages } from "@/lib/i18n"
import {
  RunJsInput,
  asRows,
  columnsOf,
  formatValue,
  maskedTables,
  readLabStream,
  runJs,
  schemaOf,
  toolResultText,
  type LabTables,
  type ToolRun,
} from "@/lib/lab"
import { useAppStore, useHydrated } from "@/lib/store"
import type { MaskedTable, Run } from "@/lib/types"
import { cn } from "@/lib/utils"

type MessageParam = Anthropic.Beta.BetaMessageParam
type ContentBlock = Anthropic.Beta.BetaContentBlock

/** Claude's tool calls per user message before the Lab stops and waits for the user. */
const MAX_STEPS = 16
const MAX_TABLE_ROWS = 100

type Thread = { history: MessageParam[]; runs: Record<string, ToolRun>; saved: LabTables }
const EMPTY_THREAD: Thread = { history: [], runs: {}, saved: {} }

// Chats live in memory per run: they survive navigating around the app but not a reload,
// which keeps derived tables out of the localStorage quota.
const useLabStore = create<{ threads: Record<string, Thread>; set: (runId: string, thread: Thread) => void }>()((set) => ({
  threads: {},
  set: (runId, thread) => set((s) => ({ threads: { ...s.threads, [runId]: thread } })),
}))

/** The assistant turn being streamed, keyed by content block index. */
type LiveBlock = { kind: "text"; text: string } | { kind: "tool"; json: string }

function downloadRows(name: string, rows: Record<string, unknown>[]) {
  const columns = columnsOf(rows)
  downloadCsv(name, columns, rows.map((r) => Object.fromEntries(columns.map((c) => [c, formatValue(r[c])]))))
}

/** Best-effort read of a tool input that is still streaming. */
function partialInput(json: string): { title?: string; code?: string } {
  const field = (key: string) => {
    const m = json.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)("?)`))
    if (!m) return undefined
    const raw = m[1].replace(/\\(u[0-9a-fA-F]{0,3})?$/, "")
    try {
      return JSON.parse(`"${raw}"`) as string
    } catch {
      return raw
    }
  }
  return { title: field("title"), code: field("code") }
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i} className="font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
      <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">
        {p.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  )
}

/** The light markdown the system prompt allows: paragraphs, headings, lists, code blocks, bold and code. */
function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]
    if (line.startsWith("```")) {
      const body: string[] = []
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i])
      i++
      blocks.push(
        <pre key={blocks.length} className="overflow-x-auto rounded-lg bg-muted/60 p-3 font-mono text-[12px] leading-relaxed">
          {body.join("\n")}
        </pre>,
      )
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""))
      const List = ordered ? "ol" : "ul"
      blocks.push(
        <List key={blocks.length} className={cn("flex flex-col gap-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
          {items.map((item, j) => (
            <li key={j}>
              <Inline text={item} />
            </li>
          ))}
        </List>,
      )
    } else if (/^#{1,4}\s/.test(line)) {
      blocks.push(
        <p key={blocks.length} className="font-semibold">
          <Inline text={line.replace(/^#+\s/, "")} />
        </p>,
      )
      i++
    } else if (line.trim()) {
      const para: string[] = []
      for (; i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*([-*]|\d+\.)\s+)/.test(lines[i]); i++) para.push(lines[i])
      blocks.push(
        <p key={blocks.length}>
          <Inline text={para.join(" ")} />
        </p>,
      )
    } else {
      i++
    }
  }
  return <div className="flex flex-col gap-2.5 text-sm leading-relaxed">{blocks}</div>
}

function ResultTable({ rows, name }: { rows: Record<string, unknown>[]; name: string }) {
  const l = useMessages().lab
  const columns = useMemo(() => columnsOf(rows), [rows])
  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-auto rounded-lg border" style={{ maxHeight: 360 }}>
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX_TABLE_ROWS).map((r, i) => (
              <tr key={i} className="border-t">
                {columns.map((c) => (
                  <td key={c} className={cn("max-w-72 truncate px-2.5 py-1 whitespace-nowrap", typeof r[c] === "number" && "text-right tabular-nums")}>
                    {formatValue(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground tabular-nums">{l.rowsShown(Math.min(rows.length, MAX_TABLE_ROWS), rows.length)}</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => downloadRows(name, rows)}>
          <Download />
          {l.csv}
        </Button>
      </div>
    </div>
  )
}

function ToolCard({ title, code, run, live }: { title?: string; code?: string; run?: ToolRun; live?: "writing" | "running" }) {
  const l = useMessages().lab
  const [open, setOpen] = useState(false)
  const rows = run?.ok ? asRows(run.result) : null
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-left text-xs text-muted-foreground">
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", (open || live === "writing") && "rotate-90")} />
        <span className="truncate font-medium text-foreground">{title || l.code}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {live ? (
            <span className="flex items-center gap-1.5">
              <CircleDash className="size-3 animate-spin" />
              {live === "writing" ? l.writing : l.running}
            </span>
          ) : run ? (
            run.ok ? l.ms(run.ms) : <span className="text-red-600 dark:text-red-400">{l.failed}</span>
          ) : null}
        </span>
      </button>
      {(open || live === "writing") && code && (
        <pre className="max-h-80 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[12px] leading-relaxed">{code}</pre>
      )}
      {run && run.logs.length > 0 && (
        <pre className="max-h-40 overflow-auto rounded-lg border border-dashed p-2 font-mono text-[11.5px] text-muted-foreground">{run.logs.join("\n")}</pre>
      )}
      {run && !run.ok && (
        <pre className="overflow-x-auto rounded-lg bg-red-500/5 p-2 font-mono text-[11.5px] text-red-700 dark:text-red-300">{run.error}</pre>
      )}
      {rows ? (
        <ResultTable rows={rows} name={(title || "result").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()} />
      ) : run?.ok && run.result !== undefined ? (
        <pre className="max-h-80 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[12px]">
          {typeof run.result === "string" ? run.result : JSON.stringify(run.result, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

function AssistantContent({ content, runs, running }: { content: ContentBlock[]; runs: Record<string, ToolRun>; running: string | null }) {
  return content.map((block, i) => {
    if (block.type === "text") return block.text.trim() ? <Markdown key={i} text={block.text} /> : null
    if (block.type === "tool_use") {
      const input = RunJsInput.safeParse(block.input)
      return (
        <ToolCard
          key={block.id}
          title={input.success ? input.data.title : undefined}
          code={input.success ? input.data.code : JSON.stringify(block.input)}
          run={runs[block.id]}
          live={running === block.id ? "running" : undefined}
        />
      )
    }
    return null
  })
}

function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const l = useMessages().lab
  const [text, setText] = useState("")
  const submit = () => {
    if (busy || !text.trim()) return
    onSend(text.trim())
    setText("")
  }
  return (
    <div className="sticky bottom-0 bg-background pt-2 pb-5">
      <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // isComposing: Enter also confirms a Korean/Japanese IME composition.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder={l.placeholder}
          className="field-sizing-content max-h-48 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        {busy ? (
          <Button size="icon" variant="outline" className="size-9 rounded-xl" aria-label={l.stop} onClick={onStop}>
            <StopFilledAlt className="size-3.5" />
          </Button>
        ) : (
          <Button size="icon" className="size-9 rounded-xl" aria-label={l.send} disabled={!text.trim()} onClick={submit}>
            <ArrowUp />
          </Button>
        )}
      </div>
    </div>
  )
}

function TablesPanel({ output, saved, onNewChat, canReset }: { output: MaskedTable[]; saved: LabTables; onNewChat: () => void; canReset: boolean }) {
  const l = useMessages().lab
  const savedNames = Object.keys(saved)
  return (
    <aside className="flex flex-col gap-5 lg:sticky lg:top-18 lg:self-start">
      <Button variant="outline" size="sm" className="self-start" disabled={!canReset} onClick={onNewChat}>
        <Add />
        {l.newChat}
      </Button>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{l.tables}</h3>
        <ul className="flex flex-col gap-1">
          {output.map((t) => (
            <li key={t.name} className="flex items-center gap-2 text-[13px]">
              <DataTable className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-[12.5px]">{t.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">{t.rows.length}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{l.saved}</h3>
        {savedNames.length === 0 ? (
          <p className="text-xs text-muted-foreground">{l.noSaved}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {savedNames.map((name) => (
              <li key={name} className="flex items-center gap-2 text-[13px]">
                <DataTable className="size-3.5 shrink-0 text-primary" />
                <span className="truncate font-mono text-[12.5px]">{name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">{saved[name].length}</span>
                <Button size="icon" variant="ghost" className="size-6" aria-label={`${l.csv} ${name}`} onClick={() => downloadRows(name, saved[name])}>
                  <Download className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Security className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {l.privacy}
      </p>
    </aside>
  )
}

function Lab({ run }: { run: Run & { output: MaskedTable[] } }) {
  const router = useRouter()
  const m = useMessages()
  const l = m.lab
  const runs = useAppStore((s) => s.runs).filter((r) => r.output)
  const thread = useLabStore((s) => s.threads[run.id]) ?? EMPTY_THREAD
  const setThread = useLabStore((s) => s.set)
  const tables = useMemo(() => maskedTables(run.output), [run.output])
  const schema = useMemo(() => schemaOf(run.output, tables), [run.output, tables])

  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState<Record<number, LiveBlock> | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (busy) endRef.current?.scrollIntoView({ block: "end" })
  }, [busy, live, running, thread.history.length])

  /** Streams one assistant turn; resolves with the final content, or null if it was stopped. */
  async function streamTurn(history: MessageParam[], signal: AbortSignal) {
    const response = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables: schema, messages: history }),
      signal,
    })
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.error ?? `Request failed (${response.status}).`)
    }
    let blocks: Record<number, LiveBlock> = {}
    setLive(blocks)
    for await (const event of readLabStream(response)) {
      if (event.type === "text") {
        const prev = blocks[event.index]
        blocks = { ...blocks, [event.index]: { kind: "text", text: (prev?.kind === "text" ? prev.text : "") + event.text } }
      } else if (event.type === "tool") {
        blocks = { ...blocks, [event.index]: { kind: "tool", json: "" } }
      } else if (event.type === "input") {
        const prev = blocks[event.index]
        blocks = { ...blocks, [event.index]: { kind: "tool", json: (prev?.kind === "tool" ? prev.json : "") + event.json } }
      } else if (event.type === "retry") {
        blocks = {}
      } else if (event.type === "error") {
        throw new Error(event.error)
      } else if (event.type === "done") {
        return { content: event.content, stopReason: event.stopReason }
      }
      setLive(blocks)
    }
    if (signal.aborted) return null
    throw new Error("The response ended early.")
  }

  async function send(text: string) {
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    let next: Thread = { ...thread, history: [...thread.history, { role: "user", content: text }] }
    setThread(run.id, next)
    try {
      for (let step = 0; ; step++) {
        if (step === MAX_STEPS) {
          setError(l.stepLimit)
          break
        }
        const turn = await streamTurn(next.history, controller.signal)
        setLive(null)
        if (!turn) break
        if (turn.stopReason === "refusal") {
          // A refused turn can end mid-tool-call, so it's left out of the history.
          setError(l.refused)
          break
        }
        next = { ...next, history: [...next.history, { role: "assistant", content: turn.content }] }
        setThread(run.id, next)

        const uses = turn.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
        if (uses.length === 0) {
          if (turn.stopReason === "max_tokens") setError(l.truncated)
          break
        }
        // Every tool_use gets a result, in one user message, so the history stays valid even when nothing ran.
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
        for (const use of uses) {
          const input = RunJsInput.safeParse(use.input)
          if (turn.stopReason === "max_tokens") {
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: "The tool input was cut off by max_tokens, so it did not run. Write shorter code." })
          } else if (!input.success) {
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: JSON.stringify({ INVALID_JSON: JSON.stringify(use.input) }) })
          } else {
            setRunning(use.id)
            const { run: result, saved } = await runJs(input.data.code, { ...tables, ...next.saved })
            next = { ...next, runs: { ...next.runs, [use.id]: result }, saved: { ...next.saved, ...saved } }
            setThread(run.id, next)
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: !result.ok, content: toolResultText(result) })
          }
        }
        setRunning(null)
        next = { ...next, history: [...next.history, { role: "user", content: results }] }
        setThread(run.id, next)
        if (controller.signal.aborted) break
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setLive(null)
      setRunning(null)
      abortRef.current = null
    }
  }

  const lastAssistant = thread.history.findLastIndex((h) => h.role === "assistant")
  const liveBlocks = live ? Object.entries(live).sort(([a], [b]) => Number(a) - Number(b)) : []
  const waiting = busy && !running && liveBlocks.every(([, b]) => b.kind === "text" && !b.text.trim())

  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col">
        <label className="mb-6 flex flex-col gap-1 text-xs text-muted-foreground">
          {l.run}
          <Select value={run.id} onValueChange={(id) => router.push(`/lab/${id}`)}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {runs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  #{r.number} · {r.datasetName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="flex flex-1 flex-col gap-5">
          {thread.history.length === 0 && (
            <div className="flex flex-col gap-4 py-6">
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{l.intro}</p>
              <div className="flex flex-wrap gap-2">
                {l.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => send(s)}
                    className="rounded-full border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.history.map((msg, i) =>
            msg.role === "user" ? (
              typeof msg.content === "string" ? (
                <div key={i} className="max-w-[85%] self-end rounded-2xl bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">
                  {msg.content}
                </div>
              ) : null
            ) : (
              <div key={i} className="flex flex-col gap-3">
                <AssistantContent content={msg.content as ContentBlock[]} runs={thread.runs} running={i === lastAssistant ? running : null} />
              </div>
            ),
          )}

          {liveBlocks.length > 0 && (
            <div className="flex flex-col gap-3">
              {liveBlocks.map(([index, block]) => {
                if (block.kind === "text") return block.text.trim() ? <Markdown key={index} text={block.text} /> : null
                const input = partialInput(block.json)
                return <ToolCard key={index} title={input.title} code={input.code} live="writing" />
              })}
            </div>
          )}

          {waiting && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleDash className="size-3.5 animate-spin" />
              {l.thinking}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>
          )}
          <div ref={endRef} />
        </div>

        <Composer busy={busy} onSend={send} onStop={() => abortRef.current?.abort()} />
      </div>

      <TablesPanel
        output={run.output}
        saved={thread.saved}
        canReset={!busy && thread.history.length > 0}
        onNewChat={() => {
          setError(null)
          setThread(run.id, EMPTY_THREAD)
        }}
      />
    </div>
  )
}

export function LabScreen({ runId }: { runId?: string }) {
  const hydrated = useHydrated()
  const runs = useAppStore((s) => s.runs)
  const m = useMessages()
  const run = runId ? runs.find((r) => r.id === runId) : runs.find((r) => r.output)

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.lab.trail, ...(run ? [m.jobs.runShort(run.number)] : [])]} />
      <main className="flex flex-1 flex-col px-6 pt-6">
        {!hydrated ? (
          <Skeleton className="h-96 w-full" />
        ) : run?.output ? (
          <Lab key={run.id} run={run as Run & { output: MaskedTable[] }} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground">{m.lab.empty}</p>
            <Button asChild variant="outline">
              <Link href="/jobs">{m.sidebar.mask}</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
