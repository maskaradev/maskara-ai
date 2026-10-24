// Shows what the GPU OCR server returns, to check src/lib/ocr/indra.ts against it.
// Usage: node --env-file=.env.local scripts/probe-ocr.mjs [image] [format...]
//   e.g. node --env-file=.env.local scripts/probe-ocr.mjs public/samples/hospital/media/images/M003_wristband.png json md
// Writes the raw responses to .ocr-probe/ and prints the JSON key structure.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename } from "node:path"

const base = (process.env.OCR_API_URL || "https://gx10-a4ea.tail0fa1f7.ts.net:8443").replace(/\/+$/, "")
const [image = "public/samples/hospital/media/images/M003_wristband.png", ...formats] = process.argv.slice(2)
const headers = {}
await mkdir(".ocr-probe", { recursive: true })

for (const path of ["/openapi.json", "/docs", "/v1/models", "/health"]) {
  const res = await fetch(base + path, { headers }).catch((e) => ({ status: `unreachable (${e.cause?.message ?? e.message})` }))
  console.log(`GET ${path} → ${res.status}`)
  if (path === "/openapi.json" && res.ok) await writeFile(".ocr-probe/openapi.json", await res.text())
}

/** Prints the shape of a JSON value, collapsing arrays to their first element. */
function shape(v, indent = "", depth = 0) {
  if (depth > 8) return
  if (Array.isArray(v)) {
    console.log(`${indent}[${v.length}]`)
    if (v.length) shape(v[0], indent + "  ", depth + 1)
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      const leaf = x === null || typeof x !== "object"
      console.log(`${indent}${k}: ${leaf ? JSON.stringify(x)?.slice(0, 60) : Array.isArray(x) ? `[${x.length}]` : "{}"}`)
      if (!leaf) shape(Array.isArray(x) ? x[0] : x, indent + "  ", depth + 1)
    }
  }
}

const bytes = await readFile(image)
for (const format of formats.length ? formats : ["json", "md"]) {
  const form = new FormData()
  form.append("file", new Blob([bytes]), basename(image))
  form.append("format", format)
  const started = Date.now()
  const res = await fetch(`${base}/v1/ocr`, { method: "POST", headers, body: form })
  const text = await res.text()
  const out = `.ocr-probe/${basename(image)}.${format}.${res.headers.get("content-type")?.includes("json") ? "json" : "txt"}`
  await writeFile(out, text)
  console.log(`\nPOST /v1/ocr format=${format} → ${res.status} in ${Date.now() - started} ms, saved ${out}`)
  try {
    shape(JSON.parse(text))
  } catch {
    console.log(text.slice(0, 1500))
  }
}
