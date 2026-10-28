import type { ComponentType } from "react"

/** Anything that renders as an icon: a Carbon icon or one of ours. */
export type IconType = ComponentType<{ className?: string }>
