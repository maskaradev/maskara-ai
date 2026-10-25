import { NextResponse, type NextRequest } from "next/server"

import { WAITLIST_PATH } from "@/lib/waitlist"

/**
 * One deployment, two hosts:
 * - maskara.dev (and www) serves the landing page at `/` and the waitlist's POST /api/waitlist; any other path
 *   redirects to `/`. Any other host (preview deployments, 127.0.0.1) behaves the same, and so does `localhost`
 *   in development.
 * - app.maskara.dev (app.localhost in development) serves the showroom: the static demo in public/demo, written
 *   by `maskara ui --export web/public/demo` from synthetic sample data, with no server-side processing. `/`
 *   shows its page, `/demo/*` is its files, and anything else redirects to the landing page.
 *
 * www is served as-is rather than redirected: which of apex and www is canonical is set in the Vercel domain
 * settings, and redirecting here as well would loop if the two disagreed.
 */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "maskara.dev"
const APP_HOSTS = new Set([`app.${ROOT_DOMAIN}`, "app.localhost"])
const DEMO_PAGE = "/demo/index.html"

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone()
  // Redirects are built from the Host the browser asked for, port included.
  const [hostname, port = ""] = (request.headers.get("host") ?? url.host).split(":")
  url.hostname = hostname
  url.port = port
  const { pathname } = url

  if (APP_HOSTS.has(hostname)) {
    // The demo's page is one self-contained file that loads its bundle from /demo/.
    if (pathname === "/") return NextResponse.rewrite(new URL(DEMO_PAGE, request.url))
    if (pathname.startsWith("/demo/")) return NextResponse.next()
    url.hostname = hostname === "app.localhost" ? "localhost" : ROOT_DOMAIN
  } else if (pathname === "/" || pathname === WAITLIST_PATH) {
    return NextResponse.next()
  }
  url.pathname = "/"
  url.search = ""
  return NextResponse.redirect(url)
}

export const config = {
  // Skip build output and files with an extension (icons, OG images, landing images, the demo's files).
  matcher: ["/((?!_next/|.*\\.[\\w]+$).*)"],
}
