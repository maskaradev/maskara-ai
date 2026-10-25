"use client"

import Link from "next/link"
import { Moon, Sun } from "@carbon/icons-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { LogoMark } from "@/components/logo"
import { GithubMark } from "@/components/site/github-mark"
import { DOCS_URL, REPO_URL } from "@/components/site/links"

type Theme = "light" | "dark"

/** The landing page's sections, in page order. */
const SECTIONS = [
  ["#demo", "Demo"],
  ["#why", "Why"],
  ["#local", "Local"],
  ["#how", "How it works"],
] as const

// The layout's inline script sets data-theme before paint; this keeps React in step with it.
const THEME_EVENT = "maskara-theme"
const subscribe = (onChange: () => void) => {
  window.addEventListener(THEME_EVENT, onChange)
  return () => window.removeEventListener(THEME_EVENT, onChange)
}
const readTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light")

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem("maskara-theme", theme)
  } catch {}
  window.dispatchEvent(new Event(THEME_EVENT))
}

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme)
  const next = theme === "dark" ? "light" : "dark"
  return (
    <button type="button" className="icon-btn" aria-label={`Switch to ${next} theme`} onClick={() => setTheme(next)}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  )
}

function useStars() {
  const [stars, setStars] = useState<number | null>(null)
  useEffect(() => {
    const repo = new URL(REPO_URL).pathname
    fetch(`https://api.github.com/repos${repo}`, { headers: { accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => typeof d?.stargazers_count === "number" && setStars(d.stargazers_count))
      .catch(() => {})
  }, [])
  return stars
}

/** True while the bar sits over an `.invert` band, so it can flip with the band beneath it. */
function useOverInvert() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      // The bar's vertical middle is what reads as "over" the band.
      const line = 32
      setOver(
        [...document.querySelectorAll(".invert:not(.nav-wrap)")].some((el) => {
          const r = el.getBoundingClientRect()
          return r.top <= line && r.bottom >= line
        }),
      )
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    check()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])
  return over
}

export function Nav() {
  const [open, setOpen] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)
  const stars = useStars()
  const overInvert = useOverInvert()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!sheet.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("click", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("click", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <header className={overInvert ? "nav-wrap invert" : "nav-wrap"}>
      <nav className="nav">
        <Link className="brand" href="/">
          <LogoMark />
          <b>maskara</b>
        </Link>
        <div className="nav-links">
          {SECTIONS.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
          <a href={DOCS_URL}>Docs</a>
        </div>
        <div className="nav-end">
          <a className="gh" href={REPO_URL} aria-label="maskara on GitHub">
            <GithubMark />
            {stars !== null && <b>{stars.toLocaleString("en-US")}</b>}
          </a>
          <ThemeToggle />
          <a className="btn btn-primary btn-sm" href="#waitlist">
            Join waitlist
          </a>
          <button
            type="button"
            className="icon-btn menu"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="nav-sheet"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((o) => !o)
            }}
          >
            <span />
            <span />
          </button>
        </div>
      </nav>
      <div className={open ? "sheet open" : "sheet"} id="nav-sheet" ref={sheet}>
        {SECTIONS.map(([href, label]) => (
          <a key={href} href={href} onClick={() => setOpen(false)}>
            {label}
          </a>
        ))}
        <a href="#waitlist" onClick={() => setOpen(false)}>
          Waitlist
        </a>
        <a href={DOCS_URL}>Docs</a>
        <a href={REPO_URL}>GitHub</a>
      </div>
    </header>
  )
}
