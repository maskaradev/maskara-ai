"use client"

import { ArrowRight } from "@carbon/icons-react"

import { PageHeader } from "@/components/page-header"
import { CopyCommand, PageIntro, Rich } from "@/components/run/shared"
import { INSTALL_COMMAND, REPO_URL, WAITLIST_URL } from "@/components/site/links"
import { Button } from "@/components/ui/button"
import { useMessages } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const PYTHON = `import maskara

result = maskara.mask(
    tables={
        "customers": "customers.csv",
        "orders": "orders.csv",
    },
    texts={"notes": "notes.jsonl"},
    subjects={"customers": "customer_id", "orders": "customer_id"},
    vault=".maskara/vault.db",  # same person, same persona on the next run
)
print(result.report.summary())`

const CLI = `maskara mask --table customers=customers.csv --table orders=orders.csv \\
  --text tickets=tickets.jsonl \\
  --subject customers=customer_id --subject orders=customer_id --subject tickets=customer_id \\
  --preset balanced --out masked/
maskara report masked/`

function Block({ title, body, children, className }: { title: string; body?: string; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border bg-card p-5", className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {body && <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>}
      {children}
    </section>
  )
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed">
      <code>{children}</code>
    </pre>
  )
}

export function GetStartedScreen() {
  const m = useMessages().getStarted
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail]} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-8">
        <PageIntro title={m.title} description={m.description} />

        <div className="grid gap-4 md:grid-cols-2">
          <Block title={`1 · ${m.install.title}`} body={m.install.body}>
            <CopyCommand command={INSTALL_COMMAND} className="w-full" />
            <CopyCommand command={`pip install "maskara-ai[gliner] @ git+${REPO_URL}"`} className="w-full" />
          </Block>
          <Block title={`2 · ${m.demo.title}`} body={m.demo.body}>
            <CopyCommand command="maskara demo" className="w-full" />
            <CopyCommand command="maskara ui --demo" className="w-full" />
          </Block>
        </div>

        <Block title={`3 · ${m.python.title}`} body={m.python.body}>
          <Code>{PYTHON}</Code>
        </Block>

        <Block title={m.cli.title} body={m.cli.body}>
          <Code>{CLI}</Code>
        </Block>

        <div className="grid gap-4 md:grid-cols-2">
          <Block title={m.presets.title} body={m.presets.body}>
            <dl className="flex flex-col gap-2 text-[13px]">
              {Object.entries(m.presets.items).map(([name, desc]) => (
                <div key={name} className="grid grid-cols-[6.5rem_1fr] gap-3">
                  <dt className="font-mono text-xs leading-5">{name}</dt>
                  <dd className="text-muted-foreground">{desc}</dd>
                </div>
              ))}
            </dl>
          </Block>
          <Block title={m.detectors.title}>
            <dl className="flex flex-col gap-2 text-[13px]">
              {m.detectors.items.map(([name, desc]) => (
                <div key={name} className="grid grid-cols-[9rem_1fr] gap-3">
                  <dt className="font-mono text-xs leading-5">{name}</dt>
                  <dd className="text-muted-foreground">{desc}</dd>
                </div>
              ))}
            </dl>
          </Block>
          <Block title={m.vault.title} body={m.vault.body} />
          <Block title={m.report.title} body={m.report.body}>
            <CopyCommand command="maskara report masked/ --html" className="w-full" />
          </Block>
        </div>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/40 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">{m.team.title}</h2>
            <p className="text-[13px] text-muted-foreground">{m.team.body}</p>
          </div>
          <Button asChild>
            <a href={WAITLIST_URL}>
              {m.team.cta}
              <ArrowRight />
            </a>
          </Button>
        </section>

        <p className="text-xs leading-relaxed text-muted-foreground">
          <Rich text={m.security} />
        </p>
      </main>
    </div>
  )
}
