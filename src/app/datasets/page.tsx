"use client"

import { AlertTriangle, Database, DatabaseZap, Eye, FilePlus2, Trash2, Upload } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  UPLOAD_LIMITS,
  datasetFromFiles,
  loadHospitalSample,
  loadNemotronSample,
  loadPersonasSample,
  loadSyntheaSample,
} from "@/lib/datasets"
import { useMessages } from "@/lib/i18n"
import { QUOTA_EVENT, useAppStore, useHydrated } from "@/lib/store"
import type { Dataset } from "@/lib/types"
import { cn } from "@/lib/utils"

const PREVIEW_ROWS = 50
const SAMPLE_LOADERS = [loadHospitalSample, loadNemotronSample, loadSyntheaSample, loadPersonasSample]

function MaskedValue({ value, revealed }: { value: string; revealed: boolean }) {
  if (!value) return null
  return (
    <span className="inline-block max-w-full overflow-hidden rounded bg-muted/60 px-1">
      <span className={cn("transition-[filter]", !revealed && "blur-[5px] select-none")} aria-hidden={!revealed}>
        {value}
      </span>
    </span>
  )
}

function UploadPanel({ onDone }: { onDone: (d: Dataset) => void }) {
  const m = useMessages()
  const t = m.datasets
  const [name, setName] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      onDone(await datasetFromFiles(name.trim(), files))
    } catch (e) {
      setError(e instanceof Error ? e.message : t.uploadFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">{t.uploadWarnTitle}</p>
          <p className="text-[13px]">{t.uploadWarnBody}</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          {t.datasetName}
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.datasetNamePlaceholder} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {t.csvFiles}
          <Input type="file" accept=".csv,text/csv" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.limits(UPLOAD_LIMITS.totalRows.toLocaleString(m.localeTag))} {t.templates}{" "}
        <a className="underline" href="/samples/hospital/patients.csv" download>
          patients.csv
        </a>
        ,{" "}
        <a className="underline" href="/samples/hospital/clinical_notes.csv" download>
          clinical_notes.csv
        </a>
      </p>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
        {t.consent}
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button className="self-start" disabled={!files.length || !consent || busy} onClick={submit}>
        <Upload />
        {busy ? t.reading : t.addDataset}
      </Button>
    </section>
  )
}

function DatasetViewer({ dataset }: { dataset: Dataset }) {
  const m = useMessages()
  const t = m.datasets
  const [peek, setPeek] = useState(false)
  const hold = (on: boolean) => (e: React.KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return
    e.preventDefault()
    setPeek(on)
  }
  return (
    <Tabs defaultValue={dataset.tables[0]?.name} key={dataset.id}>
      <div className="flex items-center justify-between gap-2">
        <TabsList variant="line">
          {dataset.tables.map((table) => (
            <TabsTrigger key={table.name} value={table.name}>
              {table.name}
              <span className="text-xs text-muted-foreground">{table.rows.length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <Button
          variant={peek ? "secondary" : "ghost"}
          size="sm"
          className="touch-none select-none"
          aria-pressed={peek}
          onPointerDown={() => setPeek(true)}
          onPointerUp={() => setPeek(false)}
          onPointerLeave={() => setPeek(false)}
          onPointerCancel={() => setPeek(false)}
          onKeyDown={hold(true)}
          onKeyUp={hold(false)}
          onBlur={() => setPeek(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Eye />
          {t.peek}
        </Button>
      </div>
      {dataset.tables.map((table) => (
        <TabsContent key={table.name} value={table.name}>
          <div className="max-h-[480px] overflow-auto rounded-lg border">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                      {c}
                      <div className="text-[10px] font-normal text-muted-foreground">{m.roles[table.roles[c]]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                  <tr key={i} className="border-t align-top">
                    {table.columns.map((c) => (
                      <td key={c} className={cn("px-3 py-1.5", (row[c]?.length ?? 0) > 60 ? "min-w-80" : "whitespace-nowrap")}>
                        <MaskedValue value={row[c] ?? ""} revealed={peek} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.rows.length > PREVIEW_ROWS && (
            <p className="mt-2 text-xs text-muted-foreground">{t.preview(PREVIEW_ROWS, table.rows.length)}</p>
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export default function DatasetsPage() {
  const hydrated = useHydrated()
  const m = useMessages()
  const t = m.datasets
  const { datasets, upsertDataset, removeDataset } = useAppStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = datasets.find((d) => d.id === selectedId) ?? datasets[0]
  const hasSamples = datasets.some((d) => d.id.startsWith("sample-"))

  useEffect(() => {
    const onQuota = () => setError(t.quotaFull)
    window.addEventListener(QUOTA_EVENT, onQuota)
    return () => window.removeEventListener(QUOTA_EVENT, onQuota)
  }, [t.quotaFull])

  async function loadSamples() {
    setLoading(true)
    setError(null)
    const results = await Promise.allSettled(SAMPLE_LOADERS.map((load) => load()))
    const loaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    loaded.forEach((d) => upsertDataset(d))
    if (loaded[0]) setSelectedId(loaded[0].id)
    const failed = results.find((r) => r.status === "rejected")
    if (failed) setError(failed.reason instanceof Error ? failed.reason.message : t.loadFailed)
    setLoading(false)
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={t.trail} />
      <main className="flex flex-1 flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={loadSamples} disabled={loading} data-tour="load-samples">
            <DatabaseZap />
            {hasSamples ? t.reloadAll : t.loadAll}
          </Button>
          <Button variant={uploading ? "secondary" : "outline"} onClick={() => setUploading(!uploading)} disabled>
            <Upload />
            {t.upload}
          </Button>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {uploading && (
          <UploadPanel
            onDone={(d) => {
              upsertDataset(d)
              setSelectedId(d.id)
              setUploading(false)
            }}
          />
        )}

        {!hydrated ? (
          <Skeleton className="h-64 w-full" />
        ) : datasets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <Database className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t.empty}</p>
            <Button onClick={loadSamples} disabled={loading}>
              <DatabaseZap />
              {t.loadAll}
            </Button>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {datasets.map((d) => (
                <li key={d.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-tour={`dataset-${d.id}`}
                    onClick={() => setSelectedId(d.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedId(d.id)}
                    className={cn(
                      "flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50",
                      selected?.id === d.id && "border-foreground/25 bg-muted/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.source === "sample" ? t.staticSample : t.uploaded} · {new Date(d.createdAt).toLocaleDateString(m.localeTag)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.deleteDataset}
                        onClick={(e) => {
                          e.stopPropagation()
                          removeDataset(d.id)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {d.spanKey && (
                      <a
                        className="self-start text-xs text-muted-foreground underline"
                        href={d.spanKey.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.spanKeySource(d.spanKey.source, d.spanKey.license)}
                      </a>
                    )}
                    <ul className="text-xs text-muted-foreground">
                      {d.tables.map((table) => (
                        <li key={table.name}>
                          {table.name} · {t.tableSummary(table.rows.length, table.columns.length)}
                        </li>
                      ))}
                    </ul>
                    <Button size="sm" variant="outline" className="self-start" asChild onClick={(e) => e.stopPropagation()}>
                      <Link href={`/jobs/new?dataset=${d.id}`} data-tour={`new-job-${d.id}`}>
                        <FilePlus2 />
                        {t.newJob}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {selected && <DatasetViewer dataset={selected} />}
          </>
        )}
      </main>
    </div>
  )
}
