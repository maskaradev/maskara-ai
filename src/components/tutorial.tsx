"use client"

import { X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { createContext, use, useEffect, useMemo, useRef, useState } from "react"
import { EVENTS, Joyride, STATUS, type EventData, type Step, type TooltipRenderProps } from "react-joyride"

import { Button } from "@/components/ui/button"
import { useMessages, type Messages } from "@/lib/i18n"
import { useHydrated } from "@/lib/store"

type StepId = keyof Messages["tour"]["steps"]

type TourStep = {
  id: StepId
  /** CSS selector; omitted for the centered welcome card. */
  target?: string
  /** Pages the step lives on; the tour hides while the user is elsewhere. */
  route?: RegExp
  /** Where Back sends the user if they have not visited the step's page yet. */
  path?: string
  placement?: Step["placement"]
  /**
   * Element the step asks the user to click (`true` = the target itself). Clicking it moves the
   * tour on, and Next clicks it for them, so either path performs the real action.
   */
  action?: true | string
  /** Step Back returns to, when the previous one only exists mid-interaction (an open dialog). */
  back?: StepId
  /** How long to wait for the target to mount (async loads, page transitions). */
  wait?: number
  /** Step to fall back to when the target never shows up or disappears. */
  fallback?: StepId
  /** Keep the page visible and usable, e.g. while the AI or a run is working. */
  noOverlay?: boolean
  /** Lets an opening animation (dialog zoom) finish before measuring the target. */
  delay?: number
}

const DATASET = "sample-hospital"
const DATASETS = /^\/datasets$/
const NEW_JOB = /^\/jobs\/new$/
const JOB_PAGE = /^\/jobs(\/(?!new$)[^/]+)?$/

// Mirrors the demo path: datasets → samples → new job → AI roles → run → pipeline → live wall → results → privacy & utility.
const STEPS: TourStep[] = [
  { id: "welcome" },
  { id: "navDatasets", target: '[data-tour="nav-datasets"]', placement: "right", action: true },
  { id: "loadSamples", target: '[data-tour="load-samples"]', route: DATASETS, path: "/datasets", placement: "bottom-end", action: true },
  { id: "datasetCard", target: `[data-tour="dataset-${DATASET}"]`, route: DATASETS, path: "/datasets", action: true, wait: 30_000 },
  { id: "newJob", target: `[data-tour="new-job-${DATASET}"]`, route: DATASETS, path: "/datasets", action: true },
  {
    id: "autoDetect",
    target: '[data-tour="auto-detect"]',
    route: NEW_JOB,
    path: `/jobs/new?dataset=${DATASET}`,
    placement: "bottom-end",
    action: true,
    wait: 10_000,
  },
  {
    id: "aiStart",
    target: '[data-tour="ai-start"]',
    route: NEW_JOB,
    path: `/jobs/new?dataset=${DATASET}`,
    placement: "top-end",
    action: true,
    fallback: "autoDetect",
    noOverlay: true,
    delay: 250,
  },
  {
    id: "runJob",
    target: '[data-tour="run-job"]',
    route: NEW_JOB,
    path: `/jobs/new?dataset=${DATASET}`,
    placement: "left",
    action: true,
    back: "autoDetect",
    noOverlay: true,
  },
  { id: "pipeline", target: '[data-tour="pipeline-graph"]', route: JOB_PAGE, path: "/jobs", wait: 10_000 },
  { id: "liveWall", target: '[data-tour="live-wall"]', route: JOB_PAGE, path: "/jobs", placement: "top", wait: 15_000, fallback: "resultsTab" },
  {
    id: "resultsTab",
    target: '[data-tour="tab-results"]',
    route: JOB_PAGE,
    path: "/jobs",
    placement: "bottom-start",
    // Clickable only once the run has finished.
    action: '[data-tour="run-tabs"][data-done] [data-tour="tab-results"]',
    noOverlay: true,
  },
  { id: "qualityTab", target: '[data-tour="tab-quality"]', route: JOB_PAGE, path: "/jobs", placement: "bottom-start", action: true },
  { id: "quality", target: '[data-tour="quality-view"]', route: JOB_PAGE, path: "/jobs", placement: "top", wait: 5_000 },
]

const indexOf = (id: StepId) => STEPS.findIndex((s) => s.id === id)
const onRoute = (step: TourStep, pathname: string) => !step.route || step.route.test(pathname)
const actionSelector = (step: TourStep) => (step.action === true ? step.target : step.action)

function actionElement(step: TourStep): HTMLElement | null {
  const selector = actionSelector(step)
  const el = selector ? document.querySelector<HTMLElement>(selector) : null
  return el && !(el instanceof HTMLButtonElement && el.disabled) ? el : null
}

/** True while the step's action can be clicked; Next waits otherwise (AI still deciding, run not done). */
function useActionReady(step: TourStep) {
  const [ready, setReady] = useState<StepId | null>(null)
  useEffect(() => {
    if (!step.action) return
    const timer = setInterval(() => setReady(actionElement(step) ? step.id : null), 200)
    return () => clearInterval(timer)
  }, [step])
  return !step.action || ready === step.id
}

const TourControls = createContext<{ next: () => void; back: () => void; skip: () => void } | null>(null)

function TourTooltip({ index, size, isLastStep, tooltipProps }: TooltipRenderProps) {
  const t = useMessages().tour
  const controls = use(TourControls)
  const step = STEPS[index]
  const ready = useActionReady(step)
  const firedOnPointer = useRef(false)
  const { title, body } = t.steps[step.id]
  if (!controls) return null

  return (
    <div
      {...tooltipProps}
      // pointer-events: Radix dialogs disable them on <body>, which the tour portal inherits.
      className="pointer-events-auto flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h3 className="mr-auto text-sm font-semibold">{title}</h3>
          {index > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{t.progress(index, size - 1)}</span>}
          <Button variant="ghost" size="icon-xs" className="-mr-1.5 text-muted-foreground" aria-label={t.close} title={t.close} onClick={controls.skip}>
            <X />
          </Button>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 mr-auto text-muted-foreground" onClick={controls.skip}>
          {t.skip}
        </Button>
        {index > 0 && (
          <Button variant="outline" size="sm" onClick={controls.back}>
            {t.back}
          </Button>
        )}
        <Button
          size="sm"
          disabled={!ready}
          // Act on pointerdown: an open dialog closes itself on any outside pointerdown,
          // which would remove the button Next is about to click. Click still covers the keyboard.
          onPointerDown={() => {
            firedOnPointer.current = true
            controls.next()
          }}
          onClick={() => {
            if (!firedOnPointer.current) controls.next()
            firedOnPointer.current = false
          }}
        >
          {index === 0 ? t.start : isLastStep ? t.finish : t.next}
        </Button>
      </div>
    </div>
  )
}

/** Guided tour shown on every visit; there is no "seen it" flag, only the Skip button. */
export function Tutorial() {
  const pathname = usePathname()
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [index, setIndex] = useState(0)
  const current = STEPS[index]
  // Start once local data is loaded, so dataset cards and runs exist to point at.
  const active = useHydrated() && !dismissed
  /** The URL each step was last shown on, so Back returns to the same run or dataset. */
  const visited = useRef<Partial<Record<StepId, string>>>({})

  // Navigating by any means (a highlighted link, the sidebar, a redirect) jumps ahead
  // to the first upcoming step that lives on the new page.
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    if (!onRoute(current, pathname)) {
      const ahead = STEPS.findIndex((s, i) => i > index && onRoute(s, pathname))
      if (ahead !== -1) setIndex(ahead)
    }
  }

  useEffect(() => {
    if (active && current.route && onRoute(current, pathname)) {
      visited.current[current.id] = window.location.pathname + window.location.search
    }
  }, [active, current, pathname])

  // Action steps advance when the user clicks the element, whether by hand or through Next.
  useEffect(() => {
    const selector = actionSelector(current)
    if (!active || !selector) return
    const onClick = (e: MouseEvent) => {
      const el = document.querySelector(selector)
      if (el && e.target instanceof Node && el.contains(e.target)) setIndex((i) => (i === index ? i + 1 : i))
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [active, current, index])

  // A target can vanish mid-step (the goal dialog cancelled); fall back instead of pointing at nothing.
  useEffect(() => {
    if (!active || !current.fallback || !current.target) return
    const step = current
    const selector = current.target
    const fallback = indexOf(current.fallback)
    let seen = false
    const timer = setInterval(() => {
      // Leaving the page also removes the target; that is handled by the route jump above.
      if (!onRoute(step, window.location.pathname)) return
      if (document.querySelector(selector)) seen = true
      else if (seen) setIndex((i) => (i === index ? fallback : i))
    }, 400)
    return () => clearInterval(timer)
  }, [active, current, index])

  const controls = useMemo(
    () => ({
      next() {
        if (current.action) {
          const el = actionElement(current)
          // Radix tabs switch on mousedown, which a programmatic click() doesn't send.
          if (el?.role === "tab") el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
          el?.click()
        }
        else if (index === STEPS.length - 1) setDismissed(true)
        else setIndex(index + 1)
      },
      back() {
        const prev = current.back ? indexOf(current.back) : index - 1
        const step = STEPS[prev]
        if (!onRoute(step, pathname)) router.push(visited.current[step.id] ?? step.path ?? "/datasets")
        setIndex(prev)
      },
      skip: () => setDismissed(true),
    }),
    [current, index, pathname, router],
  )

  const m = useMessages()
  // Stable across renders so Joyride doesn't treat every render as a new tour.
  const steps = useMemo<Step[]>(
    () =>
      STEPS.map((s) => ({
        target: s.target ?? "body",
        placement: s.target ? (s.placement ?? "bottom") : "center",
        content: m.tour.steps[s.id].body,
        targetWaitTimeout: s.wait ?? 3_000,
        hideOverlay: s.noOverlay,
        before: s.delay ? () => new Promise<void>((resolve) => setTimeout(resolve, s.delay)) : undefined,
      })),
    [m],
  )

  function onEvent(data: EventData) {
    if (data.status === STATUS.SKIPPED || data.status === STATUS.FINISHED) setDismissed(true)
    else if (data.type === EVENTS.TARGET_NOT_FOUND && data.index === index) {
      if (current.fallback) setIndex(indexOf(current.fallback))
      else if (index === STEPS.length - 1) setDismissed(true)
      else setIndex(index + 1)
    }
  }

  return (
    <TourControls value={controls}>
      <Joyride
        run={active && onRoute(current, pathname)}
        stepIndex={index}
        steps={steps}
        continuous
        onEvent={onEvent}
        tooltipComponent={TourTooltip}
        options={{
          skipBeacon: true,
          // The app keeps focus in its own dialogs; a second trap would fight them.
          disableFocusTrap: true,
          overlayClickAction: false,
          dismissKeyAction: false,
          arrowColor: "var(--popover)",
          overlayColor: "rgba(0, 0, 0, 0.55)",
          spotlightRadius: 10,
          spotlightPadding: 6,
          zIndex: 60,
        }}
      />
    </TourControls>
  )
}
