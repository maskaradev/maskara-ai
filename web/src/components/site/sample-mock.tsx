"use client"

import gsap from "gsap"
import { TextPlugin } from "gsap/TextPlugin"
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { PERSONA_MAP, SUBJECT, TABS, type SampleRecord, type SampleTab, type Seg } from "@/components/site/sample-data"

gsap.registerPlugin(TextPlugin)

type Span = Exclude<Seg, string>
type Hot = { hot: string | null; onHot: (k: string | null) => void }

/** A replaceable value. Live marks hold both values and swap under a bar; the timeline owns `data-s`. */
function Mark({ seg, live, hot, onHot }: { seg: Span; live: boolean } & Hot) {
  return (
    <mark
      className="seg"
      data-k={seg[0]}
      data-s="todo"
      data-hot={hot === seg[0] || undefined}
      onMouseEnter={() => onHot(seg[0])}
      onMouseLeave={() => onHot(null)}
    >
      {live ? (
        <>
          <span className="o">{seg[1]}</span>
          <span className="m">{seg[2]}</span>
          <i className="bar" />
        </>
      ) : (
        seg[1]
      )}
    </mark>
  )
}

function Segs({ segs, live, ...hot }: { segs: Seg[]; live: boolean } & Hot) {
  return segs.map((seg, i) =>
    typeof seg === "string" ? seg : <Mark key={i} seg={seg} live={live} {...hot} />,
  )
}

function Record({ record, live, ...hot }: { record: SampleRecord; live: boolean } & Hot) {
  return (
    <div className="rec">
      <div className="pane-meta">
        <Segs segs={record.meta} live={live} {...hot} />
      </div>
      {record.fields && (
        <dl className="kv">
          {record.fields.map(({ column, cell }) => (
            <div key={column}>
              <dt>{column}</dt>
              <dd>{typeof cell === "string" ? <span className="kept">{cell}</span> : <Mark seg={cell} live={live} {...hot} />}</dd>
            </div>
          ))}
        </dl>
      )}
      {record.text && (
        <div className="pane-body">
          <Segs segs={record.text} live={live} {...hot} />
        </div>
      )}
    </div>
  )
}

const spans = (tab: SampleTab) =>
  tab.records
    .flatMap((r) => [...r.meta, ...(r.fields?.map((f) => f.cell) ?? []), ...(r.text ?? [])])
    .filter((s) => typeof s !== "string").length

/** One input, original beside masked. */
function Tab({ tab }: { tab: SampleTab }) {
  const [hot, setHot] = useState<string | null>(null)
  return (
    <div className="split">
      {([false, true] as const).map((live) => (
        <div key={String(live)} className={live ? "pane masked" : "pane original"}>
          <div className="pane-hd">
            <b>{live ? "masked" : "original"}</b>
            <span>{tab.file}</span>
          </div>
          {tab.records.map((r, i) => (
            <Record key={i} record={r} live={live} hot={hot} onHot={setHot} />
          ))}
          <div className="pane-foot">
            {live ? (
              <>
                <span>
                  replaced <b data-count>0</b>/{spans(tab)}
                </span>
                <span>dates {SUBJECT.shift}</span>
              </>
            ) : (
              <span>hover a highlight to find its replacement</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Each value in turn: struck where it was found, swapped under a bar where it lands, its map row lit. */
function build(stage: HTMLElement, side: HTMLElement) {
  const tl = gsap.timeline()
  const found = stage.querySelectorAll(".pane.original mark.seg")
  const count = stage.querySelector("[data-count]")
  stage.querySelectorAll(".pane.masked mark.seg").forEach((mark, i) => {
    const at = 0.5 + i * 0.32
    const q = gsap.utils.selector(mark)
    tl.set(found[i], { attr: { "data-s": "done" } }, at)
      .fromTo(q(".bar"), { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.2, ease: "power2.in", immediateRender: false }, at)
      .set(q(".o"), { display: "none" }, at + 0.2)
      .set(q(".m"), { display: "inline" }, at + 0.2)
      .set(mark, { attr: { "data-s": "done" } }, at + 0.2)
      .to(q(".bar"), { opacity: 0, duration: 0.25 }, at + 0.22)
      .set(count, { text: String(i + 1) }, at + 0.2)
    const glow = side.querySelectorAll(`[data-k="${mark.getAttribute("data-k")}"] .glow`)
    if (glow.length)
      tl.fromTo(glow, { opacity: 1 }, { opacity: 0, duration: 1.4, ease: "power2.out", immediateRender: false }, at)
  })
  return tl
}

// Timelines are written in "story" seconds and played SPEED times faster; each tab holds its finished
// state for a moment before the next one takes over.
const SPEED = 1.45
const HOLD = 2.4
const seconds = (tab: SampleTab) => 0.5 + spans(tab) * 0.32 + HOLD

/** Plays only while the mock is on screen and not under the pointer. */
function sync(tl: RefObject<gsap.core.Timeline | null>, visible: boolean, hovering: boolean) {
  if (visible && !hovering) tl.current?.play()
  else tl.current?.pause()
}

/**
 * One customer through every input. Each tab fills while it plays, then hands over to the next; finished
 * tabs stay filled, so the row fills up once per round. It pauses under the pointer and off screen; with
 * reduced motion each tab is shown finished and the tabs are left to the reader.
 */
export function SampleMock() {
  const [current, setCurrent] = useState(0)
  // Bumped by a tab click so choosing the current tab replays it.
  const [round, setRound] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const side = useRef<HTMLElement>(null)
  const bars = useRef<(HTMLElement | null)[]>([])
  const timeline = useRef<gsap.core.Timeline | null>(null)
  const visible = useRef(false)
  const hovering = useRef(false)

  useLayoutEffect(() => {
    const map = side.current!
    // The persona map outlives the tabs, and overlapping flashes don't always revert to dark.
    const darken = () => map.querySelectorAll<HTMLElement>(".glow").forEach((g) => g.style.removeProperty("opacity"))
    const ctx = gsap.context(() => {
      const content = build(stage.current!, map)
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        content.progress(1, false)
        darken()
        gsap.set(bars.current, { scaleX: (i: number) => (i <= current ? 1 : 0) })
        return
      }
      gsap.set(bars.current, { scaleX: (i: number) => (i < current ? 1 : 0) })
      timeline.current = gsap
        .timeline({ paused: true, onComplete: () => setCurrent((t) => (t + 1) % TABS.length) })
        .add(content, 0)
        .fromTo(
          bars.current[current],
          { scaleX: 0 },
          { scaleX: 1, duration: seconds(TABS[current]), ease: "none", immediateRender: false },
          0,
        )
        .timeScale(SPEED)
    }, root)
    sync(timeline, visible.current, hovering.current)
    return () => {
      timeline.current = null
      ctx.revert()
      darken()
    }
  }, [current, round])

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting
        sync(timeline, visible.current, hovering.current)
      },
      { threshold: 0.35 },
    )
    observer.observe(root.current!)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="mock"
      ref={root}
      role="group"
      aria-label="One customer masked across their row, their orders, a support transcript and an agent note"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return
        hovering.current = true
        sync(timeline, visible.current, true)
      }}
      onPointerLeave={() => {
        hovering.current = false
        sync(timeline, visible.current, false)
      }}
    >
      <aside className="mock-side" ref={side}>
        <div className="side-rec">
          <div className="mock-title">
            <span>customer</span>
            <span>{SUBJECT.id}</span>
          </div>
          <div className="who">
            <span className="dot" />
            <span>
              <strong>{SUBJECT.name}</strong>
              <small>
                {SUBJECT.id} · {SUBJECT.about}
              </small>
            </span>
          </div>
          <div className="who">
            <span className="dot hollow" />
            <span>
              <strong>{SUBJECT.persona}</strong>
              <small>persona · dates {SUBJECT.shift}</small>
            </span>
          </div>
        </div>
        <div className="side-map">
          <div className="mock-title">
            <span>persona map</span>
            <span>{PERSONA_MAP.length}</span>
          </div>
          {PERSONA_MAP.map((r) => (
            <div key={r.entity} className="map-row" data-k={r.entity}>
              <i className="glow" />
              <span>{r.label}</span>
              <s>{r.original}</s>
              <b>{r.masked}</b>
            </div>
          ))}
        </div>
      </aside>

      <section className="mock-main">
        <div className="tabs" role="tablist">
          {TABS.map((t, i) => (
            <button
              key={t.file}
              type="button"
              role="tab"
              aria-selected={i === current}
              data-state={i < current ? "done" : i === current ? "active" : "todo"}
              onClick={() => {
                setCurrent(i)
                setRound((r) => r + 1)
              }}
            >
              <span className="tab-name">{t.name}</span>
              <small>{t.file}</small>
              <span className="prog">
                <i
                  ref={(el) => {
                    bars.current[i] = el
                  }}
                />
              </span>
            </button>
          ))}
        </div>
        <div className="stage" ref={stage} role="tabpanel" key={`${current}-${round}`}>
          <Tab tab={TABS[current]} />
        </div>
      </section>
    </div>
  )
}
