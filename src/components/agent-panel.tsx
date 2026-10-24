"use client"

import { Download } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { ImageCanvas } from "@/components/image-canvas"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useMessages } from "@/lib/i18n"
import type { ImageItem, ImageItemStatus, Run } from "@/lib/types"
import { cn } from "@/lib/utils"

const ITEM_STYLE: Record<ImageItemStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  identifying: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  identified: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  generated: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
}

function ready(item: ImageItem, agent: "identify" | "generate") {
  return agent === "identify" ? item.status === "identified" || item.status === "generated" : item.status === "generated"
}

/** Image list + per-image viewer for the identification and generation agents. */
export function AgentPanel({ run, agent }: { run: Run; agent: "identify" | "generate" }) {
  const m = useMessages()
  const a = m.agents
  const images = run.images ?? []
  const [selected, setSelected] = useState(0)
  const [showWords, setShowWords] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onCanvas = useCallback((c: HTMLCanvasElement) => (canvasRef.current = c), [])

  if (!images.length) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{a.waiting}</p>
  }
  const item = images[Math.min(selected, images.length - 1)]
  const firstRegions = item.regions.filter((r) => r.first)

  function download() {
    const url = canvasRef.current?.toDataURL("image/png")
    if (!url) return
    const link = document.createElement("a")
    link.href = url
    link.download = `${item.id}.masked.png`
    link.click()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold">{a.images(images.length)}</div>
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {images.map((img, i) => (
            <li key={img.id} className="w-48 shrink-0 lg:w-auto">
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "flex w-full cursor-pointer gap-2.5 rounded-lg border p-2 text-left transition-colors hover:bg-muted",
                  i === selected && "border-foreground/25 bg-muted",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt="" className="h-10 w-14 shrink-0 rounded border bg-white object-cover object-left-top" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{img.id}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{img.column}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={cn("rounded px-1 text-[10px] font-semibold", ITEM_STYLE[img.status])}>{a.item[img.status]}</span>
                    {img.status !== "pending" && img.status !== "identifying" && (
                      <span className="text-[10.5px] text-muted-foreground">{a.pii(img.regions.filter((r) => r.first).length)}</span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">
              {item.id} · {agent === "identify" ? a.identifiedTitle : a.generatedTitle}
            </div>
            {ready(item, "identify") && (
              <div className="text-[11.5px] text-muted-foreground">
                {a.words(item.words.length)} · {a.pii(firstRegions.length)}
              </div>
            )}
          </div>
          {ready(item, agent) && (
            <div className="flex items-center gap-3">
              {agent === "identify" ? (
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={showWords} onCheckedChange={(v) => setShowWords(v === true)} />
                  {a.showWords}
                </label>
              ) : (
                <>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox checked={showOriginal} onCheckedChange={(v) => setShowOriginal(v === true)} />
                    {a.compareOriginal}
                  </label>
                  <Button size="sm" variant="outline" onClick={download}>
                    <Download />
                    {a.download}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {ready(item, agent) ? (
          <>
            {agent === "generate" && showOriginal ? (
              <div className="grid gap-2 xl:grid-cols-2">
                <ImageCanvas item={item} mode="original" />
                <ImageCanvas item={item} mode="generate" onCanvas={onCanvas} />
              </div>
            ) : (
              <ImageCanvas item={item} mode={agent} showWords={showWords} onCanvas={onCanvas} />
            )}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-[12.5px]">
                <thead className="bg-muted/50 text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">{a.type}</th>
                    <th className="px-3 py-1.5 font-medium">{agent === "identify" ? a.recognized : a.original}</th>
                    {agent === "generate" && <th className="px-3 py-1.5 font-medium">{a.replacement}</th>}
                  </tr>
                </thead>
                <tbody>
                  {firstRegions.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{r.type}</td>
                      <td className={cn("px-3 py-1.5", agent === "generate" && "text-muted-foreground line-through")}>{r.original}</td>
                      {agent === "generate" && <td className="px-3 py-1.5 font-medium">{r.replacement}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.src} alt="" className="w-full rounded border bg-white opacity-50" />
            <p className={cn("text-xs text-muted-foreground", item.status === "failed" && "text-red-600 dark:text-red-400")}>
              {item.status === "failed" ? item.error : agent === "identify" ? a.notIdentified : a.notGenerated}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
