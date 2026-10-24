import type { StageId, StageState } from "@/lib/types"

// Stage text (label, description, on-prem counterpart) lives in the i18n messages under graph.stages.

export type StageLocation = "local-db" | "browser" | "external-api" | "gpu-repaint" | "llm-api" | "mock"

/** Stages that send data outside the browser in the MVP (none do on-prem). */
export const isExternal = (location: StageLocation) => location === "external-api" || location === "gpu-repaint" || location === "llm-api"

export type StageDef = {
  id: StageId
  location: StageLocation
  col: number
  /** 0 = Photos (PNG), 1 = Documents (PDF), 2 = Text DB, 3 = Audio; the shared trunk sits between lanes. */
  lane: number
  next: StageId[]
  agent?: boolean
  mock?: boolean
}

const TRUNK = 1.5

export const STAGES: StageDef[] = [
  { id: "ingest", col: 0, lane: TRUNK, next: ["scan"], location: "local-db" },
  { id: "scan", col: 1, lane: TRUNK, next: ["persona"], location: "browser" },
  { id: "persona", col: 2, lane: TRUNK, next: ["identify", "doc_identify", "text_identify", "audio_transcribe"], location: "browser" },
  { id: "identify", col: 3, lane: 0, next: ["generate"], location: "external-api", agent: true },
  { id: "generate", col: 4, lane: 0, next: ["validate"], location: "gpu-repaint", agent: true },
  { id: "doc_identify", col: 3, lane: 1, next: ["doc_generate"], location: "external-api", agent: true },
  { id: "doc_generate", col: 4, lane: 1, next: ["validate"], location: "browser", agent: true },
  { id: "text_identify", col: 3, lane: 2, next: ["text_generate"], location: "llm-api", agent: true },
  { id: "text_generate", col: 4, lane: 2, next: ["validate"], location: "browser", agent: true },
  { id: "audio_transcribe", col: 3, lane: 3, next: ["validate"], location: "mock", mock: true },
  { id: "validate", col: 5, lane: TRUNK, next: ["export"], location: "browser" },
  { id: "export", col: 6, lane: TRUNK, next: [], location: "local-db" },
]

export const LAST_COL = 6
export const LAST_LANE = 3

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDef>

export function emptyStages(): Record<StageId, StageState> {
  const pending = (): StageState => ({ status: "pending", done: 0, total: 0, logs: [] })
  return Object.fromEntries(STAGES.map((s) => [s.id, pending()])) as Record<StageId, StageState>
}
