"use client"

import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { randomId } from "@/lib/hash"
import type { ColumnRole, Dataset, DetectedEntity, Persona, Run } from "@/lib/types"

// MVP "local DB": everything lives in the browser's localStorage. In the on-prem
// product this is replaced by read-only connectors to the hospital database.

const MAX_RUN_OUTPUTS = 2

type State = {
  salt: string
  datasets: Dataset[]
  runs: Run[]
  personas: Record<string, Persona>
  detectionCache: Record<string, DetectedEntity[]>
}

type Actions = {
  upsertDataset: (dataset: Dataset) => void
  removeDataset: (id: string) => void
  setColumnRole: (datasetId: string, table: string, column: string, role: ColumnRole) => void
  addRun: (run: Run) => void
  updateRun: (id: string, update: (run: Run) => Run) => void
  mergePersonas: (personas: Record<string, Persona>) => void
  cacheDetection: (key: string, entities: DetectedEntity[]) => void
}

export const QUOTA_EVENT = "maskara:quota-exceeded"

const safeLocalStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      window.dispatchEvent(new Event(QUOTA_EVENT))
    }
  },
  removeItem: (key: string) => localStorage.removeItem(key),
}

const initialState = (): State => ({
  salt: randomId() + randomId(),
  datasets: [],
  runs: [],
  personas: {},
  detectionCache: {},
})

export const useAppStore = create<State & Actions>()(
  persist(
    (set) => ({
      ...initialState(),
      upsertDataset: (dataset) =>
        set((s) => ({ datasets: [dataset, ...s.datasets.filter((d) => d.id !== dataset.id)] })),
      removeDataset: (id) => set((s) => ({ datasets: s.datasets.filter((d) => d.id !== id) })),
      setColumnRole: (datasetId, table, column, role) =>
        set((s) => ({
          datasets: s.datasets.map((d) =>
            d.id !== datasetId
              ? d
              : {
                  ...d,
                  tables: d.tables.map((t) => (t.name !== table ? t : { ...t, roles: { ...t.roles, [column]: role } })),
                },
          ),
        })),
      addRun: (run) =>
        set((s) => ({
          // Keep outputs (masked data, images) only for the most recent runs to stay under the quota.
          runs: [run, ...s.runs].map((r, i) => (i < MAX_RUN_OUTPUTS ? r : { ...r, output: undefined, textDb: undefined })),
        })),
      updateRun: (id, update) => set((s) => ({ runs: s.runs.map((r) => (r.id === id ? update(r) : r)) })),
      mergePersonas: (personas) => set((s) => ({ personas: { ...s.personas, ...personas } })),
      cacheDetection: (key, entities) => set((s) => ({ detectionCache: { ...s.detectionCache, [key]: entities } })),
    }),
    {
      // Keeps the pre-rename key so data saved under the old RLMask name still loads.
      name: "rlmask-local-db",
      version: 4,
      // v2–v4 changed the pipeline stages (image, text-DB, then photo/document agents); older runs can't be drawn.
      migrate: (persisted, version) => {
        const state = persisted as State
        return version < 4 ? { ...state, runs: [] } : state
      },
      storage: createJSONStorage(() => safeLocalStorage),
      onRehydrateStorage: () => (state) => {
        // A reload stops in-flight runs; mark them so the UI doesn't show them as running forever.
        state?.runs.forEach((r) => {
          if (r.status === "running") {
            state.updateRun(r.id, (run) => ({ ...run, status: "failed", error: "Interrupted by a page reload." }))
          }
        })
      },
    },
  ),
)

function subscribeHydration(onChange: () => void) {
  return useAppStore.persist.onFinishHydration(onChange)
}

/** True once localStorage has been read; render placeholders until then. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, () => useAppStore.persist.hasHydrated(), () => false)
}
