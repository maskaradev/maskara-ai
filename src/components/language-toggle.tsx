"use client"

import { Languages } from "lucide-react"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { setLocale, useLocale, useMessages } from "@/lib/i18n"

export function LanguageToggle() {
  const locale = useLocale()
  const m = useMessages()

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={m.language.switchTo}
      title={m.language.switchTo}
      onClick={() => setLocale(locale === "en" ? "ko" : "en")}
      className="gap-1 px-1.5 text-[11px] font-semibold"
    >
      <Languages />
      {m.language.current}
    </Button>
  )
}
