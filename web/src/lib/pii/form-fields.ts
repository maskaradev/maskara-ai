import type { DetectedEntity, EntityType, PersonRole } from "@/lib/types"

// Layout-aware rules for OCR text of forms, cards and printouts. The OCR text puts a form label and
// its value on one line ("MRN | 100561", "Name: BELL, MARCUS", "DOB 01/30/1934") and marks section
// headings with "## ". A value next to a known PII label is PII of that type, whatever the model
// thinks; this covers what the local PII model doesn't label (record numbers, ages, schools).

const FIELDS: [RegExp, EntityType, PersonRole | null][] = [
  [/^(?:patient(?: name)?|name|full name|member|student|insured|subscriber|resident)$/i, "PERSON", null],
  [/^(?:parent|guardian|mother|father|spouse|emergency contact|next of kin|caregiver)$/i, "PERSON", "relative"],
  [/^(?:physician|pcp|provider|doctor|prescriber|attending|ordering(?: physician| provider)?|referring(?: physician)?)$/i, "PERSON", "provider"],
  [/^(?:dob|d\.o\.b\.?|date of birth|birth ?date|born)$/i, "DATE", null],
  [/^(?:date|effective|acquired|collected|collection date|adm|admitted|admission|discharged?|visit date|service date|dos)$/i, "DATE", null],
  [/^(?:mrn|member id|patient id|id|insurance|policy(?: no\.?| number)?|account(?: no\.?| number)?|subscriber id|ssn|group no\.?)$/i, "ID_NUMBER", null],
  [/^(?:phone|tel|telephone|mobile|cell|fax)$/i, "PHONE", null],
  [/^(?:address|home address|street)$/i, "ADDRESS", null],
  [/^(?:e-?mail)$/i, "EMAIL", null],
  [/^age$/i, "AGE", null],
  [/^(?:school|employer|facility|company)$/i, "ORGANIZATION", null],
]

/** Short printed labels that are followed by their value without a colon ("DOB 01/30/1934"). */
const BARE_LABELS = /\b(DOB|MRN|ADM|DOS|SSN)\s+([\w/-]*\d[\w/-]*)/g

const PATTERNS: [EntityType, RegExp][] = [
  ["AGE", /\b\d{1,3}\s?(?:Y|YO|yo|y\/o)\b/g],
  // Human-readable line under a barcode, e.g. "*100512*".
  ["ID_NUMBER", /\*[A-Z0-9-]{4,}\*/g],
]

const field = (label: string) => FIELDS.find(([re]) => re.test(label.replace(/[:.\s]+$/, "").trim()))

const entity = (text: string, type: EntityType, role: PersonRole | null = null): DetectedEntity => ({
  text,
  type,
  role: type === "PERSON" ? role : null,
  canonicalName: null,
  relation: null,
})

export function detectFormFields(text: string): DetectedEntity[] {
  const out: DetectedEntity[] = []
  const add = (value: string, type: EntityType, role: PersonRole | null) => {
    const v = value.trim().replace(/[,;]$/, "")
    if (v && /[\p{L}\d]/u.test(v) && !field(v)) out.push(entity(v, type, role))
  }

  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) continue
    // Table rows: label cell followed by value cell(s).
    const cells = line.split(" | ")
    cells.forEach((cell, i) => {
      const f = field(cell)
      const value = cells[i + 1]
      if (f && value) add(value, f[1], f[2])
    })
    // Inline "Label: value", value running to the next "Label:" in the cell.
    for (const cell of cells) {
      for (const m of cell.matchAll(/([A-Za-z][A-Za-z .]{0,24}?):\s*(.+?)(?=\s+[A-Z][A-Za-z .]{0,24}:|$)/g)) {
        const f = field(m[1])
        if (f) add(m[2], f[1], f[2])
      }
    }
    for (const m of line.matchAll(BARE_LABELS)) {
      const f = field(m[1])
      if (f) add(m[2], f[1], f[2])
    }
  }
  for (const [type, re] of PATTERNS) for (const m of text.matchAll(re)) out.push(entity(m[0], type))
  return out
}

/** Role implied by the section heading above a position ("## PARENT / GUARDIAN" → relative). */
export function headingRole(text: string, index: number): PersonRole | null {
  const heading = [...text.slice(0, index).matchAll(/^## (.+)$/gm)].at(-1)?.[1] ?? ""
  if (/parent|guardian|emergency|next of kin|relative|family|contact/i.test(heading)) return "relative"
  if (/prescriber|physician|provider|doctor|clinician|order/i.test(heading)) return "provider"
  if (/patient|student|member|resident/i.test(heading)) return "patient"
  return null
}
