import type { ComponentType, SVGProps } from "react"

/** Anything that renders as an icon: a Carbon icon or one of ours below. */
export type IconType = ComponentType<{ className?: string }>

/**
 * Redaction: three lines of text with the middle one blacked out. Drawn on
 * Carbon's 32px grid with its 2px weight so it sits beside Carbon icons.
 */
export function Redact(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" width={16} height={16} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M4 7h24v2H4zM4 15h5v2H4zM11 12h17v8H11zM4 23h14v2H4z" />
    </svg>
  )
}
