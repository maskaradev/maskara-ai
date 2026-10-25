"use client"

import { mediaUrl } from "@/lib/datasets"
import { hash53, hashOf, pick, randomId } from "@/lib/hash"
import {
  MaskContext,
  type EntitySpan,
  escapeRegExp,
  locateEntities,
  maskText,
  normName,
  renderAddress,
  renderDigits,
  renderEmail,
  renderEntity,
  renderName,
  renderPhone,
  renderSsn,
  renderZip,
  shiftDatesIn,
  splitName,
  streetCore,
} from "@/lib/mask"
import { CITIES, normalizeSex, shiftIsoDate } from "@/lib/personas"
import { isPdf, pdfPageCount } from "@/lib/pipeline/pdf"
import { emptyStages } from "@/lib/pipeline/stages"
import { computeUtility } from "@/lib/pipeline/utility"
import type { DetectRequest } from "@/lib/pii-schema"
import { f1, precision, recall, scoreSpans } from "@/lib/pii/span-eval"
import { SENSITIVE_ROLES } from "@/lib/roles"
import { useAppStore } from "@/lib/store"
import type {
  Dataset,
  DetectedEntity,
  EntityType,
  ImageItem,
  MaskedCell,
  MaskedTable,
  Row,
  Run,
  Segment,
  StageId,
  Table,
  ValidationReport,
} from "@/lib/types"

const API_CONCURRENCY = 6
/** The GPU OCR server is a single box; keep a couple of images in flight. */
const OCR_CONCURRENCY = 2
/** Face repaint is a diffusion model on the same GPU box; one photo at a time. */
const REPAINT_CONCURRENCY = 1

type Progress = { setTotal: (n: number) => void; tick: (n?: number) => void; log: (msg: string) => void }

type Cell = { table: number; row: number; column: string; rowKey: string | null; label: string }

function semaphore(limit: number) {
  let active = 0
  const queue: (() => void)[] = []
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve))
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

export function startRun(datasetId: string): string {
  const store = useAppStore.getState()
  const dataset = store.datasets.find((d) => d.id === datasetId)
  if (!dataset) throw new Error("Dataset not found")
  const run: Run = {
    id: randomId("run-"),
    number: (store.runs[0]?.number ?? 0) + 1,
    datasetId,
    datasetName: dataset.name,
    status: "running",
    startedAt: Date.now(),
    stages: emptyStages(),
    rowsProcessed: 0,
    entitiesReplaced: 0,
    apiCalls: 0,
    cacheHits: 0,
  }
  store.addRun(run)
  void execute(run.id, structuredClone(dataset))
  return run.id
}

async function execute(runId: string, dataset: Dataset) {
  const update = (fn: (r: Run) => Run) => useAppStore.getState().updateRun(runId, fn)
  const patchStage = (id: StageId, patch: Partial<Run["stages"][StageId]>) =>
    update((r) => ({ ...r, stages: { ...r.stages, [id]: { ...r.stages[id], ...patch } } }))
  const bump = (patch: Partial<Pick<Run, "entitiesReplaced" | "apiCalls" | "cacheHits">>) =>
    update((r) => ({
      ...r,
      entitiesReplaced: r.entitiesReplaced + (patch.entitiesReplaced ?? 0),
      apiCalls: r.apiCalls + (patch.apiCalls ?? 0),
      cacheHits: r.cacheHits + (patch.cacheHits ?? 0),
    }))

  async function stage(id: StageId, fn: (p: Progress) => Promise<void> | void) {
    patchStage(id, { status: "running", startedAt: Date.now() })
    const p: Progress = {
      setTotal: (total) => patchStage(id, { total }),
      tick: (n = 1) => update((r) => ({ ...r, stages: { ...r.stages, [id]: { ...r.stages[id], done: r.stages[id].done + n } } })),
      log: (msg) => update((r) => ({ ...r, stages: { ...r.stages, [id]: { ...r.stages[id], logs: [...r.stages[id].logs, msg] } } })),
    }
    try {
      await fn(p)
      patchStage(id, { status: "succeeded", finishedAt: Date.now() })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patchStage(id, { status: "failed", finishedAt: Date.now(), error: message })
      throw error
    }
  }
  const skip = (id: StageId, reason: string) => patchStage(id, { status: "skipped", logs: [reason] })

  const limit = semaphore(API_CONCURRENCY)
  async function detect(text: string, context: DetectRequest["context"], engine: DetectRequest["engine"] = "claude"): Promise<DetectedEntity[]> {
    const key = String(hash53(JSON.stringify(engine === "claude" ? { v: 2, text, context } : { v: 3, text, context, engine })))
    const cached = useAppStore.getState().detectionCache[key]
    if (cached) {
      bump({ cacheHits: 1 })
      return cached
    }
    return limit(async () => {
      const res = await fetch("/api/detect-pii", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context, engine } satisfies DetectRequest),
      })
      bump({ apiCalls: 1 })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `PII detection failed (${res.status})`)
      useAppStore.getState().cacheDetection(key, body.entities)
      return body.entities as DetectedEntity[]
    })
  }

  const ctx = new MaskContext(useAppStore.getState().salt, dataset.id, dataset.name, useAppStore.getState().personas)
  const tables = dataset.tables
  const output: MaskedTable[] = tables.map((t) => ({ name: t.name, columns: t.columns, roles: t.roles, rows: [] }))
  const entityCounts: Partial<Record<EntityType, number>> = {}
  const replacedOriginals = new Map<string, string>()
  const mediaEntities = new Map<string, DetectedEntity[]>()
  let keptByPolicy = 0
  const globalOffset = (hashOf(ctx.salt, "global-offset", dataset.id) % 61) - 30 || 11

  const colsWithRole = (t: Table, role: string) => t.columns.filter((c) => t.roles[c] === role)
  const rowKey = (t: Table, row: Row): string | null => {
    const pk = colsWithRole(t, "person_key")[0]
    if (pk && row[pk]) return ctx.personKey(row[pk])
    const nameCol = colsWithRole(t, "name")[0]
    return nameCol && row[nameCol] ? ctx.personKey("name:" + normName(row[nameCol])) : null
  }
  const providerNames = [...new Set(tables.flatMap((t) => colsWithRole(t, "provider").flatMap((c) => t.rows.map((r) => r[c]))))]
    .filter(Boolean)
    .slice(0, 50)
  const recordText = (results: { segments: Segment[]; replaced: number; kept: number }, entities: DetectedEntity[], key: string | null) => {
    keptByPolicy += results.kept
    bump({ entitiesReplaced: results.replaced })
    for (const s of results.segments) {
      if (!s.entity || s.text === s.entity.original) continue
      entityCounts[s.entity.type] = (entityCounts[s.entity.type] ?? 0) + 1
      replacedOriginals.set(s.entity.original, `${s.entity.type.toLowerCase()} in ${key ?? "text"}`)
    }
    return entities
  }
  const detectContext = (key: string | null, source: DetectRequest["context"]["source"]): DetectRequest["context"] => ({
    patientName: key ? (ctx.patients.get(key)?.name ?? null) : null,
    providers: providerNames,
    source,
  })

  const setCell = (cell: Cell, value: MaskedCell) => {
    output[cell.table].rows[cell.row][cell.column] = value
  }
  // Cells are replaced, never mutated, so copying the rows is enough for the store to see a change.
  const publishText = () => update((r) => ({ ...r, textDb: output.map((t) => ({ ...t, rows: t.rows.map((row) => ({ ...row })) })) }))

  /** Replaces the structured PII columns of one row in place; returns how many values changed. */
  const maskStructuredRow = (t: Table, row: Row, out: Record<string, MaskedCell>): number => {
    const key = rowKey(t, row)
    const persona = key ? ctx.patientPersona(key) : undefined
    const offset = persona?.dateOffsetDays ?? globalOffset
    let changed = 0
    for (const c of t.columns) {
      const v = row[c] ?? ""
      const role = t.roles[c]
      if (!v || out[c].kind !== "value") continue
      const value = (masked: string) => {
        if (masked !== v) {
          changed++
          if (SENSITIVE_ROLES.includes(role) && role !== "date") replacedOriginals.set(v, `${t.name}.${c}`)
        }
        out[c] = { kind: "value", value: masked, original: v }
      }
      switch (role) {
        case "person_key":
          value(renderDigits(ctx, v, "pk"))
          break
        case "name":
          value(persona ? renderName(v, splitName(v), persona) : v)
          break
        case "dob":
          value(persona?.birthDate ?? (/^\d{4}-\d{2}-\d{2}/.test(v) ? shiftIsoDate(v, offset) : shiftDatesIn(v, offset)))
          break
        case "date":
          value(shiftDatesIn(v, offset))
          break
        case "ssn":
          value(renderSsn(ctx, v))
          break
        case "phone":
          value(renderPhone(ctx, v, persona))
          break
        case "email":
          value(renderEmail(ctx, v, persona))
          break
        case "street": {
          const rep = ctx.alias("street", normName(v)) ?? persona?.street ?? renderAddress(ctx, v)
          ctx.setAlias("street", normName(v), rep)
          ctx.addWordAlias(streetCore(v), streetCore(rep))
          value(rep)
          break
        }
        case "city": {
          const rep = ctx.alias("city", v.toLowerCase()) ?? pick(CITIES, hashOf(ctx.salt, "city", v.toLowerCase()))
          ctx.setAlias("city", v.toLowerCase(), rep)
          ctx.addWordAlias(v, rep)
          value(rep)
          break
        }
        case "zip":
          value(renderZip(ctx, v))
          break
        case "id":
          value(renderDigits(ctx, v))
          break
        case "provider": {
          const providerPersona = ctx.ensurePersona(ctx.providerKey(v), { kind: "provider", sex: "U" })
          value(renderName(v, splitName(v), providerPersona))
          break
        }
      }
    }
    return changed
  }

  try {
    await stage("ingest", (p) => {
      p.setTotal(tables.length)
      for (const t of tables) {
        p.log(`${t.name}: ${t.rows.length} rows × ${t.columns.length} columns`)
        p.tick()
      }
      update((r) => ({ ...r, rowsProcessed: tables.reduce((n, t) => n + t.rows.length, 0) }))
    })

    let imageItems: ImageItem[] = []
    const patchImage = (i: number, patch: Partial<ImageItem>) => {
      imageItems = imageItems.map((item, j) => (j === i ? { ...item, ...patch } : item))
      update((r) => ({ ...r, images: imageItems }))
    }

    const textCells: Cell[] = []
    const imageCells: Cell[] = []
    // Each image cell owns run.images[first .. first + count): one item for a photo, one per page for a PDF.
    type MediaCell = { cell: Cell; first: number; count: number }
    const photoCells: MediaCell[] = []
    const docCells: MediaCell[] = []

    await stage("scan", async (p) => {
      p.setTotal(tables.length)
      tables.forEach((t, ti) => {
        const counts: Record<string, number> = {}
        t.columns.forEach((c) => (counts[t.roles[c]] = (counts[t.roles[c]] ?? 0) + 1))
        p.log(`${t.name}: ${Object.entries(counts).map(([role, n]) => `${n} ${role}`).join(", ")}`)
        const label = (row: Row, ri: number) => row[t.columns[0]] || `${t.name}#${ri + 1}`
        t.rows.forEach((row, ri) => {
          const key = rowKey(t, row)
          // Transcripts are text like any other; speech recognition is not part of the MVP, so recordings are redacted.
          for (const c of [...colsWithRole(t, "free_text"), ...colsWithRole(t, "transcript")]) if (row[c]?.trim()) textCells.push({ table: ti, row: ri, column: c, rowKey: key, label: label(row, ri) })
          for (const c of colsWithRole(t, "image")) if (row[c]) imageCells.push({ table: ti, row: ri, column: c, rowKey: key, label: label(row, ri) })
        })
        p.tick()
      })
      // Photos (PNG/JPEG) and documents (PDF) go to separate lanes; both use the same OCR model.
      for (const cell of imageCells) {
        const src = mediaUrl(dataset, tables[cell.table].rows[cell.row][cell.column])
        const base = { table: tables[cell.table].name, column: cell.column, src, status: "pending" as const, words: [], regions: [], ocr: [] }
        if (!isPdf(src)) {
          photoCells.push({ cell, first: imageItems.length, count: 1 })
          imageItems.push({ ...base, id: cell.label, kind: "photo" })
          continue
        }
        let count = 1
        let error: string | undefined
        try {
          count = await pdfPageCount(src)
        } catch (e) {
          error = `Could not open the PDF: ${e instanceof Error ? e.message : String(e)}`
        }
        docCells.push({ cell, first: imageItems.length, count })
        for (let page = 1; page <= count; page++) {
          imageItems.push({ ...base, id: `${cell.label} · p${page}`, kind: "document", page, pageCount: count, ...(error ? { status: "failed" as const, error } : {}) })
        }
      }
      const pageTotal = docCells.reduce((n, d) => n + d.count, 0)
      p.log(
        `Work: ${photoCells.length} photos, ${docCells.length} PDFs (${pageTotal} pages) and ${textCells.length} free-text cells for the agents`,
      )
      update((r) => ({ ...r, images: imageItems }))

      // Output skeleton: every cell starts as its original; the agents replace cells as they go.
      tables.forEach((t, ti) =>
        t.rows.forEach((row, ri) => {
          const out: Record<string, MaskedCell> = {}
          for (const c of t.columns) {
            const v = row[c] ?? ""
            const role = t.roles[c]
            if (v && role === "audio") out[c] = { kind: "value", value: "[REDACTED]", original: v }
            else if (!v || !["free_text", "transcript", "image"].includes(role)) out[c] = { kind: "value", value: v, original: v }
            else if (role === "image") {
              const media = [...photoCells, ...docCells].find(({ cell: x }) => x.table === ti && x.row === ri && x.column === c)
              out[c] = { kind: "image", original: mediaUrl(dataset, v), item: media?.first ?? -1, ...(media && media.count > 1 ? { pages: media.count } : {}) }
            }
            else out[c] = { kind: "text", segments: [{ text: v }], original: v, ...(v.trim() ? { agent: { status: "pending" as const } } : {}) }
          }
          output[ti].rows.push(out)
        }),
      )
      publishText()
    })

    await stage("persona", (p) => {
      for (const t of tables) {
        const col = (role: string) => colsWithRole(t, role)[0]
        for (const row of t.rows) {
          const key = rowKey(t, row)
          if (!key) continue
          ctx.registerPatient(key, {
            name: col("name") ? row[col("name")] : undefined,
            sex: normalizeSex(col("sex") ? row[col("sex")] : undefined),
            dob: col("dob") ? row[col("dob")] : undefined,
          })
        }
      }
      const before = ctx.personas.size
      p.setTotal(ctx.patients.size + providerNames.length)
      for (const key of ctx.patients.keys()) {
        ctx.patientPersona(key)
        p.tick()
      }
      for (const name of providerNames) {
        ctx.ensurePersona(ctx.providerKey(name), { kind: "provider", sex: "U" })
        p.tick()
      }
      p.log(`${ctx.patients.size} people, ${providerNames.length} providers`)
      p.log(`${ctx.personas.size - before} new personas; ${before} reused from earlier runs`)
    })

    // Text-DB lane: identification agent (schema roles + LLM) -> generation agent (mapping table).
    const textEntities: (DetectedEntity[] | null)[] = []
    const textSpans: (EntitySpan[] | null)[] = []
    const identifyText = () =>
      stage("text_identify", async (p) => {
        p.setTotal(textCells.length)
        for (const t of tables) {
          const cols = t.columns.filter((c) => SENSITIVE_ROLES.includes(t.roles[c]))
          if (!cols.length) continue
          const n = t.rows.reduce((sum, row) => sum + cols.filter((c) => row[c]).length, 0)
          p.log(`${t.name}: ${n} values in ${cols.length} PII columns, from the schema roles (${cols.join(", ")})`)
        }
        if (!textCells.length) return p.log("No free-text cells, so nothing goes to the LLM.")
        p.log(`Sending ${textCells.length} free-text cells to Claude…`)
        let failures = 0
        let found = 0
        const cellLimit = semaphore(API_CONCURRENCY)
        await Promise.all(
          textCells.map((cell, i) =>
            cellLimit(async () => {
              const text = tables[cell.table].rows[cell.row][cell.column]
              setCell(cell, { kind: "text", segments: [{ text }], original: text, agent: { status: "identifying" } })
              publishText()
              try {
                const source = tables[cell.table].roles[cell.column] === "transcript" ? "transcript" : "clinical_text"
                const entities = await detect(text, detectContext(cell.rowKey, source))
                const spans = locateEntities(text, entities)
                textEntities[i] = entities
                textSpans[i] = spans
                found += spans.length
                setCell(cell, { kind: "text", segments: markSpans(text, spans), original: text, agent: { status: "identified" } })
                p.log(`${cell.label}.${cell.column}: ${spans.length} PII spans`)
              } catch (error) {
                // One failed cell shouldn't stop the others; generation redacts it whole.
                failures++
                textEntities[i] = null
                textSpans[i] = null
                const message = error instanceof Error ? error.message : String(error)
                setCell(cell, { kind: "text", segments: [{ text }], original: text, agent: { status: "failed", error: message } })
                p.log(`${cell.label}.${cell.column}: failed — ${message}`)
              }
              publishText()
              p.tick()
            }),
          ),
        )
        p.log(`${found} PII spans in ${textCells.length - failures} cells`)
        if (failures === textCells.length) throw new Error("The identification agent could not process any text cell.")
      })

    const generateText = () =>
      stage("text_generate", (p) => {
        p.setTotal(tables.reduce((n, t) => n + t.rows.length, 0) + textCells.length)
        let changed = 0
        tables.forEach((t, ti) => {
          t.rows.forEach((row, ri) => {
            changed += maskStructuredRow(t, row, output[ti].rows[ri])
            p.tick()
          })
        })
        bump({ entitiesReplaced: changed })
        p.log(`${changed} structured values replaced from the mapping table`)

        let spans = 0
        let redacted = 0
        textCells.forEach((cell, i) => {
          const text = tables[cell.table].rows[cell.row][cell.column]
          const entities = textEntities[i]
          if (!entities) {
            redacted++
            setCell(cell, { kind: "text", segments: [{ text: "[REDACTED]", entity: { type: "OTHER", original: text } }], original: text, agent: { status: "generated" } })
          } else {
            const result = maskText(ctx, text, entities, cell.rowKey)
            recordText(result, entities, cell.label)
            spans += result.replaced
            setCell(cell, { kind: "text", segments: result.segments, original: text, agent: { status: "generated" } })
          }
          p.tick()
        })
        bump({ entitiesReplaced: redacted })
        p.log(`${spans} spans replaced in ${textCells.length} free-text cells`)
        if (redacted) p.log(`${redacted} cells the identification agent could not read were redacted whole`)
        publishText()
      })

    // Photo lane (PNG/JPEG): identification agent (face detector + GPU OCR + layout -> on-prem privacy
    // filter + form rules) -> generation agent (GPU repaint of faces as the persona, persona values over text).
    const located: { spans: EntitySpan[]; ocrText: string }[] = []
    const identifyAgent = async () => {
      if (!photoCells.length) return skip("identify", "No photos.")
      const { detectFaces, faceRegions, layoutRegions, loadImage, ocrAroundFaces, ocrImage, refineWords, spansToRegions } = await import("@/lib/pipeline/image")
      await stage("identify", async (p) => {
        p.setTotal(photoCells.length)
        p.log(`Sending ${photoCells.length} photos to the face detector and the GPU OCR server (lines, layout), then the OCR text to the privacy filter…`)
        let failures = 0
        const ocrLimit = semaphore(OCR_CONCURRENCY)
        await Promise.all(
          photoCells.map(({ cell, first: i }) =>
            ocrLimit(async () => {
              patchImage(i, { status: "identifying" })
              try {
                const item = imageItems[i]
                const img = await loadImage(item.src)
                // A face the detector can't check is a face we can't promise to hide, so its failure fails the photo.
                const [firstOcr, faces] = await Promise.all([ocrImage(item.src, img), detectFaces(item.src, img)])
                let rawOcr = firstOcr
                if (rawOcr.rotation && faces.length) {
                  // A face can throw off the OCR's orientation check; read the parts around the faces instead.
                  const retry = await ocrAroundFaces(img, faces, `${cell.label}-crop.png`)
                  p.log(`${cell.label}: OCR saw the photo as rotated ${rawOcr.rotation}°; re-read the areas around the face → rotated ${retry.rotation}°`)
                  rawOcr = retry
                }
                const ocr = refineWords(img, rawOcr)
                const entities = ocr.text.trim() ? await detect(ocr.text, detectContext(cell.rowKey, "ocr"), "local") : []
                mediaEntities.set(cell.label, entities)
                const spans = locateEntities(ocr.text, entities)
                located[i] = { spans, ocrText: ocr.text }
                const textRegions = spansToRegions(
                  img,
                  ocr,
                  spans.map((s) => ({ start: s.start, end: s.end, type: s.entity.type, original: s.entity.text })),
                )
                const visualRegions = layoutRegions(img, ocr.blocks)
                const faceBlanks = faceRegions(img, faces)
                patchImage(i, {
                  status: "identified",
                  words: ocr.words.map((w) => w.bbox),
                  blocks: ocr.blocks,
                  regions: [...faceBlanks, ...textRegions, ...visualRegions],
                  ocr: maskText(ctx, ocr.text, [], cell.rowKey).segments,
                })
                const kinds = Object.entries(Object.groupBy(ocr.blocks, (b) => b.label)).map(([label, bs]) => `${bs!.length} ${label}`)
                p.log(
                  `${cell.label}: ${faces.length} face${faces.length === 1 ? "" : "s"}` +
                    (faces.length ? ` (score ${faces.map((f) => f.score.toFixed(2)).join(", ")})` : "") +
                    `; ${ocr.words.length} words, layout ${kinds.join(", ") || "none"}` +
                    (ocr.droppedLines ? `, ${ocr.droppedLines} noise lines dropped` : "") +
                    `; ${spans.length} PII spans → ${textRegions.length} blanks` +
                    (visualRegions.length ? `, ${visualRegions.length} unreadable handwriting masked whole as signature` : ""),
                )
                if (ocr.lowConfidence.length) p.log(`${cell.label}: low OCR confidence, check by eye: ${ocr.lowConfidence.map((t) => `"${t}"`).join(", ")}`)
                if (ocr.rotation || Math.abs(ocr.skew) > 1) p.log(`${cell.label}: page rotated ${ocr.rotation}° / skewed ${ocr.skew.toFixed(1)}°; check the blank positions`)
              } catch (error) {
                // One unreadable photo shouldn't stop the others.
                failures++
                located[i] = { spans: [], ocrText: "" }
                const message = error instanceof Error ? error.message : String(error)
                patchImage(i, { status: "failed", error: message })
                p.log(`${cell.label}: failed — ${message}`)
              }
              p.tick()
            }),
          ),
        )
        if (failures === photoCells.length) throw new Error("The photo identification agent could not process any photo.")
      })
    }

    const personaName = (key: string | null) => {
      const persona = key ? ctx.patientPersona(key) : undefined
      return persona ? `${persona.firstName} ${persona.lastName}` : null
    }

    /** Persona id and prompt for the repaint model; the id makes the same patient get the same face. */
    const repaintTarget = (key: string | null, label: string) => {
      const persona = key ? ctx.patientPersona(key) : undefined
      if (!persona) return { id: `${dataset.id}:${label}`, prompt: "a photo of a person's face, realistic" }
      const born = persona.birthDate ? new Date(persona.birthDate) : null
      const age = born && !Number.isNaN(born.getTime()) ? Math.floor((Date.now() - born.getTime()) / (365.25 * 86_400_000)) : null
      const who = persona.sex === "F" ? "woman" : persona.sex === "M" ? "man" : "person"
      return { id: persona.key, prompt: `a photo of a ${age ? `${Math.min(age, 90)} year old ` : ""}${who}'s face, realistic` }
    }

    const generateAgent = async () => {
      if (!photoCells.length) return skip("generate", "No photos.")
      const { repaintFaces } = await import("@/lib/pipeline/image")
      await stage("generate", async (p) => {
        p.setTotal(photoCells.length)
        const repaintLimit = semaphore(REPAINT_CONCURRENCY)
        await Promise.all(
          photoCells.map(async ({ cell, first: i }) => {
            if (imageItems[i].status === "failed") return p.tick()
            const { spans, ocrText } = located[i]
            const result = maskText(ctx, ocrText, spans.map((s) => s.entity), cell.rowKey)
            recordText(result, [], cell.label)
            const replacements = spans.map((s) => renderEntity(ctx, s.entity, cell.rowKey))
            // The largest face in a patient's photo is the patient, so it takes their persona.
            const patient = personaName(cell.rowKey)
            let faceIndex = 0
            const regions = imageItems[i].regions.map((region) => {
              if (region.visual === "face") {
                const k = faceIndex++
                return { ...region, replacement: k === 0 && patient ? patient : `${cell.label} person ${k + 1}` }
              }
              if (region.visual) return region
              return region.first && region.span !== undefined ? { ...region, replacement: replacements[region.span] } : region
            })
            const faces = regions.filter((x) => x.visual === "face").length
            // Faces: the GPU repaint model redraws them as the persona. If it can't, the photo fails
            // rather than going out with the original face.
            let repainted: string | undefined
            if (faces) {
              const target = repaintTarget(cell.rowKey, cell.label)
              try {
                repainted = await repaintLimit(() => repaintFaces(imageItems[i].src, target.id, target.prompt))
              } catch (error) {
                const message = `Face repaint failed — ${error instanceof Error ? error.message : String(error)}`
                patchImage(i, { status: "failed", error: message })
                p.log(`${cell.label}: ${message}`)
                return p.tick()
              }
            }
            patchImage(i, { status: "generated", regions, ocr: result.segments, repainted })
            const signatures = regions.filter((x) => x.visual === "signature").length
            p.log(
              `${cell.label}: ${regions.filter((x) => x.first && !x.visual).length} persona values drawn` +
                (faces ? `, ${faces} face${faces === 1 ? "" : "s"} → repainted${patient ? ` as ${patient}` : ""}` : "") +
                (signatures ? `, ${signatures} synthetic signatures` : ""),
            )
            p.tick()
          }),
        )
      })
    }

    // Document lane (PDF): identification agent (pages rendered in the browser -> the same GPU OCR ->
    // the privacy filter on the whole document) -> generation agent (persona values on every page).
    const docLocated: ({ spans: EntitySpan[]; entities: DetectedEntity[]; pageTexts: string[] } | null)[] = []
    const identifyDocs = async () => {
      if (!docCells.length) return skip("doc_identify", "No PDF documents.")
      const { layoutRegions, loadRaster, ocrPage, refineWords, spansToRegions } = await import("@/lib/pipeline/image")
      await stage("doc_identify", async (p) => {
        const pageTotal = docCells.reduce((n, d) => n + d.count, 0)
        p.setTotal(pageTotal)
        p.log(`Rendering ${docCells.length} PDFs (${pageTotal} pages) and sending each page to the GPU OCR server, then each document's text to the privacy filter…`)
        let failures = 0
        const ocrLimit = semaphore(OCR_CONCURRENCY)
        await Promise.all(
          docCells.map(async ({ cell, first, count }, di) => {
            const items = Array.from({ length: count }, (_, k) => first + k)
            if (imageItems[first].status === "failed") {
              failures++
              docLocated[di] = null
              p.tick(count)
              return p.log(`${cell.label}: failed — ${imageItems[first].error}`)
            }
            items.forEach((i) => patchImage(i, { status: "identifying" }))
            try {
              const pages = await Promise.all(
                items.map((i, k) =>
                  ocrLimit(async () => {
                    const canvas = (await loadRaster(imageItems[i])) as HTMLCanvasElement
                    const ocr = refineWords(canvas, await ocrPage(canvas, `${cell.label}-p${k + 1}.png`))
                    patchImage(i, { words: ocr.words.map((w) => w.bbox), blocks: ocr.blocks })
                    p.tick()
                    return { canvas, ocr }
                  }),
                ),
              )
              // One text for the whole document, so a name introduced on page 1 is recognised on page 2.
              const offsets: number[] = []
              let text = ""
              for (const { ocr } of pages) {
                offsets.push(text.length)
                text += ocr.text + "\n\n"
              }
              const entities = text.trim() ? await detect(text.trimEnd(), detectContext(cell.rowKey, "ocr"), "local") : []
              mediaEntities.set(cell.label, entities)
              const spans = locateEntities(text, entities)
              docLocated[di] = { spans, entities, pageTexts: pages.map((pg) => pg.ocr.text) }
              let blanks = 0
              pages.forEach(({ canvas, ocr }, k) => {
                const start = offsets[k]
                const end = start + ocr.text.length
                const onPage = spans.flatMap((s, index) =>
                  s.start < end && s.end > start ? [{ start: s.start - start, end: s.end - start, type: s.entity.type, original: s.entity.text, index }] : [],
                )
                // spansToRegions numbers spans per page; point them back at the document's span list.
                const textRegions = spansToRegions(canvas, ocr, onPage).map((r) => ({ ...r, span: r.span === undefined ? undefined : onPage[r.span].index }))
                const visualRegions = layoutRegions(canvas, ocr.blocks)
                blanks += textRegions.length
                patchImage(items[k], {
                  status: "identified",
                  regions: [...textRegions, ...visualRegions],
                  ocr: maskText(ctx, ocr.text, [], cell.rowKey).segments,
                })
              })
              const words = pages.reduce((n, pg) => n + pg.ocr.words.length, 0)
              p.log(`${cell.label}: ${count} page${count === 1 ? "" : "s"}, ${words} words; ${spans.length} PII spans → ${blanks} blanks`)
              const low = pages.flatMap((pg) => pg.ocr.lowConfidence)
              if (low.length) p.log(`${cell.label}: low OCR confidence, check by eye: ${low.map((t) => `"${t}"`).join(", ")}`)
            } catch (error) {
              failures++
              docLocated[di] = null
              const message = error instanceof Error ? error.message : String(error)
              items.forEach((i) => patchImage(i, { status: "failed", error: message }))
              p.log(`${cell.label}: failed — ${message}`)
            }
          }),
        )
        if (failures === docCells.length) throw new Error("The document identification agent could not process any PDF.")
      })
    }

    const generateDocs = async () => {
      if (!docCells.length) return skip("doc_generate", "No PDF documents.")
      await stage("doc_generate", (p) => {
        p.setTotal(docCells.reduce((n, d) => n + d.count, 0))
        docCells.forEach(({ cell, first, count }, di) => {
          const doc = docLocated[di]
          if (!doc) return p.tick(count)
          const replacements = doc.spans.map((s) => renderEntity(ctx, s.entity, cell.rowKey))
          let drawn = 0
          doc.pageTexts.forEach((pageText, k) => {
            const i = first + k
            const result = maskText(ctx, pageText, doc.entities, cell.rowKey)
            recordText(result, [], `${cell.label} p${k + 1}`)
            const regions = imageItems[i].regions.map((region) =>
              region.visual || !region.first || region.span === undefined ? region : { ...region, replacement: replacements[region.span] },
            )
            drawn += regions.filter((x) => x.replacement).length
            patchImage(i, { status: "generated", regions, ocr: result.segments })
            p.tick()
          })
          p.log(`${cell.label}: ${drawn} persona values drawn across ${count} page${count === 1 ? "" : "s"}`)
        })
      })
    }

    // All generation shares one mapping table. The text-DB lane fills it first (streets, cities,
    // contacts), so image and speech replacements match the tables and don't depend on timing.
    const firstFailure = (results: PromiseSettledResult<unknown>[]) => {
      const failed = results.find((l): l is PromiseRejectedResult => l.status === "rejected")
      if (failed) throw failed.reason
    }
    const textLane = identifyText().then(generateText)
    const afterText = (identify: Promise<void>, generate: () => Promise<void>) =>
      Promise.allSettled([identify, textLane]).then((results) => {
        firstFailure(results)
        return generate()
      })
    const photoLane = afterText(identifyAgent(), generateAgent)
    const docLane = afterText(identifyDocs(), generateDocs)
    firstFailure(await Promise.allSettled([textLane, photoLane, docLane]))

    let report: ValidationReport | undefined
    await stage("validate", (p) => {
      report = validate(output, imageItems, replacedOriginals, mediaEntities, dataset, entityCounts, keptByPolicy)
      const key = dataset.spanKey
      if (key) {
        // Scores what the identification agent found, before the masking policy keeps anything.
        const docs = textCells.flatMap((cell, i) => {
          const spans = textSpans[i]
          const gold = key.records[cell.label]?.spans
          if (!spans || !gold || tables[cell.table].name !== key.table || cell.column !== key.column) return []
          const text = tables[cell.table].rows[cell.row][cell.column]
          return [{ record: cell.label, text, gold, detected: spans.map((s) => ({ start: s.start, end: s.end, type: s.entity.type })) }]
        })
        report.spans = scoreSpans(key, docs)
      }
      const utility = computeUtility(output, undefined, imageItems)
      report.utility = utility
      p.setTotal(report.checkedValues + utility.total)
      p.tick(report.checkedValues + utility.total)
      p.log(`Privacy: ${report.checkedValues} original values searched for in the output`)
      p.log(report.leaks.length ? `Privacy: ${report.leaks.length} possible leaks` : "Privacy: no original values found in the output")
      if (report.media) p.log(`Privacy: image answer key ${report.media.found}/${report.media.total} identifiers caught`)
      if (report.spans) {
        const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)
        const s = report.spans
        p.log(`Detection: ${s.source} answer key, ${s.docs} documents — recall ${pct(recall(s))} (${s.caught}/${s.gold}), precision ${pct(precision(s))}, F1 ${pct(f1(s))}`)
      }
      p.log(`Utility: ${utility.passed}/${utility.total} checks passed`)
      for (const c of utility.checks.filter((c) => c.pass === false)) p.log(`Utility ✕ ${c.label}: ${c.original} → ${c.masked}`)
    })

    await stage("export", (p) => {
      p.setTotal(output.length)
      useAppStore.getState().mergePersonas(Object.fromEntries(ctx.personas))
      update((r) => ({ ...r, output, report, textDb: undefined }))
      p.tick(output.length)
      p.log(`${output.length} masked tables saved; download them from the Results tab`)
    })

    update((r) => ({ ...r, status: "succeeded", finishedAt: Date.now() }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    update((r) => {
      const stages = { ...r.stages }
      for (const id of Object.keys(stages) as StageId[]) {
        if (stages[id].status === "pending") stages[id] = { ...stages[id], status: "skipped", logs: ["Skipped because an earlier stage failed."] }
      }
      return { ...r, stages, status: "failed", finishedAt: Date.now(), error: message }
    })
  }
}

/** The parts of a masked cell that were left as-is; replaced spans are synthetic by construction. */
function residualText(cell: MaskedCell, images: ImageItem[]): string {
  const untouched = (segments: Segment[]) => segments.filter((s) => !s.entity).map((s) => s.text).join(" ")
  switch (cell.kind) {
    case "value":
      return cell.value === cell.original ? cell.value : ""
    case "text":
      return untouched(cell.segments)
    case "image":
      return untouched(images.slice(cell.item, cell.item + (cell.pages ?? 1)).flatMap((item) => item.ocr))
  }
}

const normalize = (s: string) =>
  s.toLowerCase().replace(/\b(dot|at)\b/g, "").replace(/[^a-z0-9]/g, "")

function validate(
  output: MaskedTable[],
  images: ImageItem[],
  originals: Map<string, string>,
  mediaEntities: Map<string, DetectedEntity[]>,
  dataset: Dataset,
  entitiesByType: Partial<Record<EntityType, number>>,
  keptByPolicy: number,
): ValidationReport {
  const corpus = output.flatMap((t) =>
    t.rows.flatMap((row, ri) =>
      Object.entries(row).map(([c, cell]) => ({ where: `${t.name}[${ri + 1}].${c}`, text: residualText(cell, images) })),
    ),
  )
  const candidates = [...originals.keys()].filter((v) => v.trim().length >= 4 && /[a-z]{3,}|\d{4,}/i.test(v))
  const leaks: ValidationReport["leaks"] = []
  for (const value of candidates) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(value)}($|[^a-z0-9])`, "i")
    const hit = corpus.find((c) => re.test(c.text))
    if (hit && leaks.length < 50) leaks.push({ value, where: hit.where })
  }

  let media: ValidationReport["media"] = null
  if (dataset.answerKey) {
    const missed: { record: string; value: string }[] = []
    let total = 0
    for (const [record, key] of Object.entries(dataset.answerKey)) {
      const found = (mediaEntities.get(record) ?? []).map((e) => normalize(e.text)).filter((e) => e.length >= 2)
      // Recordings are redacted rather than transcribed, so only the image half of the answer key is scored.
      for (const value of key.image) {
        total++
        const v = normalize(value)
        if (!found.some((e) => e === v || e.includes(v) || v.includes(e))) missed.push({ record, value })
      }
    }
    media = { found: total - missed.length, total, missed }
  }

  return { checkedValues: candidates.length, leaks, keptByPolicy, entitiesByType, media }
}

/** Original text with the identified spans marked, before any replacement. */
function markSpans(text: string, spans: EntitySpan[]): Segment[] {
  const out: Segment[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) out.push({ text: text.slice(cursor, span.start) })
    out.push({ text: span.entity.text, entity: { type: span.entity.type, original: span.entity.text } })
    cursor = span.end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) })
  return out
}
