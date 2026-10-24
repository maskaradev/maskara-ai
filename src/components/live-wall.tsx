"use client"

import { Maximize2, Play, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ITEM_STYLE } from "@/components/agent-panel"
import { LiveCanvas, PHASE_DOT, PHASES, phaseOf, type Phase } from "@/components/live-canvas"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMessages } from "@/lib/i18n"
import type { ImageItem, Run } from "@/lib/types"
import { cn } from "@/lib/utils"

// Demo view of the media lanes: one big stage plays each photo or PDF page changing (original →
// identified → generated) the moment its agent finishes it, one item after another; the rail beside it
// shows every item's current state as it happens.

/** Pause on a finished item before the next one; shorter when the queue backs up. */
const HOLD_MS = 1400
const RUSH_MS = 350
const RUSH_AT = 4

const rank = (p: Phase) => PHASES.indexOf(p)

type Spot = { id: string; from: Phase; to: Phase; n: number }

function Scan() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-y-0 w-1/3 animate-[live-scan_1.3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-sky-400/35 to-transparent" />
    </div>
  )
}

function caption(item: ImageItem, page: (page: number, count: number) => string) {
  return item.page && item.pageCount ? `${item.column} · ${page(item.page, item.pageCount)}` : item.column
}

function RailItem({ item, active, queued, onOpen }: { item: ImageItem; active: boolean; queued: boolean; onOpen: () => void }) {
  const a = useMessages().agents
  return (
    <button
      type="button"
      onClick={onOpen}
      data-active={active || undefined}
      className={cn(
        "flex w-52 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg border p-1.5 text-left transition-colors hover:bg-muted lg:w-full",
        active && "border-foreground/30 bg-muted ring-2 ring-foreground/10",
      )}
    >
      <div className="relative h-11 w-14 shrink-0 overflow-hidden rounded border bg-white">
        <LiveCanvas
          item={item}
          animate={false}
          className="h-full w-full"
          canvasClassName={cn(
            "h-full rounded-none border-0 object-cover object-top transition-opacity duration-500",
            (item.status === "pending" || item.status === "failed") && "opacity-40",
          )}
        />
        {item.status === "identifying" && <Scan />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium">{item.id}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={cn("shrink-0 rounded px-1 text-[10px] font-semibold", ITEM_STYLE[item.status])}>{a.item[item.status]}</span>
          {queued && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-violet-500" title={a.queued} />}
        </div>
      </div>
    </button>
  )
}

/** The stage: every photo and PDF page of a run, played one at a time as the agents finish them. */
export function LiveWall({ run }: { run: Run }) {
  const m = useMessages()
  const a = m.agents
  const images = useMemo(() => run.images ?? [], [run.images])
  const [open, setOpen] = useState<string | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [spotPhase, setSpotPhase] = useState<Phase>("original")
  const [queued, setQueued] = useState<string[]>([])

  const latest = useRef(images)
  const queue = useRef<string[]>([])
  // Last phase seen per item, and the phase the stage last played it to.
  const seen = useRef(new Map<string, Phase>())
  const played = useRef(new Map<string, Phase>())
  const busy = useRef(false)
  const settled = useRef(0)
  const counter = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const next = useCallback(() => {
    while (queue.current.length) {
      const id = queue.current.shift()!
      const item = latest.current.find((i) => i.id === id)
      if (!item) continue
      const to = phaseOf(item)
      const from = played.current.get(id) ?? "original"
      if (rank(to) <= rank(from)) continue
      played.current.set(id, to)
      busy.current = true
      setQueued([...queue.current])
      setSpot({ id, from, to, n: ++counter.current })
      return
    }
    busy.current = false
    setQueued([])
  }, [])

  // Queue every item that moved forward; the stage picks them up in the order they finished.
  useEffect(() => {
    latest.current = images
    let added = false
    for (const item of images) {
      const phase = phaseOf(item)
      if (seen.current.get(item.id) === phase) continue
      seen.current.set(item.id, phase)
      if (phase !== "original" && !queue.current.includes(item.id)) {
        queue.current.push(item.id)
        added = true
      }
    }
    if (!added) return
    if (busy.current) setQueued([...queue.current])
    else next()
  }, [images, next])

  useEffect(() => () => clearTimeout(timer.current), [])

  const onSettled = useCallback(() => {
    // The canvas settles again whenever its item redraws; only the first one ends the spot.
    if (settled.current === counter.current) return
    settled.current = counter.current
    clearTimeout(timer.current)
    timer.current = setTimeout(next, queue.current.length >= RUSH_AT ? RUSH_MS : HOLD_MS)
  }, [next])

  function replayAll() {
    clearTimeout(timer.current)
    played.current.clear()
    queue.current = latest.current.filter((i) => phaseOf(i) !== "original").map((i) => i.id)
    next()
  }

  const spotItem = spot ? images.find((i) => i.id === spot.id) : undefined
  // Before anything is finished, show the item an agent is reading.
  const idleItem = spotItem ? undefined : (images.find((i) => i.status === "identifying") ?? images[0])
  const stageItem = spotItem ?? idleItem

  // Keep the rail scrolled to the item on stage.
  const rail = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>("[data-active]")
    if (!rail.current || !el) return
    rail.current.scrollTo({
      top: el.offsetTop - (rail.current.clientHeight - el.offsetHeight) / 2,
      left: el.offsetLeft - (rail.current.clientWidth - el.offsetWidth) / 2,
      behavior: "smooth",
    })
  }, [stageItem?.id])

  if (!stageItem) return null
  const identified = images.filter((i) => i.status === "identified" || i.status === "generated").length
  const generated = images.filter((i) => i.status === "generated").length
  const lane = stageItem.kind === "document" ? "doc" : "photo"
  const agentLabel =
    spotItem && spotPhase !== "original"
      ? m.graph.stages[spotPhase === "identify" ? (lane === "doc" ? "doc_identify" : "identify") : lane === "doc" ? "doc_generate" : "generate"].label
      : null

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4" data-tour="live-wall">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            {run.status === "running" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />}
            <span className={cn("relative inline-flex size-2 rounded-full", run.status === "running" ? "bg-red-500" : "bg-muted-foreground/40")} />
          </span>
          <h3 className="text-sm font-semibold">{a.liveTitle}</h3>
          <p className="hidden text-xs text-muted-foreground md:block">{a.liveDescription}</p>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-sky-700 dark:text-sky-300">
            {a.phases.identify} {identified}/{images.length}
          </span>
          <span className="text-emerald-700 dark:text-emerald-300">
            {a.phases.generate} {generated}/{images.length}
          </span>
          <Button variant="outline" size="sm" disabled={!identified} onClick={replayAll}>
            <Play />
            {a.replayAll}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="group relative h-[clamp(300px,50vh,620px)] overflow-hidden rounded-lg bg-zinc-950">
          {spot && spotItem ? (
            <LiveCanvas
              key={spot.n}
              item={spotItem}
              phase={spot.to}
              animateOnMount={spot.from}
              steps
              onPhase={setSpotPhase}
              onSettled={onSettled}
              className="h-full w-full px-3 pt-12 pb-16"
              canvasClassName="h-full rounded-none border-0 bg-transparent object-contain"
            />
          ) : (
            <>
              <LiveCanvas
                key={stageItem.id}
                item={stageItem}
                phase="original"
                animate={false}
                className="h-full w-full px-3 pt-12 pb-16"
                canvasClassName={cn("h-full rounded-none border-0 bg-transparent object-contain", stageItem.status === "pending" && "opacity-40")}
              />
              {stageItem.status === "identifying" && <Scan />}
              <div className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/70 backdrop-blur-sm">
                {stageItem.status === "identifying" ? a.item.identifying : a.liveIdle}
              </div>
            </>
          )}
          {agentLabel && (
            <div
              className={cn(
                "absolute top-3 right-3 rounded-full px-3 py-1 text-[11px] font-semibold text-black transition-colors",
                spotPhase === "identify" ? "bg-sky-400" : "bg-emerald-400",
              )}
            >
              {agentLabel}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-3 text-white">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{stageItem.id}</div>
              <div className="truncate text-xs text-white/60">
                {caption(stageItem, a.page)}
                {spotItem && spotPhase !== "original" && ` · ${a.pii(spotItem.regions.filter((r) => r.first).length)}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {queued.length > 0 && <span className="text-xs text-white/60 tabular-nums">{a.upNext(queued.length)}</span>}
              <Button variant="secondary" size="sm" onClick={() => setOpen(stageItem.id)}>
                <Maximize2 />
                {a.inspect}
              </Button>
            </div>
          </div>
        </div>

        <div ref={rail} className="relative flex gap-2 overflow-x-auto pb-1 lg:h-[clamp(300px,50vh,620px)] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1 lg:pb-0">
          {images.map((item) => (
            <RailItem key={item.id} item={item} active={item.id === stageItem.id} queued={queued.includes(item.id)} onOpen={() => setOpen(item.id)} />
          ))}
        </div>
      </div>

      <ItemDialog item={images.find((i) => i.id === open)} onClose={() => setOpen(null)} />
    </section>
  )
}

/** One item, replayed on open; the header tabs move it to any phase it has reached, animating there. */
function ItemDialog({ item, onClose }: { item: ImageItem | undefined; onClose: () => void }) {
  const a = useMessages().agents
  const [pick, setPick] = useState<Phase | null>(null)
  const [shown, setShown] = useState<Phase>("original")
  const [replay, setReplay] = useState(0)
  const [openedFor, setOpenedFor] = useState<string | undefined>(item?.id)
  if (openedFor !== item?.id) {
    setOpenedFor(item?.id)
    setPick(null)
    setShown("original")
  }
  const reached = item ? phaseOf(item) : "original"

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        {item && (
          <>
            <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 pr-10">
              <div className="min-w-0">
                <DialogTitle>{item.id}</DialogTitle>
                <DialogDescription>
                  {item.column} · {a.item[item.status]}
                  {item.status === "failed" && item.error ? ` — ${item.error}` : ""}
                </DialogDescription>
              </div>
              <Tabs value={shown} onValueChange={(v) => setPick(v as Phase)}>
                <TabsList>
                  {PHASES.map((p) => (
                    <TabsTrigger key={p} value={p} disabled={rank(p) > rank(reached)} className="px-2.5">
                      <span className={cn("size-1.5 rounded-full", PHASE_DOT[p])} />
                      {a.phases[p]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </DialogHeader>
            <div className="max-h-[75vh] overflow-auto">
              <LiveCanvas key={`${item.id}#${replay}`} item={item} phase={pick ?? undefined} animateOnMount onPhase={setShown} />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => {
                setPick(null)
                setReplay((n) => n + 1)
              }}
            >
              <RotateCcw />
              {a.replay}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
