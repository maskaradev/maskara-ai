import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { REPAINT_DIR } from "@/lib/face/repaint-cache"

/** Serves a cached repainted photo (see ../route.ts). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("Not found", { status: 404 })
  try {
    const png = await readFile(join(REPAINT_DIR, `${id}.png`))
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" } })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
