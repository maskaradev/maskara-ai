import "server-only"

import raw from "../../public/demo/bundle.json"
import {
  fmt,
  slice,
  type Bundle,
  type Input,
  type Mention,
  type Persona,
  type Scalar,
  type TextDoc,
  type TextRef,
} from "@/lib/run"

/**
 * Loads the exported sample run once per server process and hands each page only the slice it renders,
 * so the 640 KB bundle never ships to the browser whole. Every page is prerendered from it at build time.
 */
const bundle = raw as unknown as Bundle

const inputs = new Map(bundle.inputs.map((inp) => [inp.name, inp]))
const colIndex = new Map(bundle.inputs.map((inp) => [inp.name, new Map(inp.columns.map((c, j) => [c.name, j]))]))

function cell(side: "before" | "after", source: string, row: number, column: string): Scalar | undefined {
  const rows = bundle.rows[source][side]
  return rows ? rows[row][colIndex.get(source)!.get(column)!] : undefined
}

const personaNames = new Map(bundle.personas.map((p) => [p.id, p.name]))

const mentions: Mention[] = bundle.mentions.rows.map((r, i) => {
  const m = Object.fromEntries(bundle.mentions.fields.map((f, j) => [f, r[j]])) as unknown as Mention
  const after = fmt(cell("after", m.source, m.row, m.column))
  const before = bundle.meta.originals ? fmt(cell("before", m.source, m.row, m.column)) : null
  return {
    ...m,
    i,
    personaName: (m.persona && personaNames.get(m.persona)) || null,
    replacement: m.start == null ? after : slice(after, m.out_start!, m.out_end!),
    original: before == null ? null : m.start == null ? before : slice(before, m.start, m.end!),
  }
})

const byCell = new Map<string, Mention[]>()
for (const m of mentions) {
  const k = `${m.source}\0${m.row}\0${m.column}`
  if (!byCell.has(k)) byCell.set(k, [])
  byCell.get(k)!.push(m)
}
const cellMentions = (source: string, row: number, column: string) => byCell.get(`${source}\0${row}\0${column}`) ?? []

const texts: TextRef[] = bundle.inputs.flatMap((inp) =>
  inp.columns
    .filter((c) => c.role === "text")
    .flatMap((c) =>
      bundle.rows[inp.name].after.flatMap((_, row) => {
        const after = fmt(cell("after", inp.name, row, c.name))
        if (!after.trim()) return []
        return [{
          source: inp.name,
          row,
          column: c.name,
          mentions: cellMentions(inp.name, row, c.name).length,
          preview: after.replace(/\s+/g, " ").slice(0, 120),
        }]
      }),
    ),
)

export const meta = bundle.meta
export const report = bundle.report

export function getInputs() {
  return bundle.inputs.map((inp) => ({
    ...inp,
    replaced: mentions.filter((m) => m.source === inp.name && m.changed).length,
    texts: texts.filter((t) => t.source === inp.name).length,
  }))
}
export type InputSummary = ReturnType<typeof getInputs>[number]

export function getInput(name: string): Input | undefined {
  return inputs.get(name)
}

export function getTextDoc(source: string, row: number, column: string): TextDoc {
  return {
    source,
    row,
    column,
    before: bundle.meta.originals ? fmt(cell("before", source, row, column)) : null,
    after: fmt(cell("after", source, row, column)),
    mentions: cellMentions(source, row, column),
  }
}

export function getTexts(source?: string) {
  return source ? texts.filter((t) => t.source === source) : texts
}

/** The text that shows the most kinds of replacement among the first few, for the home page. */
export function getFeaturedText(): TextDoc | null {
  const best = texts.slice(0, 60).reduce<{ ref: TextRef; kinds: number } | null>((acc, ref) => {
    const kinds = new Set(cellMentions(ref.source, ref.row, ref.column).map((m) => m.category)).size
    return !acc || kinds > acc.kinds ? { ref, kinds } : acc
  }, null)
  return best && getTextDoc(best.ref.source, best.ref.row, best.ref.column)
}

/** A table's cells with their whole-cell replacements, for the table viewer. */
export function getTable(name: string) {
  const inp = inputs.get(name)!
  const rows = bundle.rows[name]
  const replaced: Record<string, Pick<Mention, "i" | "category" | "label" | "detector" | "score" | "persona" | "personaName" | "link" | "changed">> = {}
  for (const m of mentions) {
    if (m.source !== name || m.start != null) continue
    replaced[`${m.row}:${m.column}`] = {
      i: m.i,
      category: m.category,
      label: m.label,
      detector: m.detector,
      score: m.score,
      persona: m.persona,
      personaName: m.personaName,
      link: m.link,
      changed: m.changed,
    }
  }
  const textCounts: Record<string, number> = {}
  for (const t of texts) if (t.source === name) textCounts[`${t.row}:${t.column}`] = t.mentions
  // The table shows only the start of a free-text cell; the whole text goes to the Texts tab.
  const textCols = inp.columns.flatMap((c, j) => (c.role === "text" ? [j] : []))
  const clip = (rs: Scalar[][]) =>
    textCols.length ? rs.map((r) => r.map((v, j) => (textCols.includes(j) && typeof v === "string" ? v.slice(0, 100) : v))) : rs
  return {
    input: inp,
    after: clip(rows.after),
    before: rows.before && clip(rows.before),
    replaced,
    textCounts,
    categories: [...new Set(Object.values(replaced).map((r) => r.category))],
  }
}
export type TableData = ReturnType<typeof getTable>

export function getPersonas(): Persona[] {
  return bundle.personas
}

export function getPersona(id: string) {
  return bundle.personas.find((p) => p.id === id)
}

export function getPersonaMentions(id: string) {
  return mentions.filter((m) => m.persona === id)
}

export function categoryTotals() {
  const counts: Record<string, number> = {}
  for (const m of mentions) if (m.changed) counts[m.category] = (counts[m.category] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}
