"use client"

import { Check, Sparkles, Target, X } from "lucide-react"
import { useState } from "react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMessages } from "@/lib/i18n"

/** What the de-identified data is for; steers the AI's role decisions. */
export type Goal = { tags: string[]; text: string }

const MAX_TAGS = 12

export const hasGoal = (goal: Goal) => goal.tags.length > 0 || goal.text.trim() !== ""

const CHIP = "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] transition-colors"
const CHIP_ON = "border-foreground bg-foreground text-background"

export function AiGoalDialog({
  open,
  onOpenChange,
  goal,
  onChange,
  onRun,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: Goal
  onChange: (goal: Goal) => void
  onRun: () => void
}) {
  const t = useMessages().newJob
  const [draft, setDraft] = useState("")
  const custom = goal.tags.filter((tag) => !t.goalPresets.includes(tag))

  const toggle = (tag: string) =>
    onChange({ ...goal, tags: goal.tags.includes(tag) ? goal.tags.filter((x) => x !== tag) : [...goal.tags, tag].slice(0, MAX_TAGS) })

  const addTag = (raw: string) => {
    const tag = raw.replace(/,$/, "").trim()
    if (tag && !goal.tags.includes(tag) && goal.tags.length < MAX_TAGS) onChange({ ...goal, tags: [...goal.tags, tag] })
    setDraft("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Target className="size-4" />
            {t.goalTitle}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">{t.goalHint}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium text-muted-foreground">{t.goalTags}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {t.goalPresets.map((tag) => {
              const on = goal.tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(tag)}
                  className={cn(CHIP, on ? CHIP_ON : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")}
                >
                  {on && <Check className="size-3" />}
                  {tag}
                </button>
              )
            })}
            {custom.map((tag) => (
              <span key={tag} className={cn(CHIP, CHIP_ON, "pr-1.5")}>
                #{tag}
                <button type="button" aria-label={t.removeTag(tag)} onClick={() => toggle(tag)} className="rounded-full p-0.5 hover:bg-background/20">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={draft}
              onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value) : setDraft(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  addTag(draft)
                } else if (e.key === "Backspace" && !draft && custom.length) {
                  toggle(custom[custom.length - 1])
                }
              }}
              onBlur={() => addTag(draft)}
              placeholder={t.goalAddTag}
              className="h-7 w-28 rounded-full border border-dashed border-border bg-transparent px-2.5 text-[12px] outline-none placeholder:text-muted-foreground focus:w-40 focus:border-solid focus:border-foreground/40"
            />
          </div>
        </div>

        <textarea
          autoFocus
          rows={4}
          value={goal.text}
          maxLength={2000}
          onChange={(e) => onChange({ ...goal, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onRun()
            }
          }}
          placeholder={t.goalPlaceholder}
          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-[11.5px] text-muted-foreground">{t.autoDetectHint}</p>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t.cancel}
            </Button>
            <Button onClick={onRun} data-tour="ai-start">
              <Sparkles />
              {t.goalRun}
              <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 font-sans text-[10.5px]">{t.goalShortcut}</kbd>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Compact read-only summary of the goal the last AI decision used. */
export function GoalSummary({ goal }: { goal: Goal }) {
  const t = useMessages().newJob
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
      <Target className="size-3.5 shrink-0" />
      <span className="font-medium text-foreground">{t.goalUsed}</span>
      {goal.tags.map((tag) => (
        <span key={tag} className="rounded-full border px-2 py-px">
          {tag}
        </span>
      ))}
      {goal.text.trim() && (
        <span className="max-w-xl truncate" title={goal.text}>
          “{goal.text.trim()}”
        </span>
      )}
    </div>
  )
}
