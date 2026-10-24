import type { Metadata } from "next"
import { Suspense } from "react"
import { Geist, Geist_Mono } from "next/font/google"

import { AppSidebar } from "@/components/app-sidebar"
import { Providers } from "@/components/providers"
import { Tutorial } from "@/components/tutorial"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "RLMask | Synthetic persona masking for AI training data",
  description:
    "Replace sensitive data with consistent synthetic personas while keeping it useful for AI training.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>
          <SidebarProvider className="md:h-svh md:overflow-hidden">
            <AppSidebar />
            <SidebarInset className="min-w-0 md:overflow-y-auto">{children}</SidebarInset>
          </SidebarProvider>
          {/* Reads the pathname, which is unknown while prerendering dynamic routes. */}
          <Suspense>
            <Tutorial />
          </Suspense>
        </Providers>
      </body>
    </html>
  )
}
