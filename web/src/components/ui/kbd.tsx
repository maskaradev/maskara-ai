import * as React from "react"
import { cn } from "cn"

/** Keyboard key hint, drawn as a keycap: a hairline border with a heavier, darker bottom edge. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-0.5 rounded-[5px] border border-b-2 border-border border-b-foreground/20 bg-background px-1 font-sans text-[11px] leading-none font-medium text-muted-foreground tabular-nums select-none [&_svg:not([class*='size-'])]:size-3 dark:border-white/10 dark:border-b-black/60 dark:bg-muted",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
