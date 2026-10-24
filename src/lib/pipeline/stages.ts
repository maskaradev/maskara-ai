import type { StageId, StageState } from "@/lib/types"

// Stage text (label, description, on-prem counterpart) lives in the i18n messages under graph.stages.

export type StageLocation = "local-db" | "browser" | "external-api" | "mock"

export type StageDef = {
  id: StageId
  location: StageLocation
  col: number
  /** 0 = Image (main), 1 = Structured, 2 = Free text, 3 = Audio; 1.5 = centered between them. */
  lane: number
  next: StageId[]
  agent?: boolean
  mock?: boolean
}

export const STAGES: StageDef[] = [
  { id: "ingest", col: 0, lane: 1.5, next: ["scan"], location: "local-db" },
  { id: "scan", col: 1, lane: 1.5, next: ["persona"], location: "browser" },
  { id: "persona", col: 2, lane: 1.5, next: ["identify", "structured", "text_detect", "audio_transcribe"], location: "browser" },
  { id: "identify", col: 3, lane: 0, next: ["generate"], location: "external-api", agent: true },
  { id: "generate", col: 4, lane: 0, next: ["validate"], location: "browser", agent: true },
  { id: "structured", col: 3, lane: 1, next: ["validate"], location: "mock", mock: true },
  { id: "text_detect", col: 3, lane: 2, next: ["validate"], location: "mock", mock: true },
  { id: "audio_transcribe", col: 3, lane: 3, next: ["validate"], location: "mock", mock: true },
  { id: "validate", col: 5, lane: 1.5, next: ["export"], location: "browser" },
  { id: "export", col: 6, lane: 1.5, next: [], location: "local-db" },
]

export const LAST_COL = 6

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDef>

export function emptyStages(): Record<StageId, StageState> {
  const pending = (): StageState => ({ status: "pending", done: 0, total: 0, logs: [] })
  return Object.fromEntries(STAGES.map((s) => [s.id, pending()])) as Record<StageId, StageState>
}
