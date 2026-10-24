import { Suspense } from "react"

import { JobsScreen } from "@/components/jobs-screen"

async function RunFromParams({ params }: { params: PageProps<"/jobs/[id]">["params"] }) {
  const { id } = await params
  return <JobsScreen runId={id} />
}

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense>
      <RunFromParams params={params} />
    </Suspense>
  )
}
