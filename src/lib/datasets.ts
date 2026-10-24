import Papa from "papaparse"

import { randomId } from "@/lib/hash"
import { inferRoles } from "@/lib/roles"
import type { AnswerKey, Dataset, Row, SpanAnswerKey, Table } from "@/lib/types"

export const UPLOAD_LIMITS = { bytesPerFile: 1_000_000, totalRows: 1_000 }

const SAMPLE_BASE = "/samples/hospital/"
const SAMPLE_FILES = ["patients.csv", "clinical_notes.csv", "encounter_media.csv"]
const NEMOTRON_BASE = "/samples/nemotron-pii/"

export function parseCsv(name: string, csv: string): Table {
  const parsed = Papa.parse<Row>(csv.replace(/\r\n?/g, "\n").trim(), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${name}: ${parsed.errors[0].message}`)
  const columns = parsed.meta.fields ?? []
  return { name, columns, rows: parsed.data, roles: inferRoles(columns, parsed.data) }
}

export function toCsv(columns: string[], rows: Row[]): string {
  return Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? "")) })
}

export async function loadHospitalSample(): Promise<Dataset> {
  const tables = await Promise.all(
    SAMPLE_FILES.map(async (file) => {
      const res = await fetch(SAMPLE_BASE + file)
      if (!res.ok) throw new Error(`Failed to load ${file}`)
      return parseCsv(file.replace(/\.csv$/, ""), await res.text())
    }),
  )
  const keyRes = await fetch(SAMPLE_BASE + "encounter_media_answer_key.json")
  const answerKey = keyRes.ok ? ((await keyRes.json()) as AnswerKey) : undefined

  return {
    id: "sample-hospital",
    name: "Riverside General Hospital (sample)",
    source: "sample",
    createdAt: new Date().toISOString(),
    tables,
    baseUrl: SAMPLE_BASE,
    answerKey,
  }
}

/** 40 US healthcare documents from nvidia/Nemotron-PII (CC BY 4.0) with their gold PII spans. */
export async function loadNemotronSample(): Promise<Dataset> {
  const [csvRes, keyRes] = await Promise.all([fetch(NEMOTRON_BASE + "documents.csv"), fetch(NEMOTRON_BASE + "answer_key.json")])
  if (!csvRes.ok || !keyRes.ok) throw new Error("Failed to load the Nemotron-PII sample")
  const spanKey = (await keyRes.json()) as SpanAnswerKey
  return {
    id: "sample-nemotron-pii",
    name: "Nemotron-PII · healthcare (sample)",
    source: "sample",
    createdAt: new Date().toISOString(),
    tables: [parseCsv(spanKey.table, await csvRes.text())],
    spanKey,
  }
}

export async function datasetFromFiles(name: string, files: File[]): Promise<Dataset> {
  for (const f of files) {
    if (f.size > UPLOAD_LIMITS.bytesPerFile) throw new Error(`${f.name} is larger than 1 MB.`)
  }
  const tables = await Promise.all(files.map(async (f) => parseCsv(f.name.replace(/\.csv$/i, ""), await f.text())))
  const rows = tables.reduce((n, t) => n + t.rows.length, 0)
  if (rows > UPLOAD_LIMITS.totalRows) throw new Error(`${rows} rows uploaded; the MVP limit is ${UPLOAD_LIMITS.totalRows}.`)

  return {
    id: randomId("ds-"),
    name: name || files.map((f) => f.name).join(", "),
    source: "upload",
    createdAt: new Date().toISOString(),
    tables,
  }
}

export function mediaUrl(dataset: Pick<Dataset, "baseUrl">, path: string): string {
  if (/^(https?:|data:|\/)/.test(path)) return path
  return (dataset.baseUrl ?? "/") + path
}
