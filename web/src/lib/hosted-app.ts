// The prototype app sends uploads to the Anthropic API and the GPU servers, so it isn't served outside
// `next dev` unless a deployment opts in with MASKARA_HOSTED_APP=1. Production and Vercel previews both
// build with NODE_ENV=production, so both are covered.

export function hostedAppEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.MASKARA_HOSTED_APP === "1"
}

/** For the app's API routes, in case a request gets past the proxy: a response to return, or null to go on. */
export function hostedAppOff(): Response | null {
  if (hostedAppEnabled()) return null
  return Response.json({ error: "The hosted app is turned off. Set MASKARA_HOSTED_APP=1 to enable it." }, { status: 403 })
}
