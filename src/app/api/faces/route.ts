import type { FaceBox } from "@/lib/types"

// Proxy to the on-prem face detector on the GPU box (same host as the OCR server). Server-only so the
// key never reaches the browser. POST /detect, multipart `image` → { width, height, faces: [{ bbox, det_score, landmarks_5 }] }.

const DEFAULT_URL = "https://gx10-a4ea.tail0fa1f7.ts.net:10000"
const TIMEOUT_MS = 60_000
const MAX_BYTES = 20 * 1024 * 1024
/** Detections below this score are mostly patterns in hair or clothing, not faces. */
const MIN_SCORE = 0.5

type Raw = { width: number; height: number; faces: { bbox: number[]; det_score: number; landmarks_5?: number[][] }[] }

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof Blob)) return Response.json({ error: "Expected a multipart `file` field." }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: "Image is larger than 20 MB." }, { status: 413 })
  const apiKey = process.env.FACE_API_KEY || process.env.OCR_API_KEY
  if (!apiKey) return Response.json({ error: "FACE_API_KEY (or OCR_API_KEY) is not set in .env.local." }, { status: 500 })
  const base = (process.env.FACE_API_URL || DEFAULT_URL).replace(/\/+$/, "")

  const body = new FormData()
  body.append("image", file, file instanceof File && file.name ? file.name : "image.png")
  let res: Response
  try {
    res = await fetch(`${base}/detect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const cause = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error)
    return Response.json({ error: `Could not reach the face detector at ${base} (${cause}).` }, { status: 502 })
  }
  const text = await res.text()
  if (res.status === 401 || res.status === 403) return Response.json({ error: "The face detector rejected the API key." }, { status: 500 })
  if (!res.ok) return Response.json({ error: `Face detector error ${res.status}: ${text.slice(0, 300)}` }, { status: 502 })

  let raw: Raw
  try {
    raw = JSON.parse(text)
  } catch {
    return Response.json({ error: "The face detector did not return JSON." }, { status: 502 })
  }
  const faces: FaceBox[] = (raw.faces ?? [])
    .filter((f) => f.bbox?.length === 4 && f.det_score >= MIN_SCORE)
    .map((f) => ({
      box: { x0: f.bbox[0], y0: f.bbox[1], x1: f.bbox[2], y1: f.bbox[3] },
      score: f.det_score,
      landmarks: (f.landmarks_5 ?? []).map(([x, y]) => ({ x, y })),
    }))
  return Response.json({ width: raw.width, height: raw.height, faces })
}
