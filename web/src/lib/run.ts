/**
 * The sample run the app shows: a `maskara.bundle/1` document (see src/maskara/ui/bundle.py) written by
 * `maskara ui --export web/public/demo` from the package's bundled synthetic store. Types and helpers here
 * are shared by server and client components; loading and slicing the bundle is in run-data.ts.
 */

export type Scalar = string | number | boolean | null

export type Column = { name: string; role: string; category: string | null }

export type Input = {
  name: string
  kind: "table" | "texts"
  file: string | null
  rows: number
  subject: string | null
  columns: Column[]
}

export type Mention = {
  i: number
  source: string
  row: number
  column: string
  /** Code point offsets into the original cell, null for a whole-cell replacement. */
  start: number | null
  end: number | null
  out_start: number | null
  out_end: number | null
  category: string
  label: string
  detector: string
  score: number
  persona: string | null
  /** The persona's synthetic name, for labels. */
  personaName: string | null
  /** How the value's owner was found: row, known, name, context or value. */
  link: string
  changed: boolean
  /** The masked value: the after cell, or its span for text. */
  replacement: string
  /** The original value, when the bundle has originals. */
  original: string | null
}

export type Persona = {
  id: string
  name: string
  sex: string | null
  age: number | null
  email: string | null
  phone: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  occupation: string | null
  original: string | null
  mentions: number
  inputs: Record<string, number>
}

export type Meta = {
  maskara: string
  preset: string
  detectors: string[]
  notices: string[]
  originals: boolean
  synthetic: boolean
  title: string
  seed: string | null
}

type Measured = { measured: string; not_measured?: string }

export type Headline = {
  originals_found: number
  originals_partial: number
  originals_scanned: number
  broken_joins: number
  joins_checked: number
  date_gaps_exact: number
  date_gaps_checked: number
  format_valid: number
  placeholder_share: number
  non_pii_changed: number
  schema_ok: boolean
  replaced: number
  personas: number
  unlinked: number
  max_unique_share?: number
  max_linkage_rate?: number
}

type Place = { source: string; row: number; column: string }

export type Report = {
  schema: string
  maskara: string
  preset: string
  detectors: string[]
  headline: Headline
  privacy: {
    reappearance: Measured & {
      scanned: number
      skipped_short: number
      exact: number
      normalized: number
      partial: number
      found: number
      by_category: Record<string, number>
      hits: { level: string; category: string; label: string; found_in: Place; original_at: Place }[]
    }
    quasi_identifiers: Measured & {
      tables: Record<
        string,
        {
          columns: string[]
          kept: string[]
          rows: number
          unique: number
          unique_share: number
          min_k: number
          k: Record<string, number>
          linkage?: { columns: string[]; attempted: number; reidentified: number; rate: number }
        }
      >
    }
    detections: Measured & {
      replaced: number
      kept_by_policy: number
      by_category: Record<string, number>
      by_detector: Record<string, number>
      by_link: Record<string, number>
      unlinked: Measured & { mentions: number; by_category: Record<string, number> }
    }
  }
  fidelity: {
    schema: Measured & {
      ok: boolean
      tables: Record<string, { rows_before: number; rows_after: number; columns_same: boolean }>
    }
    joins: Measured & {
      pairs: { from: string; to: string; checked: number; broken: number; spurious: number }[]
      text_refs: { checked: number; broken: number }
      checked: number
      broken: number
      spurious: number
    }
    date_gaps: Measured & {
      people: number
      pairs: number
      exact: number
      exact_share: number
      max_error_days: number
      no_year: number
      unparsed: number
    }
    distributions: Measured & {
      columns: { table: string; column: string; role: string; test: string; value: number; what: string | null }[]
    }
    formats: Measured & {
      kinds: Record<string, { checked: number; valid: number; share: number }>
      checked: number
      valid: number
      share: number
    }
    placeholders: Measured & { replaced: number; placeholders: number; share: number }
    non_pii: Measured & {
      text_chars: number
      text_chars_changed: number
      kept_cells: number
      kept_cells_changed: number
      share: number
    }
  }
  not_measured: string[]
}

export type Bundle = {
  schema: "maskara.bundle/1"
  meta: Meta
  inputs: Input[]
  rows: Record<string, { after: Scalar[][]; before: Scalar[][] | null }>
  mentions: { fields: string[]; rows: Scalar[][] }
  personas: Persona[]
  report: Report
}

/** A free-text cell: a texts input's row, or a table's `text` column. */
export type TextRef = { source: string; row: number; column: string; mentions: number; preview: string }

/** One text with both sides and its spans, ready to render. */
export type TextDoc = { source: string; row: number; column: string; before: string | null; after: string; mentions: Mention[] }

/** Categories in the order the legend lists them, each with its highlight classes. */
export const CATEGORY_STYLE: Record<string, string> = {
  PERSON: "bg-sky-500/15 text-sky-900 dark:text-sky-200",
  CONTACT: "bg-violet-500/15 text-violet-900 dark:text-violet-200",
  ADDRESS: "bg-amber-500/20 text-amber-900 dark:text-amber-200",
  LOCATION: "bg-orange-500/15 text-orange-900 dark:text-orange-200",
  DATE: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  ID: "bg-zinc-500/15 text-zinc-900 dark:text-zinc-200",
  FINANCIAL: "bg-rose-500/15 text-rose-900 dark:text-rose-200",
  DEMOGRAPHIC: "bg-teal-500/15 text-teal-900 dark:text-teal-200",
}

export const CATEGORY_DOT: Record<string, string> = {
  PERSON: "bg-sky-500",
  CONTACT: "bg-violet-500",
  ADDRESS: "bg-amber-500",
  LOCATION: "bg-orange-500",
  DATE: "bg-emerald-500",
  ID: "bg-zinc-500",
  FINANCIAL: "bg-rose-500",
  DEMOGRAPHIC: "bg-teal-500",
}

export function categoryStyle(category: string | null | undefined) {
  return (category && CATEGORY_STYLE[category]) || "bg-muted text-foreground"
}

export const fmt = (v: Scalar | undefined) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v))

export function pct(x: number | null | undefined, digits = 1) {
  if (x == null) return "n/a"
  const v = 100 * x
  return `${Number.isInteger(v) ? v : v.toFixed(digits)}%`
}

export const num = (n: number) => n.toLocaleString("en-US")

export function initials(name: string | null | undefined) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** Cut a string by code points, as the bundle's offsets count them. */
export function slice(text: string, start: number, end?: number) {
  return Array.from(text).slice(start, end).join("")
}

export type Segment = { text: string; mention?: Mention }

/** Split a text into plain runs and replaced spans, for the original (`before`) or masked (`after`) side. */
export function segments(text: string, mentions: Mention[], side: "before" | "after"): Segment[] {
  const cps = Array.from(text)
  const spans = mentions
    .filter((m) => m.start != null)
    .map((m) => (side === "before" ? ([m.start!, m.end!, m] as const) : ([m.out_start!, m.out_end!, m] as const)))
    .sort((a, b) => a[0] - b[0])
  const out: Segment[] = []
  let pos = 0
  for (const [a, b, m] of spans) {
    if (a < pos) continue
    if (a > pos) out.push({ text: cps.slice(pos, a).join("") })
    out.push({ text: cps.slice(a, b).join(""), mention: m })
    pos = b
  }
  if (pos < cps.length) out.push({ text: cps.slice(pos).join("") })
  return out
}

export function categoryCounts(mentions: { category: string }[]) {
  const counts: Record<string, number> = {}
  for (const m of mentions) counts[m.category] = (counts[m.category] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}
