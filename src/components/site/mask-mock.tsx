"use client"

import gsap from "gsap"
import { TextPlugin } from "gsap/TextPlugin"
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { FORM, NOTES, PATIENT, PERSONA_MAP, PHOTO, VOICEMAIL, type Seg } from "@/components/site/mask-mock-data"

gsap.registerPlugin(TextPlugin)

type Span = Exclude<Seg, string>
/** Builds one lane's animation against its rendered DOM. `side` is the persona map, which lights up as it is used. */
type Build = (stage: HTMLElement, side: HTMLElement) => gsap.core.Timeline

// ── shared moves ────────────────────────────────────────────────

/** A black bar sweeps over the original value, the masked value appears under it, the bar lifts. */
function swap(tl: gsap.core.Timeline, mark: Element, at: number) {
  const q = gsap.utils.selector(mark)
  tl.fromTo(
    q(".bar"),
    { scaleX: 0, opacity: 1 },
    { scaleX: 1, duration: 0.2, ease: "power2.in", immediateRender: false },
    at,
  )
    .set(q(".o"), { display: "none" }, at + 0.2)
    .set(q(".m"), { display: "inline" }, at + 0.2)
    .set(mark, { attr: { "data-s": "done" } }, at + 0.2)
    .to(q(".bar"), { opacity: 0, duration: 0.25 }, at + 0.22)
}

/** Lights the persona-map row the lane just drew from. */
function flash(tl: gsap.core.Timeline, side: HTMLElement, entity: string | null, at: number) {
  const glow = entity ? side.querySelectorAll(`[data-k="${entity}"] .glow`) : []
  if (glow.length)
    tl.fromTo(glow, { opacity: 1 }, { opacity: 0, duration: 1.4, ease: "power2.out", immediateRender: false }, at)
}

function Segs({
  segs,
  live,
  hot,
  onHot,
}: {
  segs: Seg[]
  live?: boolean
  hot?: string | null
  onHot?: (k: string | null) => void
}) {
  return segs.map((seg, i) =>
    typeof seg === "string" ? seg : <Mark key={i} seg={seg} live={live} hot={hot === seg[0]} onHot={onHot} />,
  )
}

/** A replaceable span. Live marks hold both values and swap under a bar; the timeline owns `data-s`. */
function Mark({
  seg,
  live,
  hot,
  onHot,
}: {
  seg: Span
  live?: boolean
  hot?: boolean
  onHot?: (k: string | null) => void
}) {
  return (
    <mark
      className="seg"
      data-k={seg[0]}
      data-s="todo"
      data-hot={hot || undefined}
      onMouseEnter={onHot && (() => onHot(seg[0]))}
      onMouseLeave={onHot && (() => onHot(null))}
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

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={i} data-step={i} data-s="todo">
          {s}
        </li>
      ))}
    </ol>
  )
}

function stepper(tl: gsap.core.Timeline, stage: HTMLElement) {
  return (n: number, at: number) =>
    tl.set(stage.querySelector(`[data-step="${n}"]`), { attr: { "data-s": "done" } }, at)
}

function Planned({ text }: { text: string }) {
  return (
    <div className="planned">
      <b>planned</b>
      <span>{text}</span>
    </div>
  )
}

// ── 1 · text ───────────────────────────────────────────────────

const NOTE_SPANS = NOTES.flatMap((n) => [...n.header, ...n.text]).filter((s) => typeof s !== "string").length

function TextLane() {
  const [hot, setHot] = useState<string | null>(null)
  return (
    <div className="lane-text">
      {([false, true] as const).map((live) => (
        <div key={String(live)} className={live ? "pane masked" : "pane original"}>
          <div className="pane-hd">
            <b>{live ? "masked" : "original"}</b>
            <span>clinical_notes.csv</span>
          </div>
          {NOTES.map((n) => (
            <div key={n.id} className="note">
              <div className="pane-meta">
                {n.id} · <Segs segs={n.header} live={live} hot={hot} onHot={setHot} />
              </div>
              <div className="pane-body">
                <Segs segs={n.text} live={live} hot={hot} onHot={setHot} />
              </div>
            </div>
          ))}
          <div className="pane-foot">
            {live ? (
              <>
                <span>
                  replaced <b data-count>0</b>/{NOTE_SPANS}
                </span>
                <span>dates {PATIENT.shift}</span>
                <span className="left" data-left>
                  left behind <b>0</b>
                </span>
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

const buildText: Build = (stage, side) => {
  const tl = gsap.timeline()
  const found = stage.querySelectorAll(".pane.original mark.seg")
  const live = stage.querySelectorAll(".pane.masked mark.seg")
  const count = stage.querySelector("[data-count]")
  live.forEach((mark, i) => {
    const at = 0.5 + i * 0.36
    tl.set(found[i], { attr: { "data-s": "done" } }, at)
    swap(tl, mark, at)
    flash(tl, side, mark.getAttribute("data-k"), at)
    tl.set(count, { text: String(i + 1) }, at + 0.2)
  })
  tl.fromTo(stage.querySelector("[data-left]"), { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: false })
  return tl
}

// ── 2 · pdf: OCR the page, then fill the form in again, field by field ──

const FORM_FIELDS = FORM.filter((f) => f.masked).length

function PdfLane() {
  return (
    <div className="lane-pdf">
      <div className="page">
        <i className="scan" />
        <div className="page-org">Riverside General Hospital</div>
        <div className="page-title">Laboratory Requisition</div>
        {FORM.map((f) => (
          <div key={f.label}>
            {f.section && <div className="page-sec">{f.section}</div>}
            <div className="field" data-k={f.entity} data-s="todo">
              <span className="field-label">{f.label}</span>
              <span className="field-value">
                <span className="orig">{f.original}</span>
                {f.masked ? <span className="typed" data-text={f.masked} /> : <small>kept</small>}
              </span>
            </div>
          </div>
        ))}
        <div className="page-foot">Specimen: serum | Fasting: no | Signature on file</div>
      </div>
      <div className="lane-notes">
        <div className="pane-hd">
          <b>lab_requisition.pdf</b>
          <span>page 1 of 1</span>
        </div>
        <Steps
          steps={[
            "OCR the page",
            "Find PII with the whole page as context",
            <>
              Fill each field in again from the persona{" "}
              <span className="n">
                <b data-count>0</b>/{FORM_FIELDS}
              </span>
            </>,
            "Keep the diagnosis and the tests",
          ]}
        />
      </div>
    </div>
  )
}

const buildPdf: Build = (stage, side) => {
  const tl = gsap.timeline()
  const q = gsap.utils.selector(stage)
  const step = stepper(tl, stage)
  const rows = q(".field")

  tl.fromTo(
    q(".scan"),
    { top: "0%", opacity: 1 },
    { top: "100%", duration: 1.5, ease: "none", immediateRender: false },
    0.2,
  )
  tl.to(q(".scan"), { opacity: 0, duration: 0.2 }, 1.7)
  rows.forEach((row, i) => tl.set(row, { attr: { "data-s": "seen" } }, 0.3 + (i / rows.length) * 1.4))
  step(0, 1.7)
  step(1, 1.9)

  let at = 2.1
  let filled = 0
  for (const row of rows) {
    const typed = row.querySelector<HTMLElement>(".typed")
    if (!typed) continue
    const orig = row.querySelector(".orig")
    const text = typed.dataset.text ?? ""
    const type = Math.min(0.45, text.length * 0.022)
    tl.set(row, { attr: { "data-s": "active" } }, at)
    tl.fromTo(
      orig,
      { clipPath: "inset(0% 0% 0% 0%)" },
      { clipPath: "inset(0% 100% 0% 0%)", duration: 0.18, ease: "power1.in", immediateRender: false },
      at,
    )
    tl.set(orig, { display: "none" }, at + 0.18)
    tl.to(typed, { text, duration: type, ease: "none" }, at + 0.2)
    tl.set(row, { attr: { "data-s": "done" } }, at + 0.2 + type)
    tl.set(q("[data-count]"), { text: String(++filled) }, at + 0.2 + type)
    flash(tl, side, row.getAttribute("data-k"), at + 0.2)
    at += 0.3 + type
  }
  step(2, at)
  rows.filter((row) => !row.querySelector(".typed")).forEach((row) => tl.set(row, { attr: { "data-s": "kept" } }, at))
  step(3, at + 0.2)
  return tl
}

// ── 3 · image: find the face, repaint it as the persona, replace the text in the photo ──

const boxStyle = {
  left: `${PHOTO.box.left * 100}%`,
  top: `${PHOTO.box.top * 100}%`,
  width: `${PHOTO.box.width * 100}%`,
  height: `${PHOTO.box.height * 100}%`,
}

function ImageLane() {
  return (
    <div className="lane-image">
      <figure className="photo">
        <div className="shot">
          {/* eslint-disable-next-line @next/next/no-img-element -- the two layers must match pixel for pixel */}
          <img src={PHOTO.original} alt="Clinical photo of the patient, original" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="repainted" src={PHOTO.masked} alt="The same photo with the face repainted as the persona" />
          <span className="shot-label">
            Photo 1 of 2 · <Mark seg={PHOTO.label as Span} live />
          </span>
          <div className="fbox" style={boxStyle}>
            <span className="fbox-tag">
              face 0.93 · <Mark seg={["name", "Aisha Rahman", "Renee Coleman"]} live />
            </span>
          </div>
          {PHOTO.landmarks.map(([x, y], i) => (
            <i key={i} className="lm" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
          ))}
        </div>
        <figcaption>
          <div className="cap-main">
            <Segs segs={PHOTO.caption} live />
          </div>
          <div className="cap-sub">
            <Segs segs={PHOTO.sub} live />
          </div>
        </figcaption>
      </figure>
      <div className="lane-notes">
        <div className="pane-hd">
          <b>clinical_photo.png</b>
          <span className="state" data-state>
            original
          </span>
        </div>
        <Steps
          steps={[
            "Detect the face and its landmarks",
            "Repaint it as the persona's face",
            "Replace the text burned into the photo",
            "Check that nothing original is left",
          ]}
        />
        <p className="aside">
          The repainted face is real output of the face model. It is seeded by the persona, so this patient gets the
          same face in every photo.
        </p>
      </div>
    </div>
  )
}

const buildImage: Build = (stage, side) => {
  const tl = gsap.timeline()
  const q = gsap.utils.selector(stage)
  const step = stepper(tl, stage)

  tl.fromTo(
    q(".fbox"),
    { opacity: 0, scale: 1.06 },
    { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out", immediateRender: false },
    0.3,
  )
  tl.fromTo(
    q(".lm"),
    { scale: 0 },
    { scale: 1, duration: 0.25, stagger: 0.06, ease: "back.out(3)", immediateRender: false },
    0.6,
  )
  step(0, 1.1)
  tl.to(q(".lm"), { opacity: 0, duration: 0.3 }, 1.3)
  tl.fromTo(
    q(".repainted"),
    { clipPath: "ellipse(0% 0% at 49.6% 52%)" },
    { clipPath: "ellipse(80% 90% at 49.6% 52%)", duration: 1.5, ease: "power2.inOut", immediateRender: false },
    1.3,
  )
  swap(tl, q(".fbox-tag mark")[0], 1.9)
  flash(tl, side, "name", 1.9)
  step(1, 2.8)
  const marks = [...q(".shot-label mark"), ...q("figcaption mark")]
  marks.forEach((mark, i) => {
    swap(tl, mark, 3.1 + i * 0.32)
    flash(tl, side, mark.getAttribute("data-k"), 3.1 + i * 0.32)
  })
  const done = 3.1 + marks.length * 0.32 + 0.2
  step(2, done)
  tl.to(q(".fbox"), { opacity: 0, duration: 0.4 }, done)
  tl.set(q("[data-state]"), { text: "masked", attr: { "data-on": "" } }, done + 0.2)
  step(3, done + 0.4)
  return tl
}

// ── 4 · audio (planned): re-speak only where the voice says PII ──

// The last slices of the recording are silence; the transcript spreads over the rest.
const SPEECH = 113 / VOICEMAIL.peaks.length
const REGIONS = (() => {
  const text = (s: Seg) => (typeof s === "string" ? s : s[1])
  const total = VOICEMAIL.transcript.reduce((n, s) => n + text(s).length, 0)
  const out: { entity: string; start: number; end: number }[] = []
  let pos = 0
  for (const s of VOICEMAIL.transcript) {
    const len = text(s).length
    if (typeof s !== "string")
      out.push({ entity: s[0], start: (pos / total) * SPEECH, end: ((pos + len) / total) * SPEECH })
    pos += len
  }
  return out
})()
/** The level where the persona's voice replaces the original: steadier than speech, clearly not the same. */
const revoiced = (i: number) => 0.3 + 0.45 * Math.abs(Math.sin(i * 1.7))

function AudioLane() {
  return (
    <div className="lane-audio">
      <Planned text="Audio is next on the roadmap. This is how the lane is meant to work." />
      <div className="pane-hd">
        <b>voicemail.mp3</b>
        <span>{VOICEMAIL.duration} · one speaker</span>
      </div>
      <div className="wave-box">
        {REGIONS.map((r, i) => (
          <span
            key={i}
            className="region"
            data-region={i}
            data-s="todo"
            style={{ left: `${r.start * 100}%`, width: `${(r.end - r.start) * 100}%` }}
          >
            <small>{r.entity}</small>
          </span>
        ))}
        <div className="wave">
          {VOICEMAIL.peaks.map((p, i) => (
            <i key={i} style={{ transform: `scaleY(${Math.max(0.04, p)})` }} />
          ))}
        </div>
        <i className="playhead" />
      </div>
      <p className="transcript">
        <Segs segs={VOICEMAIL.transcript} live />
      </p>
    </div>
  )
}

const buildAudio: Build = (stage, side) => {
  const tl = gsap.timeline()
  const q = gsap.utils.selector(stage)
  const bars = q(".wave i")
  const marks = q(".transcript mark")
  const play = 6.4
  const start = 0.3
  tl.fromTo(
    q(".playhead"),
    { left: "0%" },
    { left: "100%", duration: play, ease: "none", immediateRender: false },
    start,
  )
  tl.fromTo(
    bars,
    { "--played": 0 },
    { "--played": 1, duration: 0.08, stagger: play / bars.length, immediateRender: false },
    start,
  )
  REGIONS.forEach((r, i) => {
    const at = start + r.start * play
    const from = Math.floor(r.start * bars.length)
    const span = bars.slice(from, Math.ceil(r.end * bars.length))
    tl.set(q(`[data-region="${i}"]`), { attr: { "data-s": "done" } }, at)
    tl.to(span, { scaleY: (k: number) => revoiced(from + k), duration: 0.25, stagger: 0.012, ease: "power2.out" }, at)
    tl.set(span, { attr: { "data-re": "" } }, at)
    swap(tl, marks[i], at)
    flash(tl, side, r.entity, at)
  })
  return tl
}

// ── the mock ───────────────────────────────────────────────────

// Lane timelines are written in "story" seconds; SPEED plays them faster. Each lane holds its finished
// state for about a second before the next tab takes over.
const SPEED = 1.45

const LANES = [
  { name: "Text", file: "clinical_notes.csv", seconds: 7, Lane: TextLane, build: buildText },
  { name: "PDF", file: "lab_requisition.pdf", seconds: 8.4, Lane: PdfLane, build: buildPdf },
  { name: "Image", file: "clinical_photo.png", seconds: 7, Lane: ImageLane, build: buildImage },
  { name: "Audio", file: "voicemail.mp3", seconds: 8, Lane: AudioLane, build: buildAudio, soon: true },
]

/** Plays the lane only while the mock is on screen and not under the pointer. */
function sync(tl: RefObject<gsap.core.Timeline | null>, visible: boolean, hovering: boolean) {
  if (visible && !hovering) tl.current?.play()
  else tl.current?.pause()
}

/**
 * One patient through every lane. Each tab fills while its lane plays, then hands over to the next;
 * the finished tabs stay filled, so the row fills up once per round. It pauses under the pointer and off screen; with reduced motion
 * each lane is shown finished and the tabs are left to the reader.
 */
export function MaskMock() {
  const [lane, setLane] = useState(0)
  // Bumped by a tab click so choosing the current lane replays it.
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
    // The persona map outlives the lanes, and overlapping flashes don't always revert to dark.
    const darken = () => map.querySelectorAll<HTMLElement>(".glow").forEach((g) => g.style.removeProperty("opacity"))
    const ctx = gsap.context(() => {
      const { seconds, build } = LANES[lane]
      const content = build(stage.current!, map)
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        content.progress(1, false)
        darken()
        gsap.set(bars.current, { scaleX: (i: number) => (i <= lane ? 1 : 0) })
        return
      }
      gsap.set(bars.current, { scaleX: (i: number) => (i < lane ? 1 : 0) })
      timeline.current = gsap
        .timeline({ paused: true, onComplete: () => setLane((l) => (l + 1) % LANES.length) })
        .add(content, 0)
        .fromTo(
          bars.current[lane],
          { scaleX: 0 },
          { scaleX: 1, duration: seconds, ease: "none", immediateRender: false },
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
  }, [lane, round])

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

  const { Lane } = LANES[lane]

  return (
    <div
      className="mock"
      ref={root}
      role="group"
      aria-label="One patient masked across text, PDF, image and audio"
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
            <span>record</span>
            <span>{PATIENT.id}</span>
          </div>
          <div className="who">
            <span className="dot" />
            <span>
              <strong>{PATIENT.name}</strong>
              <small>
                {PATIENT.mrn} · {PATIENT.about}
              </small>
            </span>
          </div>
          <div className="who">
            <span className="dot hollow" />
            <span>
              <strong>{PATIENT.persona}</strong>
              <small>persona · dates {PATIENT.shift}</small>
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
        <div className="lanes" role="tablist">
          {LANES.map((l, i) => (
            <button
              key={l.name}
              type="button"
              role="tab"
              aria-selected={i === lane}
              data-state={i < lane ? "done" : i === lane ? "active" : "todo"}
              onClick={() => {
                setLane(i)
                setRound((r) => r + 1)
              }}
            >
              <span className="lane-name">
                {l.name}
                {l.soon && <em>soon</em>}
              </span>
              <small>{l.file}</small>
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
        <div className="stage" ref={stage} role="tabpanel" key={`${lane}-${round}`}>
          <Lane />
        </div>
      </section>
    </div>
  )
}
