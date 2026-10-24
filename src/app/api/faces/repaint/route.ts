import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { REPAINT_DIR } from "@/lib/face/repaint-cache"

// Proxy to the on-prem face repaint model on the GPU box (Funnel path /face-inpaint → :8200): POST /v1/repaint, multipart image + persona
// (+ prompt) → the whole image as PNG with every face repainted as that persona. The same persona
// always gets the same face, so a patient looks the same in every photo.
//
// Repainted images are too big for localStorage, so they're cached on disk here and the run only keeps
// their URL (GET /api/faces/repaint/<id>).

const DEFAULT_URL = "https://gx10-a4ea.tail0fa1f7.ts.net:8443/face-inpaint"
const TIMEOUT_MS = 180_000
const MAX_BYTES = 20 * 1024 * 1024
const HEALTH_TIMEOUT_MS = 5_000
const HEALTH_TTL_MS = 30_000

// An unreachable host only fails after the OS connect timeout (over a minute), so check /health
// quickly first and remember the answer briefly.
let health: { at: number; error: string | null } | null = null

async function reachable(base: string): Promise<string | null> {
  if (health && Date.now() - health.at < HEALTH_TTL_MS) return health.error
  let error: string | null = null
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    if (!res.ok) error = `health check returned ${res.status}`
  } catch (e) {
    error = e instanceof Error ? ((e.cause as Error | undefined)?.message ?? e.message) : String(e)
  }
  health = { at: Date.now(), error }
  return error
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const persona = String(form?.get("persona") ?? "")
  const prompt = String(form?.get("prompt") ?? "")
  if (!(file instanceof Blob) || !persona) return Response.json({ error: "Expected multipart fields: file, persona." }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: "Image is larger than 20 MB." }, { status: 413 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const id = createHash("sha256").update(bytes).update(`\0${persona}\0${prompt}`).digest("hex").slice(0, 32)
  const path = join(REPAINT_DIR, `${id}.png`)
  const url = `/api/faces/repaint/${id}`
  const cached = await readFile(path).then(() => true, () => false)
  if (cached) return Response.json({ url, cached: true })

  const base = (process.env.FACE_REPAINT_URL || DEFAULT_URL).replace(/\/+$/, "")
  const down = await reachable(base)
  if (down) return Response.json({ error: `Face repaint server at ${base} is unreachable (${down}).` }, { status: 502 })
  const body = new FormData()
  body.append("image", new Blob([bytes], { type: file.type || "image/png" }), file instanceof File && file.name ? file.name : "image.png")
  body.append("persona", persona)
  if (prompt) body.append("prompt", prompt)
  let res: Response
  try {
    res = await fetch(`${base}/v1/repaint`, { method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (error) {
    const cause = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error)
    if (error instanceof Error && error.name === "TimeoutError") return Response.json({ error: `Face repaint timed out after ${TIMEOUT_MS / 1000}s.` }, { status: 504 })
    return Response.json({ error: `Could not reach the face repaint server at ${base} (${cause}).` }, { status: 502 })
  }
  if (!res.ok) return Response.json({ error: `Face repaint error ${res.status}: ${(await res.text()).slice(0, 300)}` }, { status: 502 })
  if (!res.headers.get("content-type")?.startsWith("image/")) return Response.json({ error: "Face repaint did not return an image." }, { status: 502 })

  await mkdir(REPAINT_DIR, { recursive: true })
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
  return Response.json({
    url,
    cached: false,
    faces: Number(res.headers.get("x-faces") ?? NaN),
    seed: res.headers.get("x-seed"),
    elapsedMs: Number(res.headers.get("x-elapsed-ms") ?? NaN),
  })
}
