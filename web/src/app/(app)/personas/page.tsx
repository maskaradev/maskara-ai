import { PersonasScreen } from "@/components/run/personas-screen"
import { getPersonaMentions, getPersonas, meta } from "@/lib/run-data"

/** Opens on the persona seen in the most inputs. */
export default function PersonasPage() {
  const personas = getPersonas()
  return (
    <PersonasScreen
      personas={personas}
      selected={personas[0]}
      mentions={getPersonaMentions(personas[0].id)}
      originals={meta.originals}
    />
  )
}
