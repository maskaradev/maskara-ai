"use client"

import { CircleCheck, CircleDashed, Database, ListChecks, X, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Suspense, useSyncExternalStore } from "react"
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
import { LogoMark } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { useMessages, type Messages } from "@/lib/i18n"
import { useAppStore, useHydrated } from "@/lib/store"

type NavItem = { title: Exclude<keyof Messages["sidebar"], "onboarding">; icon?: LucideIcon; href?: string }

const mainNav: NavItem[] = [
  { title: "jobs", icon: ListChecks, href: "/jobs" },
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
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="px-4 pt-5 pb-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2 font-mono text-base font-bold tracking-tighter">
          <LogoMark className="size-5 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">
            mask<span className="text-muted-foreground">ara</span>
          </span>
        </div>
      </SidebarHeader>

      {/* The pathname is unknown while prerendering dynamic routes; render inactive links until it resolves. */}
      <Suspense fallback={<Nav pathname="" />}>
        <ActiveNav />
      </Suspense>

      <SidebarFooter className="gap-3 overflow-hidden px-4 pb-4 group-data-[collapsible=icon]:px-2">
        <OnboardingChecklist />
        <div className="flex items-center gap-3 text-muted-foreground group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
          <ThemeToggle />
          <LanguageToggle />
          <span className="ml-auto text-[11px] group-data-[collapsible=icon]:hidden">v0.1.0</span>
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
        {/* Fade the label but keep its height so the icons don't jump when the sidebar collapses. */}
        <SidebarGroupLabel className="group-data-[collapsible=icon]:mt-0!">{m.workspace}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive(pathname, "/datasets")} tooltip={m.datasets}>
                <Link href="/datasets" data-tour="nav-datasets">
                  <Database />
                  <span>{m.datasets}</span>
                </Link>
              </SidebarMenuButton>
              <NavShortcut step={1} href="/datasets" active={isActive(pathname, "/datasets")} />
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
                  <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={m[item.title]}>
                    <Link href={item.href}>
                      {item.icon && <item.icon />}
                      <span>{m[item.title]}</span>
                    </Link>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton tooltip={m[item.title]}>
                    {item.icon && <item.icon />}
                    <span>{m[item.title]}</span>
                  </SidebarMenuButton>
                )}
                <NavShortcut step={i + 2} href={item.href} active={isActive(pathname, item.href)} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}

/** Demo walkthrough order (datasets → jobs), doubling as the ⌘+number shortcut to jump there. */
function NavShortcut({ step, href, active }: { step: number; href?: string; active: boolean }) {
  const router = useRouter()
  useHotkeys(`mod+${step}`, () => href && router.push(href), { enabled: !!href, preventDefault: true }, [href, router])
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

const ONBOARDING_DISMISSED_KEY = "maskara-onboarding-dismissed"
const dismissListeners = new Set<() => void>()

function subscribeDismissed(onChange: () => void) {
  dismissListeners.add(onChange)
  return () => dismissListeners.delete(onChange)
}

function dismissOnboarding() {
  localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1")
  dismissListeners.forEach((l) => l())
}

/** Getting-started progress, derived from what's already in the local store. */
function OnboardingChecklist() {
  // Hidden during prerender so a dismissed checklist never flashes in.
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    () => localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1",
    () => true,
  )
  return dismissed ? null : <OnboardingCard />
}

function OnboardingCard() {
  const m = useMessages().sidebar.onboarding
  const hydrated = useHydrated()
  const datasets = useAppStore((s) => s.datasets)
  const runs = useAppStore((s) => s.runs)
  const finished = runs.find((r) => r.status === "succeeded")

  const steps = [
    { label: m.loadDataset, href: "/datasets", done: datasets.length > 0 },
    { label: m.startJob, href: "/jobs", done: runs.length > 0 },
    { label: m.finishRun, href: finished ? `/jobs/${finished.id}` : "/jobs", done: !!finished },
  ].map((s) => ({ ...s, done: hydrated && s.done }))
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
          <X className="size-3.5" />
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
          <li key={step.href + step.label}>
            <Link
              href={step.href}
              className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {step.done ? (
                <CircleCheck className="size-3.5 shrink-0 text-primary" />
              ) : (
                <CircleDashed className="size-3.5 shrink-0" />
              )}
              <span className={step.done ? "line-through decoration-muted-foreground/50" : undefined}>{step.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
