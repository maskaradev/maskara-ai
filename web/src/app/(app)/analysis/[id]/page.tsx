import { Suspense } from "react"

import { AnalysisScreen } from "@/components/analysis-screen"

async function RunFromParams({ params }: { params: PageProps<"/analysis/[id]">["params"] }) {
  const { id } = await params
  return <AnalysisScreen runId={id} />
}

export default function AnalysisRunPage({ params }: PageProps<"/analysis/[id]">) {
  return (
    <Suspense>
      <RunFromParams params={params} />
    </Suspense>
  )
}
