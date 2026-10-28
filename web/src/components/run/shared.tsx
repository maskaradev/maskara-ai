"use client"

import { Checkmark, Copy, LogoGithub } from "@carbon/icons-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { INSTALL_COMMAND, REPO_URL, WAITLIST_URL } from "@/components/site/links"
import { useMessages } from "@/lib/i18n"
import { CATEGORY_DOT, categoryStyle, segments, type Mention } from "@/lib/run"
import { cn } from "@/lib/utils"

/** Says on every page that this is precomputed synthetic data, and how to run it for real. */
export function SampleBanner() {
  const m = useMessages().banner
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/40 px-4 py-3 text-[13px]">
      <p className="min-w-60 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">{m.title}</span> {m.body}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <CopyCommand command={INSTALL_COMMAND} />
        <Button size="sm" variant="outline" asChild>
          <a href={REPO_URL}>
            <LogoGithub />
            GitHub
          </a>
        </Button>
        <Button size="sm" asChild>
          <a href={WAITLIST_URL}>{m.waitlist}</a>
        </Button>
      </div>
    </div>
  )
}

export function CopyCommand({ command, className }: { command: string; className?: string }) {
  const m = useMessages().banner
  const [copied, setCopied] = useState(false)
  return (
    <span className={cn("inline-flex h-7 max-w-full items-center gap-2 rounded-lg border bg-background pr-1 pl-2.5 font-mono text-xs", className)}>
      <span className="text-muted-foreground select-none">$</span>
      <span className="truncate">{command}</span>
      <button
        type="button"
        aria-label={copied ? m.copied : m.copy}
        title={copied ? m.copied : m.copy}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() =>
          navigator.clipboard
            .writeText(command)
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            })
            .catch(() => {})
        }
      >
        {copied ? <Checkmark className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  )
}

/** Text with `code` spans. */
export function Rich({ text }: { text: string }) {
  return text.split("`").map((part, i) =>
    i % 2 ? (
      <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em] text-foreground">
        {part}
      </code>
    ) : (
      part
    ),
  )
}

export function PageIntro({ kicker, title, description, children }: {
  kicker?: string
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-3xl flex-col gap-2">
        {kicker && <p className="text-xs font-medium text-muted-foreground">{kicker}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function StatTile({ value, of, label, note, tone }: {
  value: React.ReactNode
  of?: string
  label: string
  note?: string
  tone?: "good" | "bad"
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums",
            tone === "bad" && "text-destructive",
          )}
        >
          {value}
        </span>
        {of && <span className="text-xs text-muted-foreground tabular-nums">{of}</span>}
      </span>
      <span className="text-xs leading-snug text-muted-foreground">{label}</span>
      {note && <span className="text-[11px] text-amber-700 dark:text-amber-300">{note}</span>}
    </div>
  )
}

export function Section({ title, action, children, className }: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button size="sm" variant="ghost" asChild>
      <Link href={href}>{children}</Link>
    </Button>
  )
}

export function CategoryDot({ category, className }: { category: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", CATEGORY_DOT[category] ?? "bg-muted-foreground", className)} />
}

export function CategoryLegend({ counts }: { counts: [string, number][] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {counts.map(([c, n]) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <CategoryDot category={c} />
          {c.toLowerCase()}
          <span className="font-mono tabular-nums text-foreground">{n}</span>
        </span>
      ))}
    </div>
  )
}

export function CategoryChip({ category, label, className }: { category: string | null; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10.5px] leading-none whitespace-nowrap", categoryStyle(category), className)}>
      {label}
    </span>
  )
}

export function OriginalsSwitch({ checked, onChange, available }: { checked: boolean; onChange: (v: boolean) => void; available: boolean }) {
  const m = useMessages().common
  if (!available) return <span className="text-xs text-muted-foreground">{m.noOriginals}</span>
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-transparent transition-colors",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "block size-3 rounded-full bg-background shadow-sm transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </button>
      {m.showOriginals}
    </label>
  )
}

/** What the hover card says about one replaced value. */
export type TipInfo = Pick<Mention, "category" | "label" | "detector" | "score" | "personaName" | "link" | "changed"> & {
  original?: string | null
}

/**
 * One hover card for every replaced value under `children`: elements carrying `data-m` are looked up in
 * `tips`. Cheaper than a tooltip per cell on a table of a few thousand cells.
 */
export function MentionTips({ tips, children, className }: { tips: Record<number, TipInfo>; children: React.ReactNode; className?: string }) {
  const m = useMessages().common
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const over = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-m]")
      root.querySelectorAll(".mention-hot").forEach((x) => x.classList.remove("mention-hot"))
      if (!el) return setTip(null)
      root.querySelectorAll(`[data-m="${el.dataset.m}"]`).forEach((x) => x.classList.add("mention-hot"))
      setTip({ id: Number(el.dataset.m), x: ev.clientX, y: ev.clientY })
    }
    const leave = () => setTip(null)
    root.addEventListener("mouseover", over)
    root.addEventListener("mouseleave", leave)
    return () => {
      root.removeEventListener("mouseover", over)
      root.removeEventListener("mouseleave", leave)
    }
  }, [])

  const info = tip ? tips[tip.id] : undefined
  return (
    <div ref={ref} className={className}>
      {children}
      {tip && info && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-72 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
          style={{
            left: Math.min(tip.x + 14, (typeof window === "undefined" ? 1e4 : window.innerWidth) - 300),
            top: tip.y + 18,
          }}
        >
          <div className="mb-2 flex items-center gap-2 font-medium">
            <CategoryDot category={info.category} />
            {info.category.toLowerCase()} · {info.label}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{m.detector}</dt>
            <dd className="font-mono">
              {info.detector}
              {info.score < 1 ? ` (${info.score})` : ""}
            </dd>
            <dt className="text-muted-foreground">{m.persona}</dt>
            <dd>{info.personaName ?? m.noPerson}</dd>
            {info.original != null && (
              <>
                <dt className="text-muted-foreground">{m.original}</dt>
                <dd className="break-words line-through decoration-muted-foreground/60">{info.original}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{m.foundBy}</dt>
            <dd>{m.links[info.link] ?? info.link}</dd>
          </dl>
          {!info.changed && <p className="mt-2 text-muted-foreground">{m.keptByPolicy}</p>}
        </div>
      )}
    </div>
  )
}

/** Text with its replaced spans marked, on the original or the masked side. */
export function MarkedText({ text, mentions, side, className }: {
  text: string
  mentions: Mention[]
  side: "before" | "after"
  className?: string
}) {
  return (
    <p className={cn("text-[13px] leading-relaxed whitespace-pre-wrap", className)}>
      {segments(text, mentions, side).map((s, i) =>
        s.mention ? (
          <mark
            key={i}
            data-m={s.mention.i}
            className={cn(
              "cursor-default rounded px-0.5 text-inherit [&.mention-hot]:ring-2 [&.mention-hot]:ring-ring",
              side === "before" ? "bg-red-500/12 text-red-900 dark:text-red-200" : categoryStyle(s.mention.category),
              !s.mention.changed && "opacity-60",
            )}
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  )
}

export function tipsFor(mentions: Mention[], showOriginal: boolean): Record<number, TipInfo> {
  return Object.fromEntries(mentions.map((x) => [x.i, { ...x, original: showOriginal ? x.original : null }]))
}

/** The original and masked text side by side, or the masked text alone when originals are hidden. */
export function TextCompare({ before, after, mentions, showBefore }: {
  before: string | null
  after: string
  mentions: Mention[]
  showBefore: boolean
}) {
  const m = useMessages()
  const replaced = mentions.filter((x) => x.changed).length
  const both = showBefore && before != null
  return (
    <MentionTips tips={tipsFor(mentions, showBefore)} className={cn("grid gap-3", both && "md:grid-cols-2")}>
      {both && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] p-4">
          <div className="mb-2 flex items-center justify-between text-[10px] font-semibold tracking-wide text-red-700 uppercase dark:text-red-300">
            {m.common.before}
            <span className="font-normal normal-case">{m.datasets.syntheticOriginal}</span>
          </div>
          <MarkedText text={before} mentions={mentions} side="before" />
        </div>
      )}
      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
          {m.common.after}
          <span className="font-normal normal-case">{m.common.replaced(replaced)}</span>
        </div>
        <MarkedText text={after} mentions={mentions} side="after" />
      </div>
    </MentionTips>
  )
}
