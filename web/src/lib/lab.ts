import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import { cellValue } from "@/lib/analysis"
import type { MaskedTable } from "@/lib/types"

// Lab: chat with Claude over a run's masked output. Claude writes JavaScript, which runs here in a
// Web Worker against the masked values only; Claude sees the schema, a few sample rows and the results.

type LabRow = Record<string, string>
export type LabTables = Record<string, LabRow[]>

/** One line of the /api/lab response stream. */
export type LabEvent =
  | { type: "text"; index: number; text: string }
  | { type: "tool"; index: number; name: string }
  | { type: "input"; index: number; json: string }
  /** The turn is being re-issued; drop what has streamed so far. */
  | { type: "retry" }
  | { type: "done"; content: Anthropic.Beta.BetaContentBlock[]; stopReason: Anthropic.Beta.BetaStopReason | null }
  | { type: "error"; error: string }

export const RunJsInput = z.object({ title: z.string(), code: z.string().min(1) })

export type ToolRun = {
  ok: boolean
  /** Full result for display (tables are not truncated). */
  result?: unknown
  logs: string[]
  error?: string
  saved: string[]
  ms: number
}

const SKIP_ROLES = new Set(["image", "audio"])
const TIMEOUT_MS = 10_000
const MAX_RESULT_CHARS = 10_000
const SAMPLE_ROWS = 3

/** The masked side of a run's output as plain string rows. Image and audio paths are left out. */
export function maskedTables(output: MaskedTable[]): LabTables {
  return Object.fromEntries(
    output.map((t) => {
      const columns = t.columns.filter((c) => !SKIP_ROLES.has(t.roles[c]))
      return [t.name, t.rows.map((r) => Object.fromEntries(columns.map((c) => [c, cellValue(r[c], "masked")])))]
    }),
  )
}

export function schemaOf(output: MaskedTable[], tables: LabTables) {
  return output.map((t) => ({
    name: t.name,
    rowCount: t.rows.length,
    columns: t.columns.filter((c) => !SKIP_ROLES.has(t.roles[c])).map((c) => ({ name: c, role: t.roles[c] })),
    samples: tables[t.name].slice(0, SAMPLE_ROWS),
  }))
}

/** A result shown as a table: a non-empty array of plain objects. */
export function asRows(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value.every((r) => r !== null && typeof r === "object" && !Array.isArray(r)) ? (value as Record<string, unknown>[]) : null
}

export function columnsOf(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>()
  for (const r of rows.slice(0, 500)) for (const k of Object.keys(r)) seen.add(k)
  return [...seen]
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)
  return typeof v === "object" ? JSON.stringify(v) : String(v)
}

/** What Claude gets back from a run: logs, saved tables and the result, cut to a size that fits the context. */
export function toolResultText(run: ToolRun): string {
  const parts: string[] = []
  if (run.logs.length) parts.push(`console:\n${run.logs.join("\n")}`)
  if (run.saved.length) parts.push(`saved: ${run.saved.join(", ")}`)
  if (run.ok) {
    const rows = asRows(run.result)
    const json = run.result === undefined ? "undefined" : JSON.stringify(run.result, null, rows ? undefined : 2)
    const note = rows ? ` (${rows.length} rows)` : ""
    parts.push(`result${note}:\n${json}`)
  } else {
    parts.push(`error:\n${run.error}`)
  }
  const text = parts.join("\n\n")
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (cut off at ${MAX_RESULT_CHARS} characters of ${text.length})` : text
}

// Runs in the worker. Network APIs are removed before the code runs; the worker is discarded afterwards.
const WORKER_SOURCE = `
for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "BroadcastChannel"]) {
  try { self[k] = undefined } catch {}
}
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : typeof x === "bigint" ? String(x) : x) ?? "null")
const fmt = (v) => { if (typeof v === "string") return v; try { return JSON.stringify(plain(v)) } catch { return String(v) } }
self.onmessage = async (e) => {
  const { code, tables } = e.data
  const logs = []
  const saved = {}
  const log = (...a) => { if (logs.length < 200) logs.push(a.map(fmt).join(" ")) }
  const console = { log, info: log, warn: log, error: log, table: log }
  const save = (name, rows) => {
    if (typeof name !== "string" || !name.trim()) throw new Error("save(name, rows): name must be a non-empty string")
    if (!Array.isArray(rows)) throw new Error("save(name, rows): rows must be an array of objects")
    const clean = plain(rows)
    saved[name] = clean
    tables[name] = clean
    return "saved " + clean.length + " rows as " + name
  }
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const result = await new AsyncFunction("tables", "save", "console", code)(tables, save, console)
    self.postMessage({ ok: true, result: result === undefined ? undefined : plain(result), logs, saved })
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.stack ? String(err.stack).split("\\n").slice(0, 4).join("\\n") : String(err), logs, saved })
  }
}
`

let workerUrl: string | null = null

/** Runs Claude's code against the tables. Resolves with the run and any tables it saved. */
export function runJs(code: string, tables: LabTables): Promise<{ run: ToolRun; saved: LabTables }> {
  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }))
  const worker = new Worker(workerUrl)
  const started = performance.now()
  return new Promise((resolve) => {
    const finish = (run: Omit<ToolRun, "ms" | "saved">, saved: LabTables) => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ run: { ...run, saved: Object.keys(saved), ms: Math.round(performance.now() - started) }, saved })
    }
    const timer = setTimeout(() => finish({ ok: false, error: `Timed out after ${TIMEOUT_MS / 1000} s.`, logs: [] }, {}), TIMEOUT_MS)
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: unknown; error?: string; logs: string[]; saved: LabTables }>) =>
      finish({ ok: e.data.ok, result: e.data.result, error: e.data.error, logs: e.data.logs }, e.data.saved)
    worker.onerror = (e) => {
      e.preventDefault()
      finish({ ok: false, error: e.message || "The code could not run.", logs: [] }, {})
    }
    worker.postMessage({ code, tables })
  })
}

/** Reads the NDJSON stream from /api/lab. */
export async function* readLabStream(response: Response): AsyncGenerator<LabEvent> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as LabEvent
  }
  if (buffer.trim()) yield JSON.parse(buffer) as LabEvent
}
