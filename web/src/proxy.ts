import { NextResponse, type NextRequest } from "next/server"

import { WAITLIST_PATH } from "@/lib/waitlist"

/**
 * One deployment, two hosts:
 * - maskara.dev (and www) serves the landing page at `/` and the waitlist's POST /api/waitlist. An app path
 *   redirects to the same path on the app host, and anything else to `/`. `localhost` does the same in
 *   development, redirecting app paths to app.localhost.
 * - app.maskara.dev (app.localhost in development) serves the app: a sidebar over one precomputed run on the
 *   bundled synthetic sample data (public/demo/bundle.json, written by `maskara ui --export web/public/demo`).
 *   Every page is prerendered from it, so nothing is processed server-side and nothing is uploaded. `/` opens
 *   /home, and anything that isn't an app path redirects to the landing page.
 * - Any other host (preview deployments, 127.0.0.1) serves both: the landing page at `/` and the app paths
 *   as they are, so a preview shows everything.
 *
 * www is served as-is rather than redirected: which of apex and www is canonical is set in the Vercel domain
 * settings, and redirecting here as well would loop if the two disagreed.
 */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "maskara.dev"
const SITE_HOSTS = new Set([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`, "localhost"])
const APP_HOSTS = new Set([`app.${ROOT_DOMAIN}`, "app.localhost"])
const APP_HOME = "/home"
const APP_SECTIONS = ["/home", "/datasets", "/personas", "/report", "/benchmarks", "/get-started"]

const isAppPath = (pathname: string) =>
  APP_SECTIONS.some((s) => pathname === s || pathname.startsWith(s + "/")) || pathname.startsWith("/demo/")

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone()
  // Redirects are built from the Host the browser asked for, port included.
  const [hostname, port = ""] = (request.headers.get("host") ?? url.host).split(":")
  url.hostname = hostname
  url.port = port
  const { pathname } = url

  if (APP_HOSTS.has(hostname)) {
    if (isAppPath(pathname)) return NextResponse.next()
    if (pathname === "/") {
      url.pathname = APP_HOME
      return NextResponse.redirect(url)
    }
    url.hostname = hostname === "app.localhost" ? "localhost" : ROOT_DOMAIN
  } else if (pathname === "/" || pathname === WAITLIST_PATH) {
    return NextResponse.next()
  } else if (isAppPath(pathname)) {
    if (!SITE_HOSTS.has(hostname)) return NextResponse.next()
    url.hostname = hostname === "localhost" ? "app.localhost" : `app.${ROOT_DOMAIN}`
    return NextResponse.redirect(url)
  }
  url.pathname = "/"
  url.search = ""
  return NextResponse.redirect(url)
}

export const config = {
  // Skip build output and files with an extension (icons, OG images, landing images, the demo's files).
  matcher: ["/((?!_next/|.*\\.[\\w]+$).*)"],
}
