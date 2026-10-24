import { z } from "zod"

import { stripTitles } from "@/lib/mask"
import type { DetectRequest } from "@/lib/pii-schema"
import { detectFormFields, headingRole } from "@/lib/pii/form-fields"
import { mockDetect } from "@/lib/pipeline/mock-detector"
import type { DetectedEntity, EntityType } from "@/lib/types"

// On-prem PII detector: the in-house privacy-filter model (token classification on the GPU server)
// plus deterministic rules that cover what it doesn't label: values next to PII form labels
// (record numbers, ages, schools), and the patient and provider names known from the DB.
// Returns the same DetectedEntity shape as the Claude detector.

const DEFAULT_URL = "https://gx10-a4ea.tail0fa1f7.ts.net:8443/privacy-filter"
const TIMEOUT_MS = 30_000

const LABELS: Record<string, EntityType> = {
  private_person: "PERSON",
  private_email: "EMAIL",
  private_phone: "PHONE",
  private_address: "ADDRESS",
  private_url: "OTHER",
  private_date: "DATE",
  account_number: "ID_NUMBER",
  secret: "OTHER",
}

const INSTITUTION = /\b(hospital|health|clinic|medical|center|centre|network|school|college|university|pharmacy|care|laborator(y|ies)|labs?|institute|foundation|insurance)\b/i

const ResponseSchema = z.object({
  spans: z.array(z.object({ label: z.string(), start: z.number(), end: z.number(), text: z.string(), score: z.number() })),
})

export class PrivacyFilterError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function privacyFilter(text: string) {
  const base = (process.env.PRIVACY_FILTER_URL || DEFAULT_URL).replace(/\/+$/, "")
  let res: Response
  try {
    res = await fetch(`${base}/v1/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const cause = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error)
    throw new PrivacyFilterError(`Could not reach the privacy filter at ${base} (${cause}).`, 502)
  }
  const body = await res.text()
  if (!res.ok) throw new PrivacyFilterError(`Privacy filter error ${res.status}: ${body.slice(0, 300)}`, 502)
  const parsed = ResponseSchema.safeParse(JSON.parse(body))
  if (!parsed.success) throw new PrivacyFilterError("Unexpected privacy filter response.", 502)
  return parsed.data.spans
}

export async function detectPiiLocal(req: DetectRequest): Promise<DetectedEntity[]> {
  const spans = await privacyFilter(req.text)
  const providers = req.context.providers.map((p) => stripTitles(p).toLowerCase())
  const words = (name: string) => stripTitles(name).toLowerCase().split(/[^a-z']+/).filter(Boolean)
  const patient = req.context.patientName ? words(req.context.patientName) : []
  // Printouts write the patient surname first, often with sex or initials: "JENSEN, HAROLD M".
  const isPatient = (text: string) => patient.length > 1 && patient.every((w) => words(text).includes(w))

  const model: (DetectedEntity & { at: number })[] = spans.flatMap((s) => {
    const raw = req.text.slice(s.start, s.end)
    // Drop the " | " cell separators and label colons the OCR layout text adds around values.
    const text = raw.replace(/^[\s|:]+|[\s|:]+$/g, "")
    let type = LABELS[s.label] ?? "OTHER"
    // The model tags institution names without a label of their own; render them as one.
    if (type === "OTHER" && !/\d/.test(text) && INSTITUTION.test(text)) type = "ORGANIZATION"
    // Printed field abbreviations ("ALG", "ADM") are not names.
    if (!text || (type === "PERSON" && /^[A-Z]{1,4}$/.test(text))) return []
    return [{ text, type, role: null, canonicalName: null, relation: null, at: s.start + raw.indexOf(text) }]
  })
  const rules = detectFormFields(req.text).map((e) => ({ ...e, at: req.text.indexOf(e.text) }))
  const known = mockDetect(req.text, req.context).map((e) => ({ ...e, at: req.text.indexOf(e.text) }))

  // Rules and the DB dictionary know roles; for the rest, a title or the section heading decides.
  const byText = new Map<string, DetectedEntity>()
  for (const { at, ...e } of [...known, ...rules, ...model]) {
    const key = `${e.type}:${e.text}`
    if (byText.has(key)) continue
    if (e.type === "PERSON" && isPatient(e.text)) {
      e.role = "patient"
      e.canonicalName = req.context.patientName
    } else if (e.type === "PERSON" && !e.role) {
      const name = stripTitles(e.text).toLowerCase()
      e.role = /^dr\.?\s/i.test(e.text) || providers.includes(name) ? "provider" : headingRole(req.text, at)
    }
    // "DR A. BROOKS" is the known provider Alan Brooks: same surname, matching first initial.
    if (e.type === "PERSON" && e.role === "provider" && !e.canonicalName) {
      const w = words(e.text)
      e.canonicalName =
        req.context.providers.map(stripTitles).find((p) => {
          const pw = words(p)
          return pw.at(-1) === w.at(-1) && (w.length === 1 || pw[0][0] === w[0][0])
        }) ?? null
    }
    byText.set(key, e)
  }
  return [...byText.values()]
}
