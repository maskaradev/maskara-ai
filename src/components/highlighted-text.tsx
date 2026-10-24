"use client"

import { useMessages } from "@/lib/i18n"
import type { Segment } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Renders masked text with replaced spans highlighted, or the original with PII highlighted. */
export function HighlightedText({ segments, mode, className }: { segments: Segment[]; mode: "masked" | "original"; className?: string }) {
  const m = useMessages()
  return (
    <p className={cn("text-[13px] leading-relaxed whitespace-pre-wrap", className)}>
      {segments.map((s, i) =>
        s.entity ? (
          <mark
            key={i}
            title={mode === "masked" ? m.results.was(s.entity.type, s.entity.original) : s.entity.type}
            className={cn(
              "rounded px-0.5 text-inherit",
              mode === "masked"
                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                : "bg-red-500/15 text-red-800 dark:text-red-200",
            )}
          >
            {mode === "masked" ? s.text : s.entity.original}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  )
}
