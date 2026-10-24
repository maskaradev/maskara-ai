"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { useMessages } from "@/lib/i18n"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const m = useMessages()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={m.sidebar.toggleTheme}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  )
}
