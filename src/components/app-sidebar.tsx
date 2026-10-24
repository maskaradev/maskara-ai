"use client"

import {
  BarChart3,
  ChevronRight,
  Database,
  FilePlus2,
  KeyRound,
  ListChecks,
  Plus,
  Settings,
  ShieldCheck,
  UserRoundCog,
  Users,
} from "lucide-react"

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
import { ThemeToggle } from "@/components/theme-toggle"

const mainNav = [
  { title: "New masking job", icon: FilePlus2 },
  { title: "Jobs", icon: ListChecks },
  { title: "Usage", icon: BarChart3 },
]

const personaNav = [
  { title: "Persona library", active: true },
  { title: "Templates" },
  { title: "Consistency rules" },
]

const opsNav = [
  { title: "Masking policies", icon: ShieldCheck },
  { title: "API keys", icon: KeyRound },
  { title: "Settings", icon: Settings, hasChildren: true },
]

export function AppSidebar() {
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-4 pt-5 pb-3">
        <div className="text-sm font-semibold">RLMask</div>
        <div className="text-xs text-muted-foreground">AttentionX</div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Database />
                  <span>Datasets</span>
                </SidebarMenuButton>
                <SidebarMenuAction showOnHover>
                  <Plus />
                </SidebarMenuAction>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Users />
                  <span>Personas</span>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {personaNav.map((item) => (
                    <SidebarMenuSubItem key={item.title}>
                      <SidebarMenuSubButton isActive={item.active}>
                        <span>{item.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {opsNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton>
                    <item.icon />
                    <span>{item.title}</span>
                    {item.hasChildren && <ChevronRight className="ml-auto" />}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 pb-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <UserRoundCog className="size-4" />
          <ThemeToggle />
          <span className="ml-auto text-[11px]">v0.1.0</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
