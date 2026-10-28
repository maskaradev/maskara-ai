"use client"

import Link from "next/link"

import { useMessages } from "@/lib/i18n"
import { initials, type Persona } from "@/lib/run"
import { cn } from "@/lib/utils"

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-xs font-semibold",
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

/** A persona with where it appears, linking to its page. */
export function PersonaCard({ persona: p, showOriginal }: { persona: Persona; showOriginal: boolean }) {
  const m = useMessages()
  return (
    <Link
      href={`/personas/${p.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40"
    >
      <Avatar name={p.name} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          {p.name}
          {showOriginal && p.original && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {m.personas.was} <s>{p.original}</s>
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {Object.entries(p.inputs)
            .map(([k, n]) => `${k} ${n}`)
            .join(" · ")}
        </span>
      </div>
    </Link>
  )
}
