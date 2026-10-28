"use client"

import { ArrowRight, ChartScatter, DataBase, Report, UserMultiple } from "@carbon/icons-react"
import Link from "next/link"
import { useState } from "react"

import type { IconType } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { PersonaCard } from "@/components/run/persona-card"
import {
  ArrowLink,
  CategoryChip,
  CategoryLegend,
  OriginalsSwitch,
  PageIntro,
  SampleBanner,
  Section,
  StatTile,
  TextCompare,
} from "@/components/run/shared"
import { Kbd } from "@/components/ui/kbd"
import { useMessages } from "@/lib/i18n"
import { categoryCounts, num, pct, type Headline, type Meta, type Persona, type TextDoc } from "@/lib/run"
import type { InputSummary } from "@/lib/run-data"

type CardKey = "datasets" | "personas" | "report" | "benchmarks"

// Shortcuts match the sidebar order (⌘1 is Home).
const CARDS: { key: CardKey; href: string; icon: IconType; shortcut: number }[] = [
  { key: "datasets", href: "/datasets", icon: DataBase, shortcut: 2 },
  { key: "personas", href: "/personas", icon: UserMultiple, shortcut: 3 },
  { key: "report", href: "/report", icon: Report, shortcut: 4 },
  { key: "benchmarks", href: "/benchmarks", icon: ChartScatter, shortcut: 5 },
]

export function HomeScreen({ meta, headline: hd, inputs, featured, personas, categories }: {
  meta: Meta
  headline: Headline
  inputs: InputSummary[]
  featured: TextDoc | null
  personas: Persona[]
  categories: [string, number][]
}) {
  const messages = useMessages()
  const m = messages.home
  const [originals, setOriginals] = useState(true)
  const rows = inputs.reduce((n, x) => n + x.rows, 0)

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail]} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-8">
        <SampleBanner />

        <PageIntro
          kicker={m.kicker}
          title={m.title}
          description={m.summary(rows, inputs.length, meta.preset, meta.detectors.join(" + "), meta.seed)}
        />

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4 [&>*]:bg-background">
          <StatTile
            value={hd.originals_found}
            of={m.tiles.of(hd.originals_scanned)}
            label={m.tiles.originals}
            note={hd.originals_partial ? m.tiles.partial(hd.originals_partial) : undefined}
            tone={hd.originals_found ? "bad" : undefined}
          />
          <StatTile value={hd.broken_joins} of={m.tiles.of(hd.joins_checked)} label={m.tiles.joins} tone={hd.broken_joins ? "bad" : undefined} />
          <StatTile value={pct(hd.date_gaps_exact, 0)} label={m.tiles.dates(hd.date_gaps_checked)} />
          <StatTile value={num(hd.personas)} label={m.tiles.personas(hd.replaced)} />
        </div>

        <Section title={m.startHere}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CARDS.map(({ key, href, icon: Icon, shortcut }) => (
              <Link
                key={key}
                href={href}
                className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center rounded-lg border bg-background">
                    <Icon className="size-4" />
                  </span>
                  <Kbd>⌘{shortcut}</Kbd>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    {m.cards[key].title}
                    <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </span>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{m.cards[key].body}</span>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        {featured && (
          <Section
            title={m.beforeAfter}
            action={
              <div className="flex items-center gap-3">
                <OriginalsSwitch checked={originals} onChange={setOriginals} available={meta.originals} />
                <ArrowLink href={`/datasets/${encodeURIComponent(featured.source)}#text-${featured.row}-${encodeURIComponent(featured.column)}`}>
                  {m.openText}
                  <ArrowRight />
                </ArrowLink>
              </div>
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{messages.datasets.textTitle(featured.source, featured.row, featured.column)}</span>
              <CategoryLegend counts={categoryCounts(featured.mentions)} />
            </div>
            <TextCompare before={featured.before} after={featured.after} mentions={featured.mentions} showBefore={originals} />
          </Section>
        )}

        <section className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <Section
            title={m.inputs}
            action={
              <ArrowLink href="/datasets">
                {m.allDatasets}
                <ArrowRight />
              </ArrowLink>
            }
          >
            <ul className="flex flex-col divide-y rounded-xl border">
              {inputs.map((inp) => (
                <li key={inp.name}>
                  <Link
                    href={`/datasets/${encodeURIComponent(inp.name)}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <span className="text-sm font-medium">{inp.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{inp.file ?? messages.common.kinds[inp.kind]}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {inp.kind === "table" ? messages.common.rows(inp.rows) : messages.common.texts(inp.rows)} ·{" "}
                      {messages.common.replaced(inp.replaced)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={m.run}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 rounded-xl border p-4 text-[13px]">
              <dt className="text-muted-foreground">{m.runFields.preset}</dt>
              <dd className="font-mono">{meta.preset}</dd>
              <dt className="text-muted-foreground">{m.runFields.detectors}</dt>
              <dd className="font-mono">{meta.detectors.join(" + ")}</dd>
              {meta.seed && (
                <>
                  <dt className="text-muted-foreground">{m.runFields.seed}</dt>
                  <dd className="font-mono">{meta.seed}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{m.runFields.version}</dt>
              <dd className="font-mono">{meta.maskara}</dd>
              <dt className="self-start pt-0.5 text-muted-foreground">{messages.common.category}</dt>
              <dd className="flex flex-wrap gap-1">
                {categories.map(([c, n]) => (
                  <CategoryChip key={c} category={c} label={`${c.toLowerCase()} ${num(n)}`} />
                ))}
              </dd>
            </dl>
          </Section>
        </section>

        <Section
          title={m.samePersona}
          action={
            <ArrowLink href="/personas">
              {m.allPersonas}
              <ArrowRight />
            </ArrowLink>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {personas.map((p) => (
              <PersonaCard key={p.id} persona={p} showOriginal={originals && meta.originals} />
            ))}
          </div>
        </Section>
      </main>
    </div>
  )
}
