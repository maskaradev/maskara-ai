import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { AppSidebar } from "@/components/app-sidebar"
import { Providers } from "@/components/providers"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { meta } from "@/lib/run-data"
import "../globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const TITLE = "maskara: swap personal data for consistent personas"

// The title is rendered by the root layout rather than set in `metadata`: Next re-renders metadata for
// each route, so on every client navigation <title> left the DOM for a few ms and the tab showed the URL.
// The root layout never unmounts, so this <title> stays put.
export const metadata: Metadata = {
  description:
    "A maskara run on synthetic sample data: every person swapped for one consistent persona across tables and text, with a report on what leaked and what still works.",
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <title>{TITLE}</title>
      </head>
      <body className="min-h-full">
        <Providers>
          <SidebarProvider className="md:h-svh md:overflow-hidden">
            <AppSidebar version={meta.maskara} />
            <SidebarInset className="min-w-0 md:overflow-y-auto">{children}</SidebarInset>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  )
}
