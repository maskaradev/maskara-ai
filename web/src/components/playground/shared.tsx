"use client"

import { Checkmark, WarningAlt } from "@carbon/icons-react"

import { useMessages } from "@/lib/i18n"
import type { MarkKind, ModelHost } from "@/lib/playground"
import { cn } from "@/lib/utils"

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`)

export const ms = (n: number) => (n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`)

const HOST_STYLE: Record<ModelHost, string> = {
  browser: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  gpu: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  api: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
}

export function HostBadge({ host }: { host: ModelHost }) {
  const m = useMessages().playground
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap", HOST_STYLE[host])}>{m.hosts[host]}</span>
}

/** A model the user can switch on or off for the next run. */
export function ModelToggle({
  name,
  body,
  host,
  checked,
  onChange,
  disabled,
}: {
  name: string
  body: string
  host: ModelHost
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors disabled:cursor-default",
        checked ? "border-foreground/25 bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
          checked && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {checked && <Checkmark className="size-3" />}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {name}
          <HostBadge host={host} />
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">{body}</span>
      </span>
    </button>
  )
}

export function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-700 dark:text-emerald-300",
          tone === "bad" && "text-red-600 dark:text-red-400",
          tone === "warn" && "text-amber-700 dark:text-amber-300",
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** Recall-style score coloured by how much would leak: green ≥ 95%, amber ≥ 80%, red below. */
export const scoreTone = (n: number | null | undefined) => (n === null || n === undefined ? undefined : n >= 0.95 ? "good" : n >= 0.8 ? "warn" : "bad")

export const MARK_STYLE: Record<MarkKind, string> = {
  hit: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  miss: "bg-red-500/15 text-red-800 underline decoration-red-500 decoration-wavy underline-offset-4 dark:text-red-200",
  false: "bg-amber-500/20 text-amber-900 dark:text-amber-200",
  extra: "bg-muted text-muted-foreground underline decoration-dashed underline-offset-4",
  found: "bg-sky-500/15 text-sky-900 dark:text-sky-200",
}

export function Legend({ kinds }: { kinds: MarkKind[] }) {
  const m = useMessages().playground.legend
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={cn("rounded px-1 font-mono text-[11px]", MARK_STYLE[k])}>abc</span>
          {m[k]}
        </span>
      ))}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
      <WarningAlt className="mt-px size-3.5 shrink-0" />
      <span className="break-words">{message}</span>
    </div>
  )
}

export function ComingSoon({ body }: { body: string }) {
  const m = useMessages().playground
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{m.soon}</span>
      <h3 className="text-sm font-semibold">{m.comingSoon.title}</h3>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}
