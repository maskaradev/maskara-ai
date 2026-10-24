"use client"

import {
  Database,
  ListChecks,
  Plus,
  UserRoundCog,
  Users,
  type LucideIcon,
} from "lucide-react"
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { LanguageToggle } from "@/components/language-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { useMessages, type Messages } from "@/lib/i18n"

type NavItem = { title: keyof Messages["sidebar"]; icon?: LucideIcon; href?: string }

const mainNav: NavItem[] = [
  { title: "jobs", icon: ListChecks, href: "/jobs" },
]

const personaNav: NavItem[] = [
  { title: "personaLibrary", href: "/personas" },
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
        <div className="text-sm font-semibold">RLMask</div>
        <div className="text-xs text-muted-foreground">AttentionX</div>
      </SidebarHeader>

      {/* The pathname is unknown while prerendering dynamic routes; render inactive links until it resolves. */}
      <Suspense fallback={<Nav pathname="" />}>
        <ActiveNav />
      </Suspense>

      <SidebarFooter className="px-4 pb-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <UserRoundCog className="size-4" />
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
        <SidebarGroupContent>
          <SidebarMenu>
            {mainNav.map((item) => (
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
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>{m.workspace}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive(pathname, "/datasets")}>
                <Link href="/datasets">
                  <Database />
                  <span>{m.datasets}</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuAction showOnHover asChild>
                <Link href="/datasets" aria-label={m.addDataset}>
                  <Plus />
                </Link>
              </SidebarMenuAction>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Users />
                <span>{m.personas}</span>
              </SidebarMenuButton>
              <SidebarMenuSub>
                {personaNav.map((item) => (
                  <SidebarMenuSubItem key={item.title}>
                    {item.href ? (
                      <SidebarMenuSubButton asChild isActive={isActive(pathname, item.href)}>
                        <Link href={item.href}>
                          <span>{m[item.title]}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    ) : (
                      <SidebarMenuSubButton>
                        <span>{m[item.title]}</span>
                      </SidebarMenuSubButton>
                    )}
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}
