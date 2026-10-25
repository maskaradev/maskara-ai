import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"

import { DetectionSchema, type DetectRequest } from "@/lib/pii-schema"
import type { DetectedEntity } from "@/lib/types"

// MVP stand-in for the on-prem local LLM. Swap this module for a local model
// (e.g. vLLM) that returns the same DetectionSchema; nothing else changes.

const MODEL = "claude-opus-5-5"

const SYSTEM = `You find protected health information (PHI) in hospital text so it can be de-identified.

Return every span that identifies, or could help identify, a person:
- names of patients, relatives, friends, providers, staff and any other person (including partial names, initials and nicknames)
- every date or date fragment (birth, visit, procedure, event), and ages
- phone and fax numbers, email addresses, SSNs
- medical record numbers, insurance member IDs, account numbers, barcodes and other identifiers
- street addresses, street names, room numbers, cities and ZIP codes
- names of employers, schools, facilities, businesses and places

Do not return clinical content: diagnoses, medications, doses, vitals, lab values, ICD codes, department names, or generic words.
Do not return field labels or standard abbreviations on forms and printouts (e.g. "DOB", "MRN", "ADM", "ALG", "DNR", "Sex", "Age"); return the values next to them.

Rules for each entity:
- "text" must be copied exactly as it appears in the input (same case, spacing and punctuation) so it can be found by string search. Do not merge separate mentions; return each distinct surface form once.
- For PERSON, set "role" and "canonicalName" (the person's full name as best known from the text and the known-people list, without titles) and "relation" to the patient when stated (e.g. "daughter"). For other types set role, canonicalName and relation to null.
- Spoken numbers and emails in transcripts (e.g. "5 5 5, 0 1 0, 7 7 8 1", "peter dot jensen at example dot org") are PHONE / EMAIL entities.`

let client: Anthropic | null = null

export async function detectPii(req: DetectRequest): Promise<DetectedEntity[]> {
  const apiKey = process.env.MASKING_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("MASKING_ANTHROPIC_API_KEY is not set in .env.local.")
  client ??= new Anthropic({ apiKey })
  const known = [
    req.context.patientName ? `- Patient: ${req.context.patientName}` : "- Patient: unknown",
    req.context.providers.length ? `- Providers: ${req.context.providers.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n")
  const sourceNote = {
    clinical_text: "Clinical free text.",
    ocr: "OCR output from a scanned hospital document or printout. Lines may be uppercase or split oddly.",
    transcript: "Speech transcript. Lines may start with a speaker label like 'Name: ...'; speaker names are PERSON entities.",
  }[req.context.source]

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(DetectionSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Known people:\n${known}\n\nSource: ${sourceNote}\n\n<text>\n${req.text}\n</text>`,
      },
    ],
  })

  if (response.stop_reason === "refusal") throw new Error("The model declined this request.")
  if (response.stop_reason === "max_tokens") throw new Error("The response was cut off (max_tokens).")
  if (!response.parsed_output) throw new Error("The model returned no parseable output.")
  return response.parsed_output.entities
}
