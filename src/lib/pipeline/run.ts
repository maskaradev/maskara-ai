"use client"

import { mediaUrl } from "@/lib/datasets"
import { hash53, hashOf, pick, randomId } from "@/lib/hash"
import {
  MaskContext,
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
import { mockDetect } from "@/lib/pipeline/mock-detector"
import { emptyStages } from "@/lib/pipeline/stages"
import { computeUtility } from "@/lib/pipeline/utility"
import type { DetectRequest } from "@/lib/pii-schema"
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

const API_CONCURRENCY = 4

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
  async function detect(text: string, context: DetectRequest["context"]): Promise<DetectedEntity[]> {
    const key = String(hash53(JSON.stringify({ v: 2, text, context })))
    const cached = useAppStore.getState().detectionCache[key]
    if (cached) {
      bump({ cacheHits: 1 })
      return cached
    }
    return limit(async () => {
      const res = await fetch("/api/detect-pii", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context } satisfies DetectRequest),
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
    const audioCells: (Cell & { transcriptColumn: string | null })[] = []

    await stage("scan", (p) => {
      p.setTotal(tables.length)
      tables.forEach((t, ti) => {
        const counts: Record<string, number> = {}
        t.columns.forEach((c) => (counts[t.roles[c]] = (counts[t.roles[c]] ?? 0) + 1))
        p.log(`${t.name}: ${Object.entries(counts).map(([role, n]) => `${n} ${role}`).join(", ")}`)
        const transcriptColumn = colsWithRole(t, "transcript")[0] ?? null
        const label = (row: Row, ri: number) => row[t.columns[0]] || `${t.name}#${ri + 1}`
        t.rows.forEach((row, ri) => {
          const key = rowKey(t, row)
          for (const c of colsWithRole(t, "free_text")) if (row[c]?.trim()) textCells.push({ table: ti, row: ri, column: c, rowKey: key, label: label(row, ri) })
          for (const c of colsWithRole(t, "image")) if (row[c]) imageCells.push({ table: ti, row: ri, column: c, rowKey: key, label: label(row, ri) })
          for (const c of colsWithRole(t, "audio")) if (row[c]) audioCells.push({ table: ti, row: ri, column: c, rowKey: key, label: label(row, ri), transcriptColumn })
        })
        p.tick()
      })
      p.log(`Work: ${imageCells.length} images (main), ${textCells.length} text cells and ${audioCells.length} recordings (mock-up)`)
      imageItems = imageCells.map((cell) => ({
        id: cell.label,
        table: tables[cell.table].name,
        column: cell.column,
        src: mediaUrl(dataset, tables[cell.table].rows[cell.row][cell.column]),
        status: "pending",
        words: [],
        regions: [],
        ocr: [],
      }))
      update((r) => ({ ...r, images: imageItems }))
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

    await stage("structured", (p) => {
      const total = tables.reduce((n, t) => n + t.rows.length, 0)
      p.setTotal(total)
      let changed = 0
      p.log("Mock-up: rule-based replacement of structured columns (no LLM).")
      tables.forEach((t, ti) => {
        t.rows.forEach((row, ri) => {
          const key = rowKey(t, row)
          const persona = key ? ctx.patientPersona(key) : undefined
          const offset = persona?.dateOffsetDays ?? globalOffset
          const out: Record<string, MaskedCell> = {}
          for (const c of t.columns) {
            const v = row[c] ?? ""
            const role = t.roles[c]
            const value = (masked: string): MaskedCell => {
              if (masked !== v && v) {
                changed++
                if (SENSITIVE_ROLES.includes(role) && role !== "date") replacedOriginals.set(v, `${t.name}.${c}`)
              }
              return { kind: "value", value: masked, original: v }
            }
            if (!v) {
              out[c] = { kind: "value", value: "", original: "" }
              continue
            }
            switch (role) {
              case "person_key":
                out[c] = value(renderDigits(ctx, v, "pk"))
                break
              case "name":
                out[c] = value(persona ? renderName(v, splitName(v), persona) : v)
                break
              case "dob":
                out[c] = value(persona?.birthDate ?? (/^\d{4}-\d{2}-\d{2}/.test(v) ? shiftIsoDate(v, offset) : shiftDatesIn(v, offset)))
                break
              case "date":
                out[c] = value(shiftDatesIn(v, offset))
                break
              case "ssn":
                out[c] = value(renderSsn(ctx, v))
                break
              case "phone":
                out[c] = value(renderPhone(ctx, v, persona))
                break
              case "email":
                out[c] = value(renderEmail(ctx, v, persona))
                break
              case "street": {
                const rep = ctx.alias("street", normName(v)) ?? persona?.street ?? renderAddress(ctx, v)
                ctx.setAlias("street", normName(v), rep)
                ctx.addWordAlias(streetCore(v), streetCore(rep))
                out[c] = value(rep)
                break
              }
              case "city": {
                const rep = ctx.alias("city", v.toLowerCase()) ?? pick(CITIES, hashOf(ctx.salt, "city", v.toLowerCase()))
                ctx.setAlias("city", v.toLowerCase(), rep)
                ctx.addWordAlias(v, rep)
                out[c] = value(rep)
                break
              }
              case "zip":
                out[c] = value(renderZip(ctx, v))
                break
              case "id":
                out[c] = value(renderDigits(ctx, v))
                break
              case "provider": {
                const providerPersona = ctx.ensurePersona(ctx.providerKey(v), { kind: "provider", sex: "U" })
                out[c] = value(renderName(v, splitName(v), providerPersona))
                break
              }
              case "free_text":
              case "transcript":
                out[c] = { kind: "text", segments: [{ text: v }], original: v }
                break
              case "image":
                out[c] = { kind: "image", original: mediaUrl(dataset, v), item: imageCells.findIndex((x) => x.table === ti && x.row === ri && x.column === c) }
                break
              case "audio":
                out[c] = { kind: "audio", original: mediaUrl(dataset, v), transcript: [], originalTranscript: "" }
                break
              default:
                out[c] = { kind: "value", value: v, original: v }
            }
          }
          output[ti].rows.push(out)
          p.tick()
        })
      })
      bump({ entitiesReplaced: changed })
      p.log(`${changed} structured values replaced`)
    })

    const mockContext = (key: string | null) => ({
      patientName: key ? (ctx.patients.get(key)?.name ?? null) : null,
      providers: providerNames,
    })

    // Mock-up lane: rule-based detection instead of the LLM.
    const textStub = async () => {
      if (!textCells.length) return skip("text_detect", "No free-text columns.")
      await stage("text_detect", (p) => {
        p.setTotal(textCells.length)
        p.log("Mock-up: rule-based detector (known names, phones, emails, dates, MRNs). No API calls.")
        let spans = 0
        textCells.forEach((cell) => {
          const text = tables[cell.table].rows[cell.row][cell.column]
          const entities = mockDetect(text, mockContext(cell.rowKey))
          const result = maskText(ctx, text, entities, cell.rowKey)
          recordText(result, entities, cell.label)
          spans += result.replaced
          output[cell.table].rows[cell.row][cell.column] = { kind: "text", segments: result.segments, original: text }
          p.tick()
        })
        p.log(`${spans} spans replaced in ${textCells.length} cells`)
      })
    }

    // Mock-up lane: uses the transcript column instead of speech recognition.
    const audioStub = async () => {
      if (!audioCells.length) return skip("audio_transcribe", "No audio columns.")
      await stage("audio_transcribe", (p) => {
        p.setTotal(audioCells.length)
        p.log("Mock-up: uses the provided transcript column and the rule-based detector. No API calls.")
        audioCells.forEach((cell) => {
          if (!cell.transcriptColumn) throw new Error("No transcript column. Speech recognition is not part of the MVP.")
          const transcript = tables[cell.table].rows[cell.row][cell.transcriptColumn] ?? ""
          const entities = mockDetect(transcript, mockContext(cell.rowKey))
          const result = maskText(ctx, transcript, entities, cell.rowKey)
          recordText(result, entities, cell.label)
          const row = output[cell.table].rows[cell.row]
          const audio = row[cell.column] as Extract<MaskedCell, { kind: "audio" }>
          row[cell.column] = { ...audio, transcript: result.segments, originalTranscript: transcript }
          row[cell.transcriptColumn] = { kind: "text", segments: result.segments, original: transcript }
          p.tick()
        })
      })
    }

    // Main lane: identification agent (OCR + LLM) -> generation agent (persona redraw).
    const located: { spans: ReturnType<typeof locateEntities>; ocrText: string }[] = []
    const identifyAgent = async () => {
      if (!imageCells.length) return skip("identify", "No image columns.")
      const { loadImage, ocrImage, spansToRegions } = await import("@/lib/pipeline/image")
      await stage("identify", async (p) => {
        p.setTotal(imageCells.length)
        p.log("Loading the OCR engine (tesseract.js)…")
        let failures = 0
        for (const [i, cell] of imageCells.entries()) {
          patchImage(i, { status: "identifying" })
          try {
            const item = imageItems[i]
            const img = await loadImage(item.src)
            const ocr = await ocrImage(img)
            const entities = await detect(ocr.text, detectContext(cell.rowKey, "ocr"))
            mediaEntities.set(cell.label, entities)
            const spans = locateEntities(ocr.text, entities)
            located[i] = { spans, ocrText: ocr.text }
            const regions = spansToRegions(
              img,
              ocr,
              spans.map((s) => ({ start: s.start, end: s.end, type: s.entity.type, original: s.entity.text })),
            )
            patchImage(i, {
              status: "identified",
              words: ocr.words.map((w) => w.bbox),
              regions,
              ocr: maskText(ctx, ocr.text, [], cell.rowKey).segments,
            })
            p.log(`${cell.label}: ${ocr.words.length} words read, ${spans.length} PII spans → ${regions.length} blanks`)
          } catch (error) {
            // One unreadable image shouldn't stop the others.
            failures++
            located[i] = { spans: [], ocrText: "" }
            const message = error instanceof Error ? error.message : String(error)
            patchImage(i, { status: "failed", error: message })
            p.log(`${cell.label}: failed — ${message}`)
          }
          p.tick()
        }
        if (failures === imageCells.length) throw new Error("The identification agent could not process any image.")
      })
    }

    const generateAgent = async () => {
      if (!imageCells.length) return skip("generate", "No image columns.")
      await stage("generate", (p) => {
        p.setTotal(imageCells.length)
        imageCells.forEach((cell, i) => {
          if (imageItems[i].status === "failed") return p.tick()
          const { spans, ocrText } = located[i]
          const result = maskText(ctx, ocrText, spans.map((s) => s.entity), cell.rowKey)
          recordText(result, [], cell.label)
          const replacements = spans.map((s) => renderEntity(ctx, s.entity, cell.rowKey))
          // Regions were created span by span, in order; walk them in step.
          let r = 0
          const regions = imageItems[i].regions.map((region) => {
            if (region.first && r < replacements.length) r++
            return region.first ? { ...region, replacement: replacements[r - 1] } : region
          })
          patchImage(i, { status: "generated", regions, ocr: result.segments })
          p.log(`${cell.label}: ${regions.filter((x) => x.first).length} persona values drawn`)
          p.tick()
        })
      })
    }

    const lanes = await Promise.allSettled([textStub(), audioStub(), identifyAgent().then(generateAgent)])
    const failed = lanes.find((l): l is PromiseRejectedResult => l.status === "rejected")
    if (failed) throw failed.reason

    let report: ValidationReport | undefined
    await stage("validate", (p) => {
      report = validate(output, imageItems, replacedOriginals, mediaEntities, dataset, entityCounts, keptByPolicy)
      const utility = computeUtility(output, undefined, imageItems)
      report.utility = utility
      p.setTotal(report.checkedValues + utility.total)
      p.tick(report.checkedValues + utility.total)
      p.log(`Privacy: ${report.checkedValues} original values searched for in the output`)
      p.log(report.leaks.length ? `Privacy: ${report.leaks.length} possible leaks` : "Privacy: no original values found in the output")
      if (report.media) p.log(`Privacy: image answer key ${report.media.found}/${report.media.total} identifiers caught`)
      p.log(`Utility: ${utility.passed}/${utility.total} checks passed`)
      for (const c of utility.checks.filter((c) => c.pass === false)) p.log(`Utility ✕ ${c.label}: ${c.original} → ${c.masked}`)
    })

    await stage("export", (p) => {
      p.setTotal(output.length)
      useAppStore.getState().mergePersonas(Object.fromEntries(ctx.personas))
      update((r) => ({ ...r, output, report }))
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
      return untouched(images[cell.item]?.ocr ?? [])
    case "audio":
      return untouched(cell.transcript)
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
      // Audio runs on the mock-up lane, so only the image half of the answer key is scored.
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
