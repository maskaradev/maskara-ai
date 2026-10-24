import { NextResponse, type NextRequest } from "next/server"

/**
 * maskara.dev (and www) serves the landing page and app.maskara.dev serves the app, from one deployment.
 * `localhost` behaves like the apex in development, so the app runs at app.localhost.
 * Any other host (preview deployments, 127.0.0.1) is treated as the app.
 *
 * www is served as-is rather than redirected: which of apex and www is canonical is set in the
 * Vercel domain settings, and redirecting here as well would loop if the two disagreed.
 */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "maskara.dev"
const SITE_HOSTS = new Set([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`, "localhost"])

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone()
  // Redirects are built from the Host the browser asked for, port included.
  const [hostname, port = ""] = (request.headers.get("host") ?? url.host).split(":")
  url.hostname = hostname
  url.port = port

  if (SITE_HOSTS.has(hostname)) {
    if (url.pathname === "/") return NextResponse.next()
    // The landing page is a single route; everything else (old bookmarks, API calls) belongs to the app.
    url.hostname = hostname === "localhost" ? "app.localhost" : `app.${ROOT_DOMAIN}`
    return NextResponse.redirect(url)
  }

  if (url.pathname === "/") {
    url.pathname = "/datasets"
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // Skip build output and files with an extension (icons, OG images, public/ samples).
  matcher: ["/((?!_next/|.*\\.[\\w]+$).*)"],
}
