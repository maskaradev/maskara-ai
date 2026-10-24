"use client"

import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useMessages } from "@/lib/i18n"

export function PageHeader({ trail }: { trail: string[] }) {
  const m = useMessages()
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Breadcrumb>
        <BreadcrumbList>
          {trail.map((item, i) => (
            <Fragment key={item}>
              {i > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
              <BreadcrumbItem>{i === trail.length - 1 ? <BreadcrumbPage>{item}</BreadcrumbPage> : item}</BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <span className="ml-auto rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        {m.header.mvpBadge}
      </span>
    </header>
  )
}
