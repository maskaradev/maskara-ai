import { OcrServerError, runOcr } from "@/lib/ocr/indra"

const MAX_BYTES = 20 * 1024 * 1024

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const width = Number(form?.get("width"))
  const height = Number(form?.get("height"))
  if (!(file instanceof Blob) || !(width > 0) || !(height > 0)) {
    return Response.json({ error: "Expected multipart fields: file, width, height." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Image is larger than 20 MB." }, { status: 413 })
  }

  try {
    const name = file instanceof File && file.name ? file.name : "image.png"
    return Response.json(await runOcr(file, name, { width, height }))
  } catch (error) {
    if (error instanceof OcrServerError) return Response.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : "OCR failed."
    return Response.json({ error: message }, { status: 500 })
  }
}
