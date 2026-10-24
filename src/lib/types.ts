export type ColumnRole =
  | "keep"
  | "person_key"
  | "name"
  | "sex"
  | "dob"
  | "date"
  | "ssn"
  | "phone"
  | "email"
  | "street"
  | "city"
  | "zip"
  | "id"
  | "provider"
  | "free_text"
  | "transcript"
  | "image"
  | "audio"

export type Row = Record<string, string>

export type Table = {
  name: string
  columns: string[]
  rows: Row[]
  roles: Record<string, ColumnRole>
}

export type AnswerKey = Record<string, { image: string[]; audio: string[] }>

export type Dataset = {
  id: string
  name: string
  source: "sample" | "upload"
  createdAt: string
  tables: Table[]
  /** Prefix for relative media paths (image/audio columns). */
  baseUrl?: string
  answerKey?: AnswerKey
}

export type EntityType =
  | "PERSON"
  | "DATE"
  | "AGE"
  | "PHONE"
  | "EMAIL"
  | "SSN"
  | "ID_NUMBER"
  | "ADDRESS"
  | "ZIP"
  | "LOCATION"
  | "ORGANIZATION"
  | "OTHER"

export type PersonRole = "patient" | "relative" | "provider" | "staff" | "other"

export type DetectedEntity = {
  text: string
  type: EntityType
  role: PersonRole | null
  canonicalName: string | null
  relation: string | null
}

export type PersonaKind = "patient" | "relative" | "provider" | "other"

export type Persona = {
  key: string
  kind: PersonaKind
  firstName: string
  lastName: string
  sex: "F" | "M" | "U"
  birthDate?: string
  phone: string
  email: string
  street: string
  city: string
  dateOffsetDays: number
  datasetName: string
  createdAt: string
}

export type Segment = { text: string; entity?: { type: EntityType; original: string } }

export type MaskedCell =
  | { kind: "value"; value: string; original: string }
  | { kind: "text"; segments: Segment[]; original: string }
  | { kind: "image"; original: string; item: number }
  | { kind: "audio"; original: string; transcript: Segment[]; originalTranscript: string }

export type MaskedTable = {
  name: string
  columns: string[]
  roles: Record<string, ColumnRole>
  rows: Record<string, MaskedCell>[]
}

export type StageId =
  | "ingest"
  | "scan"
  | "persona"
  | "structured"
  | "text_detect"
  | "audio_transcribe"
  | "identify"
  | "generate"
  | "validate"
  | "export"

export type Box = { x0: number; y0: number; x1: number; y1: number }

/** One PII area on an image (one per text line it covers). */
export type ImageRegion = Box & {
  type: EntityType
  original: string
  /** Persona value drawn by the generation agent; only on the first line of a multi-line span. */
  replacement: string | null
  first: boolean
  bg: string
  ink: string
}

export type ImageItemStatus = "pending" | "identifying" | "identified" | "generated" | "failed"

export type ImageItem = {
  id: string
  table: string
  column: string
  src: string
  status: ImageItemStatus
  words: Box[]
  regions: ImageRegion[]
  ocr: Segment[]
  error?: string
}

export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "skipped"

export type StageState = {
  status: StageStatus
  startedAt?: number
  finishedAt?: number
  done: number
  total: number
  logs: string[]
  error?: string
}

export type RunStatus = "running" | "succeeded" | "failed"

export type UtilityCheck = {
  group: "time" | "linkage" | "distribution" | "analysis"
  id: string
  label: string
  description: string
  original: string
  masked: string
  pass: boolean | null
}

export type UtilityReport = {
  checks: UtilityCheck[]
  passed: number
  total: number
  /** Share of free-text characters left untouched (the rest was PII). */
  textKeptPct: number | null
  timelines: { person: string; maskedPerson: string; original: string[]; masked: string[] }[]
}

export type ValidationReport = {
  checkedValues: number
  leaks: { value: string; where: string }[]
  keptByPolicy: number
  entitiesByType: Partial<Record<EntityType, number>>
  media: { found: number; total: number; missed: { record: string; value: string }[] } | null
  utility?: UtilityReport
}

export type Run = {
  id: string
  number: number
  datasetId: string
  datasetName: string
  status: RunStatus
  startedAt: number
  finishedAt?: number
  stages: Record<StageId, StageState>
  rowsProcessed: number
  entitiesReplaced: number
  apiCalls: number
  cacheHits: number
  images?: ImageItem[]
  output?: MaskedTable[]
  report?: ValidationReport
  error?: string
}
