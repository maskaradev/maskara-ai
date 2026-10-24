"use client"

import {
  ChartColumn,
  Database,
  ListChecks,
  type LucideIcon,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { LanguageToggle } from "@/components/language-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { useMessages, type Messages } from "@/lib/i18n"

type NavItem = { title: keyof Messages["sidebar"]; icon?: LucideIcon; href?: string }

const mainNav: NavItem[] = [
  { title: "jobs", icon: ListChecks, href: "/jobs" },
  { title: "analysis", icon: ChartColumn, href: "/analysis" },
]

function isActive(pathname: string, href?: string) {
  if (!href) return false
  return pathname === href || pathname.startsWith(href + "/")
}

function ActiveNav() {
  return <Nav pathname={usePathname()} />
}

export function AppSidebar() {
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-4 pt-5 pb-3">
        <div className="font-mono text-base font-bold tracking-tighter">
          RL<span className="text-muted-foreground">Mask</span>
        </div>
        <Image src="/brand/attentionx-dark.png" alt="AttentionX" width={838} height={126} className="mt-1 h-2.5 w-auto self-start opacity-40 dark:hidden" />
        <Image src="/brand/attentionx-white.png" alt="AttentionX" width={838} height={126} className="mt-1 hidden h-2.5 w-auto self-start opacity-40 dark:block" />
      </SidebarHeader>

      {/* The pathname is unknown while prerendering dynamic routes; render inactive links until it resolves. */}
      <Suspense fallback={<Nav pathname="" />}>
        <ActiveNav />
      </Suspense>

      <SidebarFooter className="px-4 pb-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <ThemeToggle />
          <LanguageToggle />
          <span className="ml-auto text-[11px]">v0.1.0</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function Nav({ pathname }: { pathname: string }) {
  const m = useMessages().sidebar
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>{m.workspace}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive(pathname, "/datasets")}>
                <Link href="/datasets" data-tour="nav-datasets">
                  <Database />
                  <span>{m.datasets}</span>
                </Link>
              </SidebarMenuButton>
              <StepBadge step={1} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {mainNav.map((item, i) => (
              <SidebarMenuItem key={item.title}>
                {item.href ? (
                  <SidebarMenuButton asChild isActive={isActive(pathname, item.href)}>
                    <Link href={item.href}>
                      {item.icon && <item.icon />}
                      <span>{m[item.title]}</span>
                    </Link>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton>
                    {item.icon && <item.icon />}
                    <span>{m[item.title]}</span>
                  </SidebarMenuButton>
                )}
                <StepBadge step={i + 2} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}

/** Demo walkthrough order: datasets → jobs → analysis. */
function StepBadge({ step }: { step: number }) {
  return (
    <SidebarMenuBadge className="right-1.5 size-5 min-w-0 rounded-full bg-sidebar-accent p-0 text-[11px] text-muted-foreground peer-data-active/menu-button:bg-primary peer-data-active/menu-button:text-primary-foreground!">
      {step}
    </SidebarMenuBadge>
  )
}
