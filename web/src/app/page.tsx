"use client"

import { Plus, Search, Sparkles } from "lucide-react"
import { useState } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { personas } from "@/lib/mock-data"

export default function PersonaLibraryPage() {
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const filtered = personas.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.fields.some((f) => f.toLowerCase().includes(q)),
  )

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <header className="flex h-12 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Personas</BreadcrumbItem>
            <BreadcrumbSeparator>/</BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Persona library</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Persona library</h1>
          <Button>
            <Plus />
            New persona
          </Button>
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Personas</h2>
            <span className="text-xs text-muted-foreground">{filtered.length} total</span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or masked field"
              className="pl-9"
            />
          </div>

          <ul className="flex flex-col">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Used in {p.datasets} {p.datasets === 1 ? "dataset" : "datasets"} · {p.fields.join(", ")} · {p.source}
                  </div>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-sm text-muted-foreground">No personas match “{query}”.</li>
            )}
          </ul>
        </section>
      </main>

      <Button variant="outline" className="fixed right-6 bottom-6 shadow-sm">
        <Sparkles />
        Agent
      </Button>
    </div>
  )
}
