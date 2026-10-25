"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function PageHeader({ trail, back }: { trail: string[]; back?: { href: string; label: string } }) {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      {back && (
        <>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2" asChild>
            <Link href={back.href}>
              <ArrowLeft />
              {back.label}
            </Link>
          </Button>
          <Separator orientation="vertical" className="mr-1 h-4" />
        </>
      )}
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
    </header>
  )
}
