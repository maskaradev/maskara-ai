import type { ColumnRole, Row } from "@/lib/types"

export const ROLES: ColumnRole[] = [
  "keep", "person_key", "name", "sex", "dob", "date", "ssn", "phone", "email", "street", "city", "zip", "id", "provider",
  "free_text", "transcript", "image", "audio",
]

/** What the pipeline does to a column of each role; shown next to the role in every selector. */
export type Treatment = "kept" | "pseudonymized" | "persona" | "date_shifted" | "synthesized" | "ai_redacted"

export const ROLE_TREATMENT: Record<ColumnRole, Treatment> = {
  keep: "kept",
  sex: "kept",
  person_key: "pseudonymized",
  id: "pseudonymized",
  name: "persona",
  provider: "persona",
  dob: "date_shifted",
  date: "date_shifted",
  ssn: "synthesized",
  phone: "synthesized",
  email: "synthesized",
  street: "synthesized",
  city: "synthesized",
  zip: "synthesized",
  free_text: "ai_redacted",
  transcript: "ai_redacted",
  image: "ai_redacted",
  audio: "ai_redacted",
}

/** Treatments in selector order; the column selector offers these, not the roles behind them. */
export const TREATMENTS: Treatment[] = ["kept", "pseudonymized", "persona", "date_shifted", "synthesized", "ai_redacted"]

const TREATMENT_DEFAULT: Record<Treatment, ColumnRole> = {
  kept: "keep",
  pseudonymized: "id",
  persona: "name",
  date_shifted: "date",
  synthesized: "street",
  ai_redacted: "free_text",
}

/**
 * Role behind a treatment picked for a column: the current role if it already has that treatment,
 * then the role detected from the column name and values, then a value sniff, then the default.
 */
export function roleForTreatment(treatment: Treatment, column: string, rows: Row[], current: ColumnRole): ColumnRole {
  if (ROLE_TREATMENT[current] === treatment) return current
  const detected = inferRole(column, rows)
  if (ROLE_TREATMENT[detected] === treatment) return detected
  if (treatment === "synthesized") {
    const values = rows.map((r) => r[column] ?? "").filter(Boolean).slice(0, 50)
    const all = (re: RegExp) => values.length > 0 && values.every((v) => re.test(v))
    if (all(/^\d{5}(-\d{4})?$/)) return "zip"
    if (all(/^\+?[\d\s().-]{7,}$/)) return "phone"
  }
  return TREATMENT_DEFAULT[treatment]
}

// Roles whose original values must not survive masking.
export const SENSITIVE_ROLES: ColumnRole[] = [
  "person_key", "name", "dob", "date", "ssn", "phone", "email", "street", "city", "zip", "id", "provider",
]

// PDFs share the image role; the pipeline routes them to the document lane by extension.
const MEDIA_IMAGE = /\.(png|jpe?g|webp|gif|pdf)$/i
const MEDIA_AUDIO = /\.(mp3|wav|m4a|ogg)$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

export function inferRole(column: string, rows: Row[]): ColumnRole {
  const h = column.toLowerCase()
  const values = rows.map((r) => r[column] ?? "").filter(Boolean).slice(0, 50)
  const all = (re: RegExp) => values.length > 0 && values.every((v) => re.test(v))
  const avgLen = values.reduce((n, v) => n + v.length, 0) / Math.max(values.length, 1)

  if (all(MEDIA_IMAGE)) return "image"
  if (all(MEDIA_AUDIO)) return "audio"
  if (/transcript/.test(h)) return "transcript"
  if (/^(patient|person|subject|customer)_?id$/.test(h)) return "person_key"
  if (/(^|_)(full_?name|patient_?name|first_?name|last_?name|name)$/.test(h)) return "name"
  if (/^(sex|gender)$/.test(h)) return "sex"
  if (/(^dob$|date_?of_?birth|birth_?date)/.test(h)) return "dob"
  if (/(ssn|social_?security)/.test(h) || all(/^\d{3}-\d{2}-\d{4}$/)) return "ssn"
  if (/(phone|mobile|fax|tel)/.test(h)) return "phone"
  if (/e-?mail/.test(h) || all(/@/)) return "email"
  if (/(street|address)/.test(h)) return "street"
  if (/^city$/.test(h)) return "city"
  if (/(zip|postal)/.test(h)) return "zip"
  if (/(physician|doctor|provider|author|clinician|attending)/.test(h)) return "provider"
  if (/(date|_at$|^dt_)/.test(h) || all(ISO_DATE)) return "date"
  if (/(mrn|member|insurance|account|policy|_id$|^id$|number)/.test(h)) return "id"
  if (/(note|text|comment|description|message|summary)/.test(h) || avgLen > 60) return "free_text"
  return "keep"
}

export function inferRoles(columns: string[], rows: Row[]): Record<string, ColumnRole> {
  return Object.fromEntries(columns.map((c) => [c, inferRole(c, rows)]))
}
