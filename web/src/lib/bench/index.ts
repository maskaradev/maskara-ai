import external from "./external.json"

/**
 * Benchmark numbers from `maskara bench`. external.json is a copy of docs/assets/hero-external.json, written by
 * `python -m maskara.bench.hero --external`; copy it again after a new run. The linked corpus is reported
 * separately (we built it), from docs/research/bench-results.md.
 */
export type BenchPoint = {
  system: string
  label: string
  documents: number
  private: number
  direct_leak: number
  distinctness: number
  consistency: number
}

export type BenchCorpus = { corpus: string; realism: string; documents: number; points: BenchPoint[] }

export const EXTERNAL: BenchCorpus[] = external

export const CORPUS_LABEL: Record<string, string> = { abcd: "ABCD", "nemotron-pii": "Nemotron-PII", tab: "TAB" }

export const CORPUS_URL: Record<string, string> = {
  abcd: "https://github.com/asappresearch/abcd",
  "nemotron-pii": "https://huggingface.co/datasets/nvidia/Nemotron-PII",
  tab: "https://github.com/NorskRegnesentral/text-anonymization-benchmark",
}

/** Systems in the order the tables list them; maskara's rows last, where they're compared against. */
export const SYSTEM_ORDER = [
  "oracle-redact",
  "presidio-redact",
  "gliner2-redact",
  "opf-redact",
  "presidio-fake-consistent",
  "maskara-gliner2",
  "maskara-gliner2+echr",
]

export const isMaskara = (system: string) => system.startsWith("maskara")

export type LinkedRow = { label: string; directLeak: number; consistency: number; distinctness: number; maskara: boolean }

export const LINKED: { documents: number; rows: LinkedRow[] } = {
  documents: 441,
  rows: [
    { label: "Presidio", directLeak: 0.112, consistency: 0.986, distinctness: 0.041, maskara: false },
    { label: "OpenAI Privacy Filter", directLeak: 0.128, consistency: 0.996, distinctness: 0.017, maskara: false },
    { label: "Presidio + Faker", directLeak: 0.115, consistency: 0.516, distinctness: 0.99, maskara: false },
    { label: "maskara, texts only", directLeak: 0.358, consistency: 0.987, distinctness: 0.962, maskara: true },
    { label: "maskara, tables + texts", directLeak: 0, consistency: 0.995, distinctness: 0.969, maskara: true },
  ],
}

export const BENCH_DATE = "2026-10-26"
