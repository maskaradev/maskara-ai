import { hashDigits, hashOf, pick } from "@/lib/hash"
import {
  CITIES,
  PLACE_WORDS,
  STREET_NAMES,
  createPersona,
  fictionalPhoneDigits,
  sexFromRelation,
  shiftIsoDate,
} from "@/lib/personas"
import type { DetectedEntity, Persona, PersonaKind, Segment } from "@/lib/types"

export type RealName = { first: string; last: string }

export type PatientInfo = {
  name?: string
  sex: "F" | "M" | "U"
  dob?: string
  street?: string
  city?: string
}

/** Everything the replacement functions need to stay consistent within a run. */
export class MaskContext {
  readonly personas: Map<string, Persona>
  readonly patients = new Map<string, PatientInfo>()
  readonly patientByName = new Map<string, string>()
  readonly providers = new Map<string, string>()
  private readonly aliases = new Map<string, string>()
  private readonly relatives = new Map<string, Map<string, string>>()
  private readonly wordAliases: [RegExp, string][] = []

  constructor(
    readonly salt: string,
    readonly datasetId: string,
    readonly datasetName: string,
    personas: Record<string, Persona>,
  ) {
    this.personas = new Map(Object.entries(personas))
  }

  personKey(value: string): string {
    return `${this.datasetId}:${value}`
  }

  ensurePersona(key: string, init: { kind: PersonaKind; sex: "F" | "M" | "U"; realBirthDate?: string; lastName?: string }): Persona {
    let p = this.personas.get(key)
    if (!p) {
      p = createPersona(this.salt, { key, datasetName: this.datasetName, ...init })
      this.personas.set(key, p)
    }
    return p
  }

  alias(kind: string, original: string): string | undefined {
    return this.aliases.get(`${kind}:${original}`)
  }

  setAlias(kind: string, original: string, replacement: string) {
    this.aliases.set(`${kind}:${original}`, replacement)
  }

  /** Whole-word replacement used for street names and cities inside longer strings. */
  addWordAlias(real: string, replacement: string) {
    if (!real.trim() || real === replacement) return
    this.wordAliases.push([new RegExp(`\\b${escapeRegExp(real)}\\b`, "gi"), replacement])
  }

  applyWordAliases(s: string): string {
    return this.wordAliases.reduce((acc, [re, rep]) => acc.replace(re, rep), s)
  }

  registerPatient(personKey: string, info: PatientInfo) {
    const prev = this.patients.get(personKey) ?? { sex: "U" as const }
    const merged = { ...prev, ...Object.fromEntries(Object.entries(info).filter(([, v]) => v && v !== "U")) }
    this.patients.set(personKey, merged as PatientInfo)
    if (info.name) this.patientByName.set(normName(info.name), personKey)
  }

  patientPersona(personKey: string): Persona {
    const info = this.patients.get(personKey) ?? { sex: "U" as const }
    return this.ensurePersona(personKey, { kind: "patient", sex: info.sex, realBirthDate: info.dob })
  }

  providerKey(name: string): string {
    const canonical = normName(stripTitles(name))
    const existing = this.providers.get(canonical)
    if (existing) return existing
    const last = canonical.split(" ").at(-1)
    const byLast = [...this.providers.entries()].filter(([n]) => n.split(" ").at(-1) === last)
    if (byLast.length === 1) return byLast[0][1]
    const key = `provider:${canonical}`
    this.providers.set(canonical, key)
    return key
  }

  /** Map a detected person mention to a persona key and the real name it refers to. */
  resolvePerson(e: DetectedEntity, rowPatient: string | null): { key: string; real: RealName; persona: Persona } {
    const canonical = e.canonicalName?.trim() || e.text
    const byName = this.patientByName.get(normName(stripTitles(canonical)))
    if (byName || (e.role === "patient" && rowPatient)) {
      const key = byName ?? rowPatient!
      const real = splitName(this.patients.get(key)?.name ?? canonical)
      return { key, real, persona: this.patientPersona(key) }
    }
    if (e.role === "provider" || e.role === "staff") {
      const key = this.providerKey(canonical)
      return { key, real: splitName(canonical), persona: this.ensurePersona(key, { kind: "provider", sex: "U" }) }
    }

    const owner = rowPatient ?? "none"
    const rels = this.relatives.get(owner) ?? new Map<string, string>()
    this.relatives.set(owner, rels)
    const real = splitName(canonical)
    const full = normName(`${real.first} ${real.last}`)
    let key = rels.get(full)
    if (!key) {
      const sameFirst = [...rels.entries()].filter(([n]) => n.split(" ")[0] === real.first.toLowerCase())
      key = sameFirst.length === 1 ? sameFirst[0][1] : `${this.datasetId}:${owner}:rel:${full}`
      rels.set(full, key)
    }
    const patientName = rowPatient ? splitName(this.patients.get(rowPatient)?.name ?? "") : null
    const sharesSurname = patientName && real.last && patientName.last.toLowerCase() === real.last.toLowerCase()
    const persona = this.ensurePersona(key, {
      kind: e.role === "relative" ? "relative" : "other",
      sex: sexFromRelation(e.relation),
      lastName: sharesSurname && rowPatient ? this.patientPersona(rowPatient).lastName : undefined,
    })
    return { key, real, persona }
  }
}

// ---------- names ----------

const TITLES = /\b(dr|mr|mrs|ms|miss|nurse|prof)\.?\s+/gi

export function stripTitles(s: string): string {
  return s.replace(TITLES, "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()
}

export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z' -]/g, "").replace(/\s+/g, " ").trim()
}

export function splitName(full: string): RealName {
  const s = stripTitles(full)
  if (s.includes(",")) {
    const [last, first] = s.split(",").map((x) => x.trim())
    return { first: first.split(" ")[0] ?? "", last }
  }
  const parts = s.split(" ").filter(Boolean)
  if (parts.length === 1) return { first: parts[0], last: "" }
  return { first: parts[0], last: parts.at(-1)! }
}

function matchCase(source: string, replacement: string): string {
  return source === source.toUpperCase() && /[A-Z]/.test(source) ? replacement.toUpperCase() : replacement
}

export function renderName(mention: string, real: RealName, persona: Persona): string {
  // Drop parenthetical nicknames, e.g. "Robert (Bob) Kowalski".
  let out = mention.replace(/\s*\([^)]*\)/g, "")
  const swaps: [string, string][] = [
    [real.last, persona.lastName],
    [real.first, persona.firstName],
  ]
  for (const [from, to] of swaps) {
    if (from.length < 2) continue
    out = out.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi"), (m) => matchCase(m, to))
  }
  if (real.first) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(real.first[0])}\\.(?=\\s)`, "g"), persona.firstName[0] + ".")
  }
  if (out !== mention) return out
  // Nickname or unmatched form: replace the whole mention, keeping any title.
  const title = mention.match(/^(dr|mr|mrs|ms|miss|nurse)\.?\s+/i)?.[0] ?? ""
  const rest = mention.slice(title.length)
  const replacement = rest.trim().includes(" ") ? `${persona.firstName} ${persona.lastName}` : title ? persona.lastName : persona.firstName
  return title + matchCase(rest, replacement)
}

// ---------- dates & ages ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
const DATE_RE = new RegExp(
  [
    "(\\d{4})-(\\d{2})-(\\d{2})",
    "(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})",
    "(\\d{1,2})\\/(\\d{4})",
    "(\\d{1,2})\\/(\\d{1,2})(?![\\/\\d])",
    `${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![\\d:])`,
  ].map((p) => `\\b${p}`).join("|"),
  "g",
)
const REFERENCE_YEAR = 2026

function shift(y: number, m: number, d: number, days: number) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

const pad = (n: number, like: string) => (like.length === 2 ? String(n).padStart(2, "0") : String(n))

export function shiftDatesIn(s: string, days: number): string {
  return s.replace(DATE_RE, (...g: string[]) => {
    const [whole] = g
    if (g[1]) return shiftIsoDate(whole, days)
    const valid = (m: string, d?: string) => +m >= 1 && +m <= 12 && (!d || (+d >= 1 && +d <= 31))
    if (g[4]) {
      if (!valid(g[4], g[5])) return whole
      const r = shift(+g[6], +g[4], +g[5], days)
      return `${pad(r.m, g[4])}/${pad(r.d, g[5])}/${r.y}`
    }
    if (g[7]) {
      if (!valid(g[7])) return whole
      const r = shift(+g[8], +g[7], 15, days)
      return `${pad(r.m, g[7])}/${r.y}`
    }
    if (g[9]) {
      if (!valid(g[9], g[10])) return whole
      const r = shift(REFERENCE_YEAR, +g[9], +g[10], days)
      return `${pad(r.m, g[9])}/${pad(r.d, g[10])}`
    }
    const name = g[11]
    const month = MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1
    const r = shift(g[13] ? +g[13] : REFERENCE_YEAR, month, +g[12], days)
    const outName = name.length > 3 ? MONTH_FULL[r.m - 1] : MONTH_FULL[r.m - 1].slice(0, 3)
    return g[13] ? `${outName} ${r.d}, ${r.y}` : `${outName} ${r.d}`
  })
}

export function aggregateAges(s: string): string {
  return s.replace(/(?<!\d)(\d{2,3})(?!\d)/g, (m) => (Number(m) >= 90 && Number(m) < 130 ? "90+" : m))
}

// ---------- numbers & contacts ----------

function applyDigits(template: string, digits: string): string {
  let i = 0
  return template.replace(/\d/g, () => digits[i++] ?? "0")
}

export function renderDigits(ctx: MaskContext, mention: string, scope = "id"): string {
  const digits = mention.replace(/\D/g, "")
  if (!digits) return mention
  return applyDigits(mention, hashDigits(ctx.salt, `${scope}:${digits}`, digits.length))
}

export function renderSsn(ctx: MaskContext, mention: string): string {
  const digits = mention.replace(/\D/g, "")
  return applyDigits(mention, "9" + hashDigits(ctx.salt, `ssn:${digits}`, Math.max(digits.length - 1, 0)))
}

export function renderPhone(ctx: MaskContext, mention: string, persona?: Persona): string {
  const digits = mention.replace(/\D/g, "")
  const norm = digits.slice(-10)
  let replacement = ctx.alias("phone", norm)
  if (!replacement) {
    replacement = persona ? persona.phone.replace(/\D/g, "") : fictionalPhoneDigits(ctx.salt, `phone:${norm}`)
    ctx.setAlias("phone", norm, replacement)
  }
  if (digits.length === 10) return applyDigits(mention, replacement)
  if (digits.length === 11) return applyDigits(mention, "1" + replacement)
  if (digits.length === 7) return applyDigits(mention, replacement.slice(3))
  return applyDigits(mention, hashDigits(ctx.salt, `phone:${digits}`, digits.length))
}

const SPOKEN_EMAIL = /\bat\b.*\bdot\b/i

function spokenToEmail(s: string): string {
  return s.toLowerCase().replace(/\s+dot\s+/g, ".").replace(/\s+at\s+/g, "@").replace(/\s+/g, "")
}

export function renderEmail(ctx: MaskContext, mention: string, persona?: Persona): string {
  const spoken = !mention.includes("@") && SPOKEN_EMAIL.test(mention)
  const norm = spoken ? spokenToEmail(mention) : mention.toLowerCase().trim()
  let replacement = ctx.alias("email", norm)
  if (!replacement) {
    replacement = persona?.email ?? `contact${hashDigits(ctx.salt, `email:${norm}`, 4)}@example.com`
    ctx.setAlias("email", norm, replacement)
  }
  return spoken ? replacement.replace(/@/g, " at ").replace(/\./g, " dot ") : replacement
}

export function renderZip(ctx: MaskContext, mention: string): string {
  return mention.replace(/\b(\d{3})(\d{2})\b/g, (_, head: string, tail: string) => head + hashDigits(ctx.salt, `zip:${head}${tail}`, 2))
}

// ---------- places & organizations ----------

const GENERIC_WORDS = new Set(
  (
    "llc inc corp co company group roofing engineering logistics works university college school high middle " +
    "elementary public library senior living center centre clinic hospital medical imaging health park street st " +
    "avenue ave road rd drive dr lane ln boulevard blvd mall plaza church services foundation bank store restaurant"
  ).split(" "),
)

export function renderOrganization(ctx: MaskContext, mention: string): string {
  const words = mention.split(/\s+/)
  const firstGeneric = words.findIndex((w) => GENERIC_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")))
  const word = pick(PLACE_WORDS, hashOf(ctx.salt, "org", mention.toLowerCase()))
  if (firstGeneric <= 0) return firstGeneric === 0 ? `${word} ${mention}` : word
  return [word, ...words.slice(firstGeneric)].join(" ")
}

export function renderLocation(ctx: MaskContext, mention: string): string {
  // US state codes may stay under HIPAA Safe Harbor.
  if (/^[A-Z]{2}$/.test(mention.trim())) return mention
  const aliased = ctx.applyWordAliases(mention)
  if (aliased !== mention) return aliased
  if (mention.split(/\s+/).some((w) => GENERIC_WORDS.has(w.toLowerCase()))) return renderOrganization(ctx, mention)
  return pick(CITIES, hashOf(ctx.salt, "city", mention.toLowerCase()))
}

export function renderAddress(ctx: MaskContext, mention: string): string {
  const exact = ctx.alias("street", normName(mention))
  if (exact) return exact
  const aliased = ctx.applyWordAliases(mention)
  if (aliased !== mention) {
    return renderZip(ctx, aliased.replace(/^\s*\d+/, (m) => renderDigits(ctx, m, "addr")))
  }
  if (/^\s*\d+\s+\w/.test(mention)) {
    const num = String(10 + (hashOf(ctx.salt, "addr", mention) % 8990))
    const suffix = mention.match(/\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|pkwy|way|pl)\.?\b/i)?.[0] ?? "St"
    return `${num} ${pick(STREET_NAMES, hashOf(ctx.salt, "addr-name", mention))} ${suffix}`
  }
  const digits = renderDigits(ctx, mention, "addr")
  return digits !== mention ? digits : renderLocation(ctx, mention)
}

/** "210 Maple Grove Ln Apt 214" -> "Maple Grove" */
export function streetCore(street: string): string {
  return street
    .replace(/\b(apt|unit|suite|ste|room|#)\b.*$/i, "")
    .replace(/^\s*\d+\s+/, "")
    .replace(/\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|pkwy|parkway|way|pl|place|bend|cir|circle)\.?\s*$/i, "")
    .trim()
}

// ---------- entities in free text ----------

export function renderEntity(ctx: MaskContext, e: DetectedEntity, rowPatient: string | null): string {
  const out = renderEntityValue(ctx, e, rowPatient)
  // Keep the look of uppercase printouts, e.g. "RIVERSIDE GENERAL" -> "BRIARWOOD".
  return e.type !== "EMAIL" && matchCase(e.text, out) !== out && e.text.length > 2 ? out.toUpperCase() : out
}

function renderEntityValue(ctx: MaskContext, e: DetectedEntity, rowPatient: string | null): string {
  const persona = rowPatient && e.role === "patient" ? ctx.patientPersona(rowPatient) : undefined
  const offset = rowPatient ? ctx.patientPersona(rowPatient).dateOffsetDays : 0
  switch (e.type) {
    case "PERSON": {
      const { real, persona: p } = ctx.resolvePerson(e, rowPatient)
      return renderName(e.text, real, p)
    }
    case "DATE":
      return shiftDatesIn(e.text, offset)
    case "AGE":
      return aggregateAges(e.text)
    case "PHONE":
      return renderPhone(ctx, e.text, persona)
    case "EMAIL":
      return renderEmail(ctx, e.text, persona)
    case "SSN":
      return renderSsn(ctx, e.text)
    case "ID_NUMBER":
      return renderDigits(ctx, e.text)
    case "ZIP":
      return renderZip(ctx, e.text)
    case "ADDRESS":
      return renderAddress(ctx, e.text)
    case "LOCATION":
      return renderLocation(ctx, e.text)
    case "ORGANIZATION":
      return renderOrganization(ctx, e.text)
    default: {
      const digits = renderDigits(ctx, e.text, "other")
      return digits !== e.text ? digits : "[REDACTED]"
    }
  }
}

export type EntitySpan = { start: number; end: number; entity: DetectedEntity }

/** Locate every occurrence of each detected entity; longer spans win on overlap. */
export function locateEntities(text: string, entities: DetectedEntity[]): EntitySpan[] {
  const spans: EntitySpan[] = []
  for (const entity of entities) {
    if (!entity.text.trim()) continue
    let found = false
    for (const flags of ["g", "gi"]) {
      const re = new RegExp(escapeRegExp(entity.text), flags)
      for (const m of text.matchAll(re)) {
        spans.push({ start: m.index, end: m.index + m[0].length, entity: { ...entity, text: m[0] } })
        found = true
      }
      if (found) break
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const out: EntitySpan[] = []
  for (const s of spans) {
    const last = out.at(-1)
    if (last && s.start < last.end) continue
    out.push(s)
  }
  return out
}

export function maskText(
  ctx: MaskContext,
  text: string,
  entities: DetectedEntity[],
  rowPatient: string | null,
): { segments: Segment[]; replaced: number; kept: number } {
  const segments: Segment[] = []
  let cursor = 0
  let replaced = 0
  let kept = 0
  for (const span of locateEntities(text, entities)) {
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start) })
    const replacement = renderEntity(ctx, span.entity, rowPatient)
    if (replacement === span.entity.text) kept++
    else replaced++
    segments.push({ text: replacement, entity: { type: span.entity.type, original: span.entity.text } })
    cursor = span.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) })
  return { segments, replaced, kept }
}

export function segmentsToText(segments: Segment[]): string {
  return segments.map((s) => s.text).join("")
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
