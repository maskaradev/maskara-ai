import { Suspense } from "react"

import { NewJobForm } from "@/components/new-job-form"

export default function NewJobPage() {
  return (
    <Suspense>
      <NewJobForm />
    </Suspense>
  )
}
