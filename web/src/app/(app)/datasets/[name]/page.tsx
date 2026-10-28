import { notFound } from "next/navigation"

import { DatasetScreen } from "@/components/run/dataset-screen"
import { getInput, getInputs, getTable, getTextDoc, getTexts, meta } from "@/lib/run-data"

export function generateStaticParams() {
  return getInputs().map((inp) => ({ name: inp.name }))
}

export default async function DatasetPage({ params }: PageProps<"/datasets/[name]">) {
  const { name } = await params
  const input = getInput(decodeURIComponent(name))
  if (!input) notFound()
  return (
    <DatasetScreen
      input={input}
      originals={meta.originals}
      table={input.kind === "table" ? getTable(input.name) : null}
      texts={getTexts(input.name).map((t) => getTextDoc(t.source, t.row, t.column))}
    />
  )
}
