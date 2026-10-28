import { DatasetsScreen } from "@/components/run/datasets-screen"
import { getInputs } from "@/lib/run-data"

export default function DatasetsPage() {
  return <DatasetsScreen inputs={getInputs()} />
}
