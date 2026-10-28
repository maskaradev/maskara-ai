"use client"

import {
  ChartScatter,
  CheckmarkFilled,
  CircleDash,
  Close,
  DataBase,
  Home,
  LogoGithub,
  Launch,
  Report,
  Terminal,
  UserMultiple,
} from "@carbon/icons-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Suspense, useEffect, useSyncExternalStore } from "react"
import { useHotkeys } from "react-hotkeys-hook"

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
import { Kbd } from "@/components/ui/kbd"
import { LanguageToggle } from "@/components/language-toggle"
import type { IconType } from "@/components/icons"
import { LogoMark } from "@/components/logo"
import { REPO_URL, SITE_URL } from "@/components/site/links"
import { ThemeToggle } from "@/components/theme-toggle"
import { useMessages, type Messages } from "@/lib/i18n"

type NavKey = "home" | "datasets" | "personas" | "report" | "benchmarks" | "getStarted"
type NavItem = { title: NavKey; icon: IconType; href: string }
type NavGroup = { label?: "sampleRun" | "evaluate" | "use"; items: NavItem[] }

/** Sidebar order, which doubles as the ⌘+number shortcut to jump there. */
const NAV: NavGroup[] = [
  { items: [{ title: "home", icon: Home, href: "/home" }] },
  {
    label: "sampleRun",
    items: [
      { title: "datasets", icon: DataBase, href: "/datasets" },
      { title: "personas", icon: UserMultiple, href: "/personas" },
      { title: "report", icon: Report, href: "/report" },
    ],
  },
  { label: "evaluate", items: [{ title: "benchmarks", icon: ChartScatter, href: "/benchmarks" }] },
  { label: "use", items: [{ title: "getStarted", icon: Terminal, href: "/get-started" }] },
]

const STEPS = NAV.flatMap((g) => g.items).map((item, i) => ({ ...item, step: i + 1 }))

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/")
}

function ActiveNav() {
  const pathname = usePathname()
  useEffect(() => markVisited(pathname), [pathname])
  return <Nav pathname={pathname} />
}

export function AppSidebar({ version }: { version: string }) {
  const m = useMessages().sidebar
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="px-4 pt-5 pb-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <Link href="/home" className="flex items-center gap-2 font-mono text-base font-bold tracking-tighter">
          <LogoMark className="size-5 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">
            mask<span className="text-muted-foreground">ara</span>
          </span>
        </Link>
      </SidebarHeader>

      {/* The pathname is unknown while prerendering dynamic routes; render inactive links until it resolves. */}
      <Suspense fallback={<Nav pathname="" />}>
        <ActiveNav />
      </Suspense>

      <SidebarFooter className="gap-3 overflow-hidden px-4 pb-4 group-data-[collapsible=icon]:px-2">
        <OnboardingChecklist />
        <div className="flex flex-col gap-1 group-data-[collapsible=icon]:hidden">
          <a
            href={REPO_URL}
            className="flex items-center gap-2 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogoGithub className="size-3.5" />
            {m.github}
            <Launch className="ml-auto size-3" />
          </a>
          <a
            href={SITE_URL}
            className="flex items-center gap-2 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogoMark className="size-3.5" />
            {m.site}
            <Launch className="ml-auto size-3" />
          </a>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
          <ThemeToggle />
          <LanguageToggle />
          <span className="ml-auto font-mono text-[11px] group-data-[collapsible=icon]:hidden">v{version}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function Nav({ pathname }: { pathname: string }) {
  const m = useMessages().sidebar
  return (
    <SidebarContent>
      {NAV.map((group, g) => (
        <SidebarGroup key={g}>
          {/* Fade the label but keep its height so the icons don't jump when the sidebar collapses. */}
          {group.label && (
            <SidebarGroupLabel className="group-data-[collapsible=icon]:mt-0!">{m[group.label]}</SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  step={STEPS.find((s) => s.href === item.href)!.step}
                  pathname={pathname}
                  label={m[item.title]}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}

function NavLink({ item, step, pathname, label }: { item: NavItem; step: number; pathname: string; label: string }) {
  const active = isActive(pathname, item.href)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <Link href={item.href}>
          <item.icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      <NavShortcut step={step} href={item.href} active={active} />
    </SidebarMenuItem>
  )
}

function NavShortcut({ step, href, active }: { step: number; href: string; active: boolean }) {
  const router = useRouter()
  useHotkeys(`mod+${step}`, () => router.push(href), { preventDefault: true }, [href, router])
  return (
    <SidebarMenuBadge className="right-1.5 p-0">
      <Kbd
        className={
          active
            ? "border-primary border-b-black bg-primary text-primary-foreground dark:border-primary dark:border-b-black/35 dark:bg-primary"
            : undefined
        }
      >
        ⌘{step}
      </Kbd>
    </SidebarMenuBadge>
  )
}

// -- getting started: which sections have been opened, kept in localStorage -----------------------

const ONBOARDING_DISMISSED_KEY = "maskara-onboarding-dismissed"
const VISITED_KEY = "maskara-visited"
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}
const notify = () => listeners.forEach((l) => l())

function dismissOnboarding() {
  localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1")
  notify()
}

function readVisited() {
  return localStorage.getItem(VISITED_KEY) ?? ""
}

function markVisited(pathname: string) {
  const section = STEPS.find((s) => isActive(pathname, s.href))?.href
  if (!section) return
  const seen = new Set(readVisited().split(" ").filter(Boolean))
  if (seen.has(section)) return
  seen.add(section)
  localStorage.setItem(VISITED_KEY, [...seen].join(" "))
  notify()
}

function OnboardingChecklist() {
  // Hidden during prerender so a dismissed checklist never flashes in.
  const dismissed = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1",
    () => true,
  )
  return dismissed ? null : <OnboardingCard />
}

const ONBOARDING: { key: keyof Messages["sidebar"]["onboarding"]; href: string }[] = [
  { key: "openDataset", href: "/datasets" },
  { key: "meetPersona", href: "/personas" },
  { key: "readReport", href: "/report" },
  { key: "runLocally", href: "/get-started" },
]

function OnboardingCard() {
  const m = useMessages().sidebar.onboarding
  const visited = useSyncExternalStore(subscribe, readVisited, () => "")
  const seen = new Set(visited.split(" "))
  const steps = ONBOARDING.map((s) => ({ ...s, done: seen.has(s.href) }))
  const completed = steps.filter((s) => s.done).length

  // min-w matches the expanded footer width so the text doesn't rewrap while the sidebar animates open.
  return (
    <div className="min-w-52 rounded-lg border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{m.title}</span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {completed}/{steps.length}
        </span>
        <button
          type="button"
          onClick={dismissOnboarding}
          aria-label={m.dismiss}
          className="-mr-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <Close className="size-3.5" />
        </button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-sidebar-border">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1.5">
        {steps.map((step) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {step.done ? (
                <CheckmarkFilled className="size-3.5 shrink-0 text-primary" />
              ) : (
                <CircleDash className="size-3.5 shrink-0" />
              )}
              <span className={step.done ? "line-through decoration-muted-foreground/50" : undefined}>{m[step.key]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
