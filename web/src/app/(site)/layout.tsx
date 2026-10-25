import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./site.css"

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] })
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] })

const TITLE = "maskara: precise masking, uncompromised data"
const DESCRIPTION =
  "maskara swaps the people in sensitive data for consistent synthetic personas across tables, notes, PDFs and photos, so the data stays usable for AI training. Built to run where the data lives."
const IMAGE = {
  url: "/landing/og.png",
  width: 1200,
  height: 630,
  alt: "maskara — precise masking, uncompromised data.",
}

export const metadata: Metadata = {
  metadataBase: new URL("https://maskara.dev"),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "maskara",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [IMAGE] },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

// A saved choice wins, otherwise the OS preference; applied before first paint so there is no flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem("maskara-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="site">{children}</body>
    </html>
  )
}
