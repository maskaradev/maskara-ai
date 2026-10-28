import { HomeScreen } from "@/components/run/home-screen"
import { categoryTotals, getFeaturedText, getInputs, getPersonas, meta, report } from "@/lib/run-data"

export default function HomePage() {
  return (
    <HomeScreen
      meta={meta}
      headline={report.headline}
      inputs={getInputs()}
      featured={getFeaturedText()}
      personas={getPersonas().slice(0, 6)}
      categories={categoryTotals()}
    />
  )
}
