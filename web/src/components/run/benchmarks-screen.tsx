"use client"

import { useState } from "react"

import { PageHeader } from "@/components/page-header"
import { CopyCommand, PageIntro, Rich, Section } from "@/components/run/shared"
import { useMessages } from "@/lib/i18n"
import { BENCH_DATE, CORPUS_LABEL, CORPUS_URL, EXTERNAL, LINKED, SYSTEM_ORDER, isMaskara, type BenchCorpus } from "@/lib/bench"
import { pct } from "@/lib/run"
import { cn } from "@/lib/utils"

const REPRODUCE = [
  "uv sync --all-extras --all-groups",
  "uv run maskara bench --corpus abcd nemotron-pii tab --system oracle-redact presidio-redact gliner2-redact opf-redact presidio-fake-consistent maskara-gliner2 maskara-gliner2+echr",
]

const sorted = (c: BenchCorpus) =>
  [...c.points].sort((a, b) => SYSTEM_ORDER.indexOf(a.system) - SYSTEM_ORDER.indexOf(b.system))

// Plot geometry: x is direct identifiers hidden (1 − leak), y is distinctness.
const W = 320
const H = 240
const PAD = { l: 40, r: 14, t: 18, b: 34 }
const X0 = 0.4
const x = (v: number) => PAD.l + ((v - X0) / (1 - X0)) * (W - PAD.l - PAD.r)
const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b)

function Scatter({ corpus }: { corpus: BenchCorpus }) {
  const m = useMessages().benchmarks
  const [hover, setHover] = useState<string | null>(null)
  const points = sorted(corpus)
  const active = points.find((p) => p.system === hover)

  return (
    <figure className="relative flex flex-col gap-2 rounded-xl border bg-card p-3">
      <figcaption className="flex items-baseline justify-between gap-2 px-1">
        <a href={CORPUS_URL[corpus.corpus]} className="text-sm font-medium underline-offset-2 hover:underline">
          {CORPUS_LABEL[corpus.corpus] ?? corpus.corpus}
        </a>
        <span className="text-[11px] text-muted-foreground">{m.docs(corpus.documents)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${CORPUS_LABEL[corpus.corpus]}: ${m.chartTitle}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
              {t * 100}%
            </text>
          </g>
        ))}
        {[0.4, 0.6, 0.8, 1].map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - PAD.b + 13} textAnchor="middle" className="fill-muted-foreground text-[9px]">
            {Math.round(t * 100)}%
          </text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          {m.hidden} →
        </text>
        <text transform={`translate(10 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          {m.distinct} →
        </text>
        {/* Others first so maskara's dots draw on top. */}
        {[...points.filter((p) => !isMaskara(p.system)), ...points.filter((p) => isMaskara(p.system))].map((p) => {
          const mk = isMaskara(p.system)
          const cx = x(Math.max(X0, 1 - p.direct_leak))
          const cy = y(p.distinctness)
          return (
            <g key={p.system} onMouseEnter={() => setHover(p.system)} onMouseLeave={() => setHover(null)} className="cursor-default">
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={hover === p.system ? 6.5 : 5}
                strokeWidth={2}
                className={cn("stroke-card", mk ? "fill-[#2a78d6] dark:fill-[#3987e5]" : "fill-muted-foreground/70")}
              />
              {mk && (
                <text
                  x={cx - 8}
                  y={p.system.endsWith("echr") || cy < PAD.t + 4 ? cy + 15 : cy - 9}
                  textAnchor="end"
                  className="fill-foreground text-[9px] font-medium"
                >
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {active && (
        <div className="pointer-events-none absolute top-12 left-14 z-10 w-56 rounded-lg border bg-popover p-2.5 text-xs shadow-lg">
          <p className="mb-1.5 font-medium">{m.labels[active.system] ?? active.label}</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
            <dt className="text-muted-foreground">{m.leak}</dt>
            <dd className="font-mono">{pct(active.direct_leak)}</dd>
            <dt className="text-muted-foreground">{m.distinctCol}</dt>
            <dd className="font-mono">{pct(active.distinctness)}</dd>
            <dt className="text-muted-foreground">{m.consistent}</dt>
            <dd className="font-mono">{pct(active.consistency)}</dd>
          </dl>
        </div>
      )}
    </figure>
  )
}

function Legend() {
  const m = useMessages().benchmarks
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" />
        maskara
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/70" />
        {m.others}
      </span>
    </div>
  )
}

export function BenchmarksScreen() {
  const m = useMessages().benchmarks
  const corpora = EXTERNAL
  const systems = SYSTEM_ORDER.filter((s) => corpora.some((c) => c.points.some((p) => p.system === s)))
  const cell = "px-3 py-2"

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail]} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-8">
        <PageIntro title={m.title} description={<Rich text={m.description} />} />

        <Section title={m.chartTitle} action={<Legend />}>
          <p className="-mt-2 text-xs text-muted-foreground">{m.chartHint}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {corpora.map((c) => (
              <Scatter key={c.corpus} corpus={c} />
            ))}
          </div>
        </Section>

        <Section title={m.tableTitle}>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50 text-left text-xs">
                <tr>
                  <th className={cn(cell, "font-medium")}>{m.system}</th>
                  {corpora.map((c) => (
                    <th key={c.corpus} className={cn(cell, "font-medium whitespace-nowrap")}>
                      {CORPUS_LABEL[c.corpus]}
                      <span className="ml-1.5 font-normal text-muted-foreground">{m.docs(c.documents)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {systems.map((s) => (
                  <tr key={s} className={cn("border-t", isMaskara(s) && "bg-[#2a78d6]/[0.06] font-medium")}>
                    <td className={cell}>{m.labels[s] ?? s}</td>
                    {corpora.map((c) => {
                      const p = c.points.find((x) => x.system === s)
                      return (
                        <td key={c.corpus} className={cn(cell, "font-mono text-xs whitespace-nowrap tabular-nums")}>
                          {p ? (
                            <>
                              {pct(p.direct_leak)} <span className="text-muted-foreground">/</span> {pct(p.distinctness)}{" "}
                              <span className="text-muted-foreground">/</span> {pct(p.consistency)}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[13px] leading-relaxed text-muted-foreground">
            {m.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Section>

        <Section title={m.linkedTitle}>
          <p className="-mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{m.linkedBody}</p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50 text-left text-xs">
                <tr>
                  <th className={cn(cell, "font-medium")}>{m.system}</th>
                  <th className={cn(cell, "text-right font-medium")}>{m.leak}</th>
                  <th className={cn(cell, "text-right font-medium")}>{m.consistent}</th>
                  <th className={cn(cell, "text-right font-medium")}>{m.distinctCol}</th>
                </tr>
              </thead>
              <tbody>
                {LINKED.rows.map((r) => (
                  <tr key={r.label} className={cn("border-t", r.maskara && "bg-[#2a78d6]/[0.06] font-medium")}>
                    <td className={cell}>{r.label}</td>
                    <td className={cn(cell, "text-right font-mono text-xs tabular-nums")}>{pct(r.directLeak)}</td>
                    <td className={cn(cell, "text-right font-mono text-xs tabular-nums")}>{pct(r.consistency)}</td>
                    <td className={cn(cell, "text-right font-mono text-xs tabular-nums")}>{pct(r.distinctness)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={m.reproduce}>
          <div className="flex flex-col items-start gap-2">
            {REPRODUCE.map((cmd) => (
              <CopyCommand key={cmd} command={cmd} className="w-full" />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{m.measuredOn(BENCH_DATE)}</p>
        </Section>
      </main>
    </div>
  )
}
