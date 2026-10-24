"use client"

import { Download } from "lucide-react"
import { useState } from "react"

import { HighlightedText } from "@/components/highlighted-text"
import { ImageCanvas } from "@/components/image-canvas"
import { MaskedVoiceButton } from "@/components/masked-voice-button"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toCsv } from "@/lib/datasets"
import { useMessages } from "@/lib/i18n"
import { segmentsToText } from "@/lib/mask"
import type { ImageItem, MaskedCell, MaskedTable, Run, Segment } from "@/lib/types"

const RICH = new Set(["free_text", "transcript", "image", "audio"])
const PAGE = 25

function exportValue(cell: MaskedCell): string {
  switch (cell.kind) {
    case "value":
      return cell.value
    case "text":
      return segmentsToText(cell.segments)
    case "image":
      return "[masked image]"
    case "audio":
      return "[masked audio]"
  }
}

function downloadCsv(table: MaskedTable) {
  const rows = table.rows.map((r) => Object.fromEntries(table.columns.map((c) => [c, exportValue(r[c])])))
  const blob = new Blob([toCsv(table.columns, rows)], { type: "text/csv" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${table.name}.masked.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function ValueCell({ cell }: { cell: MaskedCell }) {
  if (cell.kind !== "value") return null
  const changed = cell.value !== cell.original
  return (
    <div className="flex flex-col">
      <span className={changed ? "font-medium" : undefined}>{cell.value}</span>
      {changed && <span className="text-[11px] text-muted-foreground line-through">{cell.original}</span>}
    </div>
  )
}

function StructuredTable({ table }: { table: MaskedTable }) {
  const messages = useMessages()
  const m = messages.results
  const roleLabels = messages.roles
  const [limit, setLimit] = useState(PAGE)
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/50 text-left">
          <tr>
            {table.columns.map((c) => (
              <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                {c}
                <div className="text-[10px] font-normal text-muted-foreground">{roleLabels[table.roles[c]]}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.slice(0, limit).map((row, i) => (
            <tr key={i} className="border-t align-top">
              {table.columns.map((c) => (
                <td key={c} className="px-3 py-2 whitespace-nowrap">
                  <ValueCell cell={row[c]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length > limit && (
        <Button variant="ghost" size="sm" className="m-2" onClick={() => setLimit(limit + PAGE)}>
          {m.showMore(table.rows.length - limit)}
        </Button>
      )}
    </div>
  )
}

function Compare({ label, original, masked }: { label: string; original: React.ReactNode; masked: React.ReactNode }) {
  const m = useMessages().results
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
          <div className="mb-1.5 text-[10px] font-semibold text-red-700 uppercase dark:text-red-300">{m.original}</div>
          {original}
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
          <div className="mb-1.5 text-[10px] font-semibold text-emerald-700 uppercase dark:text-emerald-300">{m.masked}</div>
          {masked}
        </div>
      </div>
    </div>
  )
}

function OcrText({ segments, mode }: { segments: Segment[]; mode: "masked" | "original" }) {
  const m = useMessages().results
  if (!segments?.length) return null
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">{m.ocrText}</summary>
      <HighlightedText segments={segments} mode={mode} className="mt-1 font-mono text-[11.5px]" />
    </details>
  )
}

function RecordCards({ table, images }: { table: MaskedTable; images: ImageItem[] }) {
  const m = useMessages().results
  const [limit, setLimit] = useState(10)
  const simple = table.columns.filter((c) => !RICH.has(table.roles[c]))
  const hasAudio = table.columns.some((c) => table.roles[c] === "audio")
  const rich = table.columns.filter((c) => RICH.has(table.roles[c]) && !(hasAudio && table.roles[c] === "transcript"))

  return (
    <div className="flex flex-col gap-4">
      {table.rows.slice(0, limit).map((row, i) => (
        <article key={i} className="flex flex-col gap-4 rounded-xl border p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            {simple.map((c) => (
              <div key={c} className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">{c}</span>
                <ValueCell cell={row[c]} />
              </div>
            ))}
          </div>
          {rich.map((c) => {
            const cell = row[c]
            if (cell.kind === "text") {
              return (
                <Compare
                  key={c}
                  label={c}
                  original={<HighlightedText segments={cell.segments} mode="original" />}
                  masked={<HighlightedText segments={cell.segments} mode="masked" />}
                />
              )
            }
            if (cell.kind === "image") {
              // A PDF cell spans one item per page.
              const items = images.slice(cell.item, cell.item + (cell.pages ?? 1))
              const isDoc = items[0]?.kind === "document"
              return (
                <Compare
                  key={c}
                  label={`${c} · ${m.regions(items.reduce((n, item) => n + item.regions.length, 0))}`}
                  original={
                    <div className="flex flex-col gap-2">
                      {isDoc ? (
                        items.map((item) => <ImageCanvas key={item.id} item={item} mode="original" />)
                      ) : (
                        <a href={cell.original} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={cell.original} alt="Original" className="w-full rounded border bg-white" />
                        </a>
                      )}
                      {items.length > 0 && <OcrText segments={items.flatMap((item) => item.ocr)} mode="original" />}
                    </div>
                  }
                  masked={
                    items.length && items.every((item) => item.status === "generated") ? (
                      <div className="flex flex-col gap-2">
                        {items.map((item) => (
                          <ImageCanvas key={item.id} item={item} mode="generate" />
                        ))}
                        <OcrText segments={items.flatMap((item) => item.ocr)} mode="masked" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{m.notProcessed}</span>
                    )
                  }
                />
              )
            }
            if (cell.kind === "audio") {
              return (
                <Compare
                  key={c}
                  label={`${c} · ${m.speech}`}
                  original={
                    <div className="flex flex-col gap-2">
                      <audio controls src={cell.original} className="h-8 w-full" />
                      <HighlightedText segments={cell.transcript} mode="original" />
                    </div>
                  }
                  masked={
                    <div className="flex flex-col gap-2">
                      <MaskedVoiceButton script={segmentsToText(cell.transcript)} />
                      <HighlightedText segments={cell.transcript} mode="masked" />
                    </div>
                  }
                />
              )
            }
            return null
          })}
        </article>
      ))}
      {table.rows.length > limit && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setLimit(limit + 10)}>
          {m.showMore(table.rows.length - limit)}
        </Button>
      )}
    </div>
  )
}

export function ResultsView({ run }: { run: Run }) {
  const m = useMessages().results
  if (!run.output) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {run.status === "running" ? m.pendingRunning : run.status === "failed" ? m.pendingFailed : m.pendingDropped}
      </p>
    )
  }
  return (
    <Tabs defaultValue={run.output[0]?.name}>
      <TabsList variant="line">
        {run.output.map((t) => (
          <TabsTrigger key={t.name} value={t.name}>
            {t.name}
            <span className="text-xs text-muted-foreground">{t.rows.length}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {run.output.map((t) => (
        <TabsContent key={t.name} value={t.name} className="flex flex-col gap-3 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {m.legendPrefix} <span className="rounded bg-red-500/15 px-1">{m.legendDetected}</span> →{" "}
              <span className="rounded bg-emerald-500/15 px-1">{m.legendPersona}</span>. {m.legendSuffix}
            </p>
            <Button size="sm" variant="outline" onClick={() => downloadCsv(t)}>
              <Download />
              {m.maskedCsv}
            </Button>
          </div>
          {t.columns.some((c) => RICH.has(t.roles[c])) ? <RecordCards table={t} images={run.images ?? []} /> : <StructuredTable table={t} />}
        </TabsContent>
      ))}
    </Tabs>
  )
}
