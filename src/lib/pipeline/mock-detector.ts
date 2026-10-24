import { escapeRegExp, splitName, stripTitles } from "@/lib/mask"
import type { DetectedEntity, EntityType } from "@/lib/types"

// Stand-in for the LLM on the mock-up lanes (structured, free text, speech).
// It only knows the row's patient, the providers and a few regex patterns, so it
// misses relatives, places and spoken emails. The image lane uses the real detector.

const PATTERNS: [EntityType, RegExp][] = [
  ["EMAIL", /[\w.+-]+@[\w-]+\.[\w.]+/g],
  ["SSN", /\b\d{3}-\d{2}-\d{4}\b/g],
  ["PHONE", /\(?\b\d{3}\)?[-.\s]?\d{3}-\d{4}\b/g],
  ["PHONE", /\b\d(?:[ ,]+\d){9}\b/g],
  ["ID_NUMBER", /\bMRN[-\s]?\d{4,}\b/g],
  ["DATE", /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{1,2}\/\d{1,2}\b(?![/\d])/g],
  [
    "DATE",
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? \d{1,2}(?:, \d{4})?\b/g,
  ],
  ["AGE", /\b\d{2,3}-year-old\b/g],
]

export function mockDetect(text: string, known: { patientName: string | null; providers: string[] }): DetectedEntity[] {
  const out: DetectedEntity[] = []
  const add = (e: DetectedEntity) => out.push(e)

  for (const [type, re] of PATTERNS) {
    for (const m of text.matchAll(re)) add({ text: m[0], type, role: null, canonicalName: null, relation: null })
  }

  const people: { canonical: string; role: "patient" | "provider" }[] = [
    ...(known.patientName ? [{ canonical: known.patientName, role: "patient" as const }] : []),
    ...known.providers.map((p) => ({ canonical: stripTitles(p), role: "provider" as const })),
  ]
  for (const { canonical, role } of people) {
    const { first, last } = splitName(canonical)
    const forms = [
      canonical,
      `Dr. ${canonical}`,
      ...(last ? [`Dr. ${last}`, `Mr. ${last}`, `Mrs. ${last}`, `Ms. ${last}`] : []),
      ...(role === "patient" && first ? [first] : []),
    ]
    for (const form of forms) {
      if (new RegExp(`\\b${escapeRegExp(form)}\\b`).test(text)) {
        add({ text: form, type: "PERSON", role, canonicalName: canonical, relation: null })
      }
    }
  }
  return out
}
