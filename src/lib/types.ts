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

/** Character span in a free-text cell, labelled with the source dataset's PII category. */
export type GoldSpan = { start: number; end: number; label: string }

/** Span-level answer key for one free-text column (e.g. nvidia/Nemotron-PII), keyed by the row's first column. */
export type SpanAnswerKey = {
  source: string
  url: string
  license: string
  table: string
  column: string
  records: Record<string, { uid?: string; spans: GoldSpan[] }>
}

export type Dataset = {
  id: string
  name: string
  source: "sample" | "upload"
  createdAt: string
  tables: Table[]
  /** Prefix for relative media paths (image/audio columns). */
  baseUrl?: string
  answerKey?: AnswerKey
  spanKey?: SpanAnswerKey
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
  | { kind: "text"; segments: Segment[]; original: string; agent?: { status: AgentItemStatus; error?: string } }
  | { kind: "image"; original: string; item: number; /** PDFs: page items follow `item` in run.images. */ pages?: number }

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
  | "text_identify"
  | "text_generate"
  | "identify"
  | "generate"
  | "doc_identify"
  | "doc_generate"
  | "validate"
  | "export"

export type Box = { x0: number; y0: number; x1: number; y1: number }

/** Layout category from the OCR server, collapsed to what the agents act on. */
export type LayoutKind = "title" | "text" | "table" | "figure" | "handwriting" | "signature" | "page" | "other"

/**
 * Non-text identifiers masked as a whole region: handwriting the OCR couldn't read (signature),
 * and faces from the on-prem face detector (redrawn as the persona by the GPU repaint model).
 */
export type VisualKind = Extract<LayoutKind, "signature"> | "face"

export type Point = { x: number; y: number }

/** One face from the face detector, in image pixels; landmarks are eyes, nose tip and mouth corners. */
export type FaceBox = { box: Box; score: number; landmarks: Point[] }

export type LayoutBlock = { label: string; kind: LayoutKind; bbox: Box; text?: string }

export type OcrWord = { text: string; line: number; start: number; end: number; bbox: Box; block: number | null }

/** OCR server output in image pixels; `text` is the layout-ordered text that `words` index into. */
export type OcrDocument = {
  width: number
  height: number
  text: string
  words: OcrWord[]
  blocks: LayoutBlock[]
  rotation: number
  skew: number
  /** Lines discarded as detector noise (empty, unreadable glyphs, very low confidence). */
  droppedLines: number
  lowConfidence: string[]
}

/** One PII area on an image (one per text line it covers). */
export type ImageRegion = Box & {
  type: EntityType
  original: string
  /** Persona value drawn by the generation agent; only on the first line of a multi-line span. */
  replacement: string | null
  first: boolean
  bg: string
  ink: string
  /** Index of the located text span this region belongs to (text regions only). */
  span?: number
  /** Set for non-text identifiers (layout analysis or the face detector). */
  visual?: VisualKind
}

export type AgentItemStatus = "pending" | "identifying" | "identified" | "generated" | "failed"

export type ImageItemStatus = AgentItemStatus

/** Photo lane = images (PNG/JPEG: faces + burned-in text); document lane = PDF pages, one item per page. */
export type MediaKind = "photo" | "document"

export type ImageItem = {
  id: string
  kind: MediaKind
  /** Document pages: 1-based page number and the page count. */
  page?: number
  pageCount?: number
  table: string
  column: string
  src: string
  status: ImageItemStatus
  words: Box[]
  /** Layout blocks from the OCR server. */
  blocks?: LayoutBlock[]
  /** Photo with its faces repainted as the persona by the GPU repaint model ("repaint:<id>", kept in IndexedDB). */
  repainted?: string
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

/** Identification agent scored against a span answer key; a span counts as caught if any detection overlaps it. */
export type SpanReport = {
  source: string
  docs: number
  /** Gold spans in scored categories, and how many of them a detection overlapped. */
  gold: number
  caught: number
  /** Detections that overlap a scored gold span, and detections that overlap no gold span at all. */
  correct: number
  wrong: number
  /** Detections that only overlap categories outside the scope (occupation, gender, ...). */
  outOfScope: number
  byLabel: { label: string; type: EntityType; gold: number; caught: number }[]
  missed: { record: string; label: string; value: string }[]
  falsePositives: { record: string; type: EntityType; value: string }[]
}

export type ValidationReport = {
  checkedValues: number
  leaks: { value: string; where: string }[]
  keptByPolicy: number
  entitiesByType: Partial<Record<EntityType, number>>
  media: { found: number; total: number; missed: { record: string; value: string }[] } | null
  spans?: SpanReport
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
  /** Working copy of the text-DB lane while the run is in flight; replaced by `output` at export. */
  textDb?: MaskedTable[]
  output?: MaskedTable[]
  report?: ValidationReport
  error?: string
}
