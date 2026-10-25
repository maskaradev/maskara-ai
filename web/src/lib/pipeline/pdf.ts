import type { PDFDocumentProxy } from "pdfjs-dist"

// Document lane: PDFs are rendered page by page in the browser (pdf.js) and each page goes to the same
// OCR server as the photos. Rendering here, at a known scale, keeps OCR boxes in page-canvas pixels;
// the server can read PDFs itself but doesn't report the resolution its boxes are in.

/** 2 × 72 dpi = 144 dpi: Letter pages come out about 1224 × 1584 px, plenty for the OCR model. */
const SCALE = 2

const docs = new Map<string, Promise<PDFDocumentProxy>>()
const pages = new Map<string, Promise<HTMLCanvasElement>>()

export const isPdf = (path: string) => /\.pdf($|\?)/i.test(path)

async function pdfjs() {
  const lib = await import("pdfjs-dist")
  if (!lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
  }
  return lib
}

function loadPdf(src: string): Promise<PDFDocumentProxy> {
  let doc = docs.get(src)
  if (!doc) {
    doc = pdfjs().then((lib) => lib.getDocument({ url: src }).promise)
    doc.catch(() => docs.delete(src))
    docs.set(src, doc)
  }
  return doc
}

export async function pdfPageCount(src: string): Promise<number> {
  return (await loadPdf(src)).numPages
}

/** A rendered page (1-based); cached, so the agents and every viewer share one render. */
export function renderPdfPage(src: string, page: number): Promise<HTMLCanvasElement> {
  const key = `${src}#${page}`
  let canvas = pages.get(key)
  if (!canvas) {
    canvas = (async () => {
      const p = await (await loadPdf(src)).getPage(page)
      const viewport = p.getViewport({ scale: SCALE })
      const c = document.createElement("canvas")
      c.width = Math.round(viewport.width)
      c.height = Math.round(viewport.height)
      await p.render({ canvas: c, viewport, background: "#ffffff" }).promise
      return c
    })()
    canvas.catch(() => pages.delete(key))
    pages.set(key, canvas)
  }
  return canvas
}
