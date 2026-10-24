import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"

import { ROLES } from "@/lib/roles"
import type { ColumnRole } from "@/lib/types"

// MVP stand-in for the on-prem local LLM, like anthropic-detector.ts: picks each column's role
// from its name and a few sample values.

const MODEL = "claude-opus-5-5"

const SYSTEM = `You set up de-identification of hospital tables. For every column, choose the role that tells the masking pipeline how to treat it.

Roles:
- keep: not identifying on its own (clinical codes, departments, diagnoses, categories, US state, flags, counts, media type labels)
- person_key: the column that links rows to one person across tables (e.g. patient_id)
- name: a patient's or other non-staff person's name
- sex: sex or gender
- dob: date of birth
- date: any other date or timestamp (visits, encounters, procedures)
- ssn: social security number
- phone: phone or fax number
- email: email address
- street: street address
- city: city, or any other place or region column that must be masked (replaced by a synthetic place name)
- zip: numeric ZIP or postal code only
- id: any other identifier (MRN, insurance member ID, account, record or note IDs)
- provider: a clinician's or staff member's name (physician, author, attending)
- free_text: narrative text that may mention people, dates or places (notes, comments)
- transcript: a speech or audio transcript
- image: a file path to an image or PDF
- audio: a file path to an audio recording

The user may say what the de-identified data is for (goal tags and/or a free-text goal). Use the goal to decide borderline columns, and when the goal affected a choice, say so in the reason. The goal never makes a direct identifier "keep": the pipeline already preserves analytic signal (dates shift by one consistent offset per person so intervals and ages survive, names become consistent personas, person keys stay linkable), so give identifiers their identifier role and mention the preserved signal when relevant. The goal does decide quasi-identifiers: e.g. for external sharing, treat columns that narrow down a person (state, small geographic units, rare categories) more strictly; for internal model training, keep non-identifying signal the goal needs.

Return one entry for every column in the input, with the table and column names copied exactly. "reason" is one short phrase (max 12 words) in the requested language explaining the choice.`

export const InferRolesRequestSchema = z.object({
  locale: z.enum(["en", "ko"]),
  goal: z.object({ tags: z.array(z.string().max(60)).max(12), text: z.string().max(2000) }).optional(),
  tables: z
    .array(
      z.object({
        name: z.string().max(200),
        columns: z.array(z.object({ name: z.string().max(200), samples: z.array(z.string().max(200)).max(5) })).max(100),
      }),
    )
    .min(1)
    .max(20),
})

export type InferRolesRequest = z.infer<typeof InferRolesRequestSchema>

const InferRolesSchema = z.object({
  columns: z.array(z.object({ table: z.string(), column: z.string(), role: z.enum(ROLES as [ColumnRole, ...ColumnRole[]]), reason: z.string() })),
})

export type InferredRole = z.infer<typeof InferRolesSchema>["columns"][number]

let client: Anthropic | null = null

export async function inferColumnRoles(req: InferRolesRequest): Promise<InferredRole[]> {
  const apiKey = process.env.MASKING_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("MASKING_ANTHROPIC_API_KEY is not set in .env.local.")
  client ??= new Anthropic({ apiKey })

  const tables = req.tables
    .map((t) => [`<table name="${t.name}">`, ...t.columns.map((c) => `- ${c.name}: ${JSON.stringify(c.samples)}`), "</table>"].join("\n"))
    .join("\n\n")

  const goal = [
    req.goal?.tags.length ? `Goal tags: ${req.goal.tags.join(", ")}` : null,
    req.goal?.text.trim() ? `Goal:\n<goal>\n${req.goal.text.trim()}\n</goal>` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(InferRolesSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Reason language: ${req.locale === "ko" ? "Korean" : "English"}\n${goal || "No goal given."}\n\nColumns with sample values:\n\n${tables}`,
      },
    ],
  })

  if (response.stop_reason === "refusal") throw new Error("The model declined this request.")
  if (response.stop_reason === "max_tokens") throw new Error("The response was cut off (max_tokens).")
  if (!response.parsed_output) throw new Error("The model returned no parseable output.")
  return response.parsed_output.columns
}
