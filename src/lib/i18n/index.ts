"use client"

import { useSyncExternalStore } from "react"

import { en, type Messages } from "@/lib/i18n/en"
import { ko } from "@/lib/i18n/ko"

export type Locale = "en" | "ko"

const MESSAGES: Record<Locale, Messages> = { en, ko }
// Keeps the pre-rename key so the saved language survives the RLMask → maskara rename.
const STORAGE_KEY = "rlmask-locale"
const listeners = new Set<() => void>()

function readLocale(): Locale {
  return localStorage.getItem(STORAGE_KEY) === "ko" ? "ko" : "en"
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function setLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
  listeners.forEach((l) => l())
}

/** English during prerender and hydration, then the saved choice. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, readLocale, () => "en")
}

export function useMessages(): Messages {
  return MESSAGES[useLocale()]
}

export type { Messages }
