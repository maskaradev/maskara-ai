"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"

import { ITEM_STYLE } from "@/components/agent-panel"
import { LiveCanvas } from "@/components/live-canvas"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMessages } from "@/lib/i18n"
import type { ImageItem, Run } from "@/lib/types"
import { cn } from "@/lib/utils"

function Tile({ item, onOpen }: { item: ImageItem; onOpen: () => void }) {
  const a = useMessages().agents
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition-shadow hover:ring-2 hover:ring-foreground/15",
        item.status === "generated" && "border-emerald-500/40",
        item.status === "failed" && "border-red-500/40",
      )}
    >
      <div className={cn("relative overflow-hidden bg-white", item.kind === "document" ? "aspect-[3/4]" : "aspect-[4/3]")}>
        <LiveCanvas
          item={item}
          className="h-full w-full"
          canvasClassName={cn(
            "h-full rounded-none border-0 object-contain transition-opacity duration-500",
            (item.status === "pending" || item.status === "failed") && "opacity-40",
          )}
        />
        {item.status === "identifying" && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 w-1/3 animate-[live-scan_1.3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-sky-400/35 to-transparent" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
        <span className="truncate text-[11.5px] font-medium">{item.id}</span>
        <span className={cn("shrink-0 rounded px-1 text-[10px] font-semibold", ITEM_STYLE[item.status])}>{a.item[item.status]}</span>
      </div>
    </button>
  )
}

function Section({ title, items, onOpen }: { title: string; items: ImageItem[]; onOpen: (id: string) => void }) {
  if (!items.length) return null
  const docs = items[0].kind === "document"
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      <div className={cn("grid gap-2.5", docs ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5")}>
        {items.map((item) => (
          <Tile key={item.id} item={item} onOpen={() => onOpen(item.id)} />
        ))}
      </div>
    </div>
  )
}

/** Every photo and PDF page of a run, each animating the moment its agent finishes it. */
export function LiveWall({ run }: { run: Run }) {
  const a = useMessages().agents
  const [open, setOpen] = useState<string | null>(null)
  const [replay, setReplay] = useState(0)
  const images = run.images ?? []
  if (!images.length) return null
  const identified = images.filter((i) => i.status === "identified" || i.status === "generated").length
  const generated = images.filter((i) => i.status === "generated").length
  const current = images.find((i) => i.id === open)

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{a.liveTitle}</h3>
          <p className="text-xs text-muted-foreground">{a.liveDescription}</p>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-sky-700 dark:text-sky-300">
            {a.phases.identify} {identified}/{images.length}
          </span>
          <span className="text-emerald-700 dark:text-emerald-300">
            {a.phases.generate} {generated}/{images.length}
          </span>
        </div>
      </div>
      <Section title={a.photoLane} items={images.filter((i) => i.kind === "photo")} onOpen={setOpen} />
      <Section title={a.documentLane} items={images.filter((i) => i.kind === "document")} onOpen={setOpen} />

      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-5xl">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle>{current.id}</DialogTitle>
                <DialogDescription>
                  {current.column} · {a.item[current.status]}
                  {current.status === "failed" && current.error ? ` — ${current.error}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[75vh] overflow-auto">
                <LiveCanvas key={`${current.id}#${replay}`} item={current} animateOnMount steps />
              </div>
              <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setReplay((n) => n + 1)}>
                <RotateCcw />
                {a.replay}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
