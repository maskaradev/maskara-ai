import { Suspense } from "react"

import { LabScreen } from "@/components/lab-screen"

async function RunFromParams({ params }: { params: PageProps<"/lab/[id]">["params"] }) {
  const { id } = await params
  return <LabScreen runId={id} />
}

export default function LabRunPage({ params }: PageProps<"/lab/[id]">) {
  return (
    <Suspense>
      <RunFromParams params={params} />
    </Suspense>
  )
}
