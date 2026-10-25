import { z } from "zod"

import { HONEYPOT_FIELD, WAITLIST_LIMITS } from "@/lib/waitlist"

// The team/on-prem waitlist: the only thing the site collects. Each signup is forwarded to
// WAITLIST_WEBHOOK_URL and nothing is stored here.

const MAX_BODY = 4_000
const TIMEOUT_MS = 10_000

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => s || undefined)

const WaitlistSchema = z.object({
  email: z.string().trim().max(WAITLIST_LIMITS.email).pipe(z.email()),
  company: optional(WAITLIST_LIMITS.company),
  useCase: optional(WAITLIST_LIMITS.useCase),
  [HONEYPOT_FIELD]: z.string().optional(),
})

// Slack reads `<...>` as links and mentions, so user text is escaped before it goes into `text`.
const slackSafe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "")
  if (raw.length > MAX_BODY) return Response.json({ error: "Request is too large." }, { status: 413 })
  let json: unknown = null
  try {
    json = JSON.parse(raw)
  } catch {}
  const body = WaitlistSchema.safeParse(json)
  if (!body.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 })
  if (body.data[HONEYPOT_FIELD]) return Response.json({ ok: true })
  const { email, company, useCase } = body.data

  // Structured fields for Zapier, Apps Script and the like; `text` so a Slack incoming webhook can post it as is.
  const payload = {
    text: [
      `New waitlist signup: ${slackSafe(email)}`,
      company && `Company: ${slackSafe(company)}`,
      useCase && `Use case: ${slackSafe(useCase)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    email,
    company: company ?? null,
    useCase: useCase ?? null,
    submittedAt: new Date().toISOString(),
  }

  const webhook = process.env.WAITLIST_WEBHOOK_URL
  if (!webhook) {
    if (process.env.NODE_ENV === "development") {
      console.log("[waitlist] WAITLIST_WEBHOOK_URL is not set; signup not sent:", payload)
      return Response.json({ ok: true })
    }
    return Response.json({ error: "The waitlist isn't set up on this deployment." }, { status: 503 })
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`webhook returned ${res.status}`)
  } catch (error) {
    console.error("[waitlist] could not forward a signup:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Could not reach the waitlist right now." }, { status: 502 })
  }
  return Response.json({ ok: true })
}
