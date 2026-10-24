"use client"

import { Download } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { ImageCanvas } from "@/components/image-canvas"
import { LiveCanvas, PHASE_DOT, PHASES, phaseOf, type Phase } from "@/components/live-canvas"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMessages } from "@/lib/i18n"
import type { ImageItem, ImageItemStatus, MediaKind, Run } from "@/lib/types"
import { cn } from "@/lib/utils"

export const ITEM_STYLE: Record<ImageItemStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  identifying: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  identified: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  generated: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
}

function ready(item: ImageItem, agent: "identify" | "generate") {
  return agent === "identify" ? item.status === "identified" || item.status === "generated" : item.status === "generated"
}

/** Item list + viewer for the identification and generation agents of the photo or the document (PDF) lane. */
export function AgentPanel({ run, agent, lane }: { run: Run; agent: "identify" | "generate"; lane: MediaKind }) {
  const m = useMessages()
  const a = m.agents
  const images = (run.images ?? []).filter((img) => img.kind === lane)
  const [selected, setSelected] = useState(0)
  // A picked phase tab (null follows the item); `shown` is what the canvas is on, mid-animation too.
  const [pick, setPick] = useState<Phase | null>(null)
  const [shown, setShown] = useState<Phase>("original")
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onCanvas = useCallback((c: HTMLCanvasElement) => (canvasRef.current = c), [])

  if (!images.length) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{lane === "document" ? a.docWaiting : a.waiting}</p>
  }
  const item = images[Math.min(selected, images.length - 1)]
  const firstRegions = item.regions.filter((r) => r.first)
  const faces = item.regions.filter((r) => r.visual === "face").length
  const reached = phaseOf(item, agent)

  function download() {
    const url = canvasRef.current?.toDataURL("image/png")
    if (!url) return
    const link = document.createElement("a")
    link.href = url
    link.download = `${item.id.replace(/\W+/g, "-")}.masked.png`
    link.click()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold">{lane === "document" ? a.documents(images.length) : a.images(images.length)}</div>
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {images.map((img, i) => (
            <li key={img.id} className="w-48 shrink-0 lg:w-auto">
              <button
                type="button"
                onClick={() => {
                  setSelected(i)
                  setPick(null)
                  setShown("original")
                }}
                className={cn(
                  "flex w-full cursor-pointer gap-2.5 rounded-lg border p-2 text-left transition-colors hover:bg-muted",
                  i === selected && "border-foreground/25 bg-muted",
                )}
              >
                {img.kind === "document" ? (
                  <div className="h-10 w-14 shrink-0 overflow-hidden rounded border bg-white">
                    <ImageCanvas item={img} mode="original" className="rounded-none border-0" />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.src} alt="" className="h-10 w-14 shrink-0 rounded border bg-white object-cover object-left-top" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{img.id}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {img.page && img.pageCount ? a.page(img.page, img.pageCount) : img.column}
                  </div>
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
                {lane === "photo" && `${a.faces(faces)} · `}
                {a.words(item.words.length)} · {a.blocks(item.blocks?.length ?? 0)} · {a.pii(firstRegions.length)}
              </div>
            )}
          </div>
          {ready(item, agent) && (
            <div className="flex items-center gap-3">
              <Tabs value={shown} onValueChange={(v) => setPick(v as Phase)}>
                <TabsList>
                  {PHASES.slice(0, PHASES.indexOf(agent) + 1).map((p) => (
                    <TabsTrigger key={p} value={p} disabled={PHASES.indexOf(p) > PHASES.indexOf(reached)} className="px-2.5">
                      <span className={cn("size-1.5 rounded-full", PHASE_DOT[p])} />
                      {a.phases[p]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {agent === "generate" && (
                <Button size="sm" variant="outline" onClick={download} disabled={shown !== "generate"}>
                  <Download />
                  {a.download}
                </Button>
              )}
            </div>
          )}
        </div>

        {ready(item, agent) ? (
          <>
            {/* Plays original → identified (→ generated) whenever an item is opened or finishes; the tabs move it back and forth. */}
            <LiveCanvas
              key={item.id}
              item={item}
              phase={pick ?? undefined}
              animateOnMount
              until={agent}
              onCanvas={onCanvas}
              onPhase={setShown}
            />
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
                      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{r.visual ? `${r.type} · ${r.visual}` : r.type}</td>
                      <td className={cn("px-3 py-1.5", agent === "generate" && "text-muted-foreground line-through")}>{r.original}</td>
                      {agent === "generate" && (
                        <td className="px-3 py-1.5 font-medium">
                          {r.visual === "face" && r.replacement
                            ? a.repainted(r.replacement)
                            : (r.replacement ?? (r.visual ? a.synthetic : ""))}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {item.kind === "document" ? (
              <ImageCanvas item={item} mode="original" className="opacity-50" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.src} alt="" className="w-full rounded border bg-white opacity-50" />
            )}
            <p className={cn("text-xs text-muted-foreground", item.status === "failed" && "text-red-600 dark:text-red-400")}>
              {item.status === "failed" ? item.error : agent === "identify" ? a.notIdentified : a.notGenerated}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
