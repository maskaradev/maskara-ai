import { NextResponse, type NextRequest } from "next/server"

import { hostedAppEnabled } from "@/lib/hosted-app"
import { WAITLIST_PATH } from "@/lib/waitlist"

/**
 * maskara.dev (and www) serves the landing page and app.maskara.dev serves the app, from one deployment.
 * `localhost` behaves like the apex in development, so the app runs at app.localhost.
 * Any other host (preview deployments, 127.0.0.1) is treated as the app.
 *
 * Outside `next dev` the app is off unless MASKARA_HOSTED_APP=1 (see lib/hosted-app.ts). The app host then
 * serves the showroom at `/`: the static demo in public/demo (written by `maskara ui --export web/public/demo`,
 * precomputed on synthetic sample data, no server-side processing). Everything else on it, API routes
 * included, redirects to the landing page, and any other host serves the landing page itself, so previews
 * still show it.
 *
 * www is served as-is rather than redirected: which of apex and www is canonical is set in the
 * Vercel domain settings, and redirecting here as well would loop if the two disagreed.
 */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "maskara.dev"
const SITE_HOSTS = new Set([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`, "localhost"])
const APP_HOSTS = new Set([`app.${ROOT_DOMAIN}`, "app.localhost"])
const DEMO_PAGE = "/demo/index.html"

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone()
  // Redirects are built from the Host the browser asked for, port included.
  const [hostname, port = ""] = (request.headers.get("host") ?? url.host).split(":")
  url.hostname = hostname
  url.port = port

  // The landing page's waitlist form posts here, on whichever host served the page.
  if (url.pathname === WAITLIST_PATH) return NextResponse.next()

  const appOn = hostedAppEnabled()
  if (SITE_HOSTS.has(hostname) || (!appOn && !APP_HOSTS.has(hostname))) {
    if (url.pathname === "/") return NextResponse.next()
    if (appOn) {
      // The landing page is a single route; everything else (old bookmarks, API calls) belongs to the app.
      url.hostname = hostname === "localhost" ? "app.localhost" : `app.${ROOT_DOMAIN}`
    } else {
      url.pathname = "/"
      url.search = ""
    }
    return NextResponse.redirect(url)
  }

  if (!appOn) {
    // The demo's page is one self-contained file, so serving it at `/` needs no other path through here.
    if (url.pathname === "/") return NextResponse.rewrite(new URL(DEMO_PAGE, request.url))
    url.hostname = hostname === "app.localhost" ? "localhost" : ROOT_DOMAIN
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  if (url.pathname === "/") {
    url.pathname = "/home"
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // Skip build output and files with an extension (icons, OG images, public/ samples).
  matcher: ["/((?!_next/|.*\\.[\\w]+$).*)"],
}
