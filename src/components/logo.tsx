import type { SVGProps } from "react"

/** Mascara wand: a stem with equal-length bristles alternating above and below. */
export const LOGO_PATH = "M1.5 12h21M3.5 12V5M7 12v7M10.5 12V5M14 12v7M17.5 12V5M20.5 12v7"
export const LOGO_STROKE = 3

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={LOGO_STROKE}
      strokeLinecap="square"
      aria-hidden="true"
      {...props}
    >
      <path d={LOGO_PATH} />
    </svg>
  )
}
