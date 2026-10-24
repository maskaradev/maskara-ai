import type { EntityType, GoldSpan, SpanAnswerKey, SpanReport } from "@/lib/types"

/**
 * Nemotron-PII categories the identification agent is asked to find, by the entity type it would use.
 * The rest (occupation, gender, blood type, time, state, ...) are attributes the masking policy keeps
 * for utility, so they are scored neither as misses nor as false positives.
 */
export const SCORED_LABELS: Record<string, EntityType> = {
  first_name: "PERSON",
  last_name: "PERSON",
  user_name: "PERSON",
  date: "DATE",
  date_of_birth: "DATE",
  date_time: "DATE",
  age: "AGE",
  phone_number: "PHONE",
  fax_number: "PHONE",
  email: "EMAIL",
  ssn: "SSN",
  medical_record_number: "ID_NUMBER",
  health_plan_beneficiary_number: "ID_NUMBER",
  certificate_license_number: "ID_NUMBER",
  account_number: "ID_NUMBER",
  bank_routing_number: "ID_NUMBER",
  credit_debit_card: "ID_NUMBER",
  customer_id: "ID_NUMBER",
  employee_id: "ID_NUMBER",
  unique_id: "ID_NUMBER",
  tax_id: "ID_NUMBER",
  license_plate: "ID_NUMBER",
  vehicle_identifier: "ID_NUMBER",
  device_identifier: "ID_NUMBER",
  biometric_identifier: "ID_NUMBER",
  street_address: "ADDRESS",
  postcode: "ZIP",
  city: "LOCATION",
  county: "LOCATION",
  coordinate: "LOCATION",
  company_name: "ORGANIZATION",
  url: "OTHER",
  ipv4: "OTHER",
  ipv6: "OTHER",
  mac_address: "OTHER",
}

export type DetectedSpan = { start: number; end: number; type: EntityType }

const MAX_EXAMPLES = 50
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end

export function scoreSpans(
  key: SpanAnswerKey,
  docs: { record: string; text: string; gold: GoldSpan[]; detected: DetectedSpan[] }[],
): SpanReport {
  const byLabel = new Map<string, SpanReport["byLabel"][number]>()
  const report: SpanReport = {
    source: key.source,
    docs: docs.length,
    gold: 0,
    caught: 0,
    correct: 0,
    wrong: 0,
    outOfScope: 0,
    byLabel: [],
    missed: [],
    falsePositives: [],
  }
  for (const { record, text, gold, detected } of docs) {
    for (const g of gold) {
      const type = SCORED_LABELS[g.label]
      if (!type) continue
      const row = byLabel.get(g.label) ?? { label: g.label, type, gold: 0, caught: 0 }
      byLabel.set(g.label, row)
      row.gold++
      report.gold++
      if (detected.some((d) => overlaps(d, g))) {
        row.caught++
        report.caught++
      } else if (report.missed.length < MAX_EXAMPLES) {
        report.missed.push({ record, label: g.label, value: text.slice(g.start, g.end) })
      }
    }
    for (const d of detected) {
      const hits = gold.filter((g) => overlaps(d, g))
      if (hits.some((g) => SCORED_LABELS[g.label])) report.correct++
      else if (hits.length) report.outOfScope++
      else {
        report.wrong++
        if (report.falsePositives.length < MAX_EXAMPLES) report.falsePositives.push({ record, type: d.type, value: text.slice(d.start, d.end) })
      }
    }
  }
  report.byLabel = [...byLabel.values()].sort((a, b) => b.gold - a.gold || a.label.localeCompare(b.label))
  return report
}

export const recall = (r: SpanReport) => (r.gold ? r.caught / r.gold : null)
export const precision = (r: SpanReport) => (r.correct + r.wrong ? r.correct / (r.correct + r.wrong) : null)
export function f1(r: SpanReport): number | null {
  const p = precision(r)
  const rc = recall(r)
  return p === null || rc === null || p + rc === 0 ? null : (2 * p * rc) / (p + rc)
}
