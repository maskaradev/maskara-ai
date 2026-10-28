import { notFound } from "next/navigation"

import { PersonasScreen } from "@/components/run/personas-screen"
import { getPersona, getPersonaMentions, getPersonas, meta } from "@/lib/run-data"

export function generateStaticParams() {
  return getPersonas().map((p) => ({ id: p.id }))
}

export default async function PersonaPage({ params }: PageProps<"/personas/[id]">) {
  const { id } = await params
  const persona = getPersona(id)
  if (!persona) notFound()
  return (
    <PersonasScreen
      personas={getPersonas()}
      selected={persona}
      mentions={getPersonaMentions(persona.id)}
      originals={meta.originals}
    />
  )
}
