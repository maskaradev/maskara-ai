import type { SVGProps } from "react"

/**
 * Mascara wand: a thick handle, then a stem through a pine-cone brush whose
 * bristles swell near the handle and taper to the tip.
 */
const LOGO_PATH = "M1 12h21.5M1 10.75h5v2.5H1zM9 6.5v11M12 4.5v15M15 5v14M18 6.5v11M21 9v6"
const LOGO_STROKE = 2

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={LOGO_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={LOGO_PATH} />
    </svg>
  )
}
