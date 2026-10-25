"use client"

import { DocumentView, FaceActivated, Microphone, TextScale, Video, type CarbonIconType } from "@carbon/icons-react"

import { PageHeader } from "@/components/page-header"
import { FacePanel, OcrPanel } from "@/components/playground/media-panels"
import { ComingSoon } from "@/components/playground/shared"
import { TextPanel } from "@/components/playground/text-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMessages } from "@/lib/i18n"
import type { Modality } from "@/lib/playground"

const TABS: { id: Modality; icon: CarbonIconType; soon?: boolean }[] = [
  { id: "text", icon: TextScale },
  { id: "ocr", icon: DocumentView },
  { id: "face", icon: FaceActivated },
  { id: "audio", icon: Microphone, soon: true },
  { id: "video", icon: Video, soon: true },
]

export function PlaygroundScreen() {
  const m = useMessages().playground
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader trail={[m.trail]} />
      <main className="flex flex-1 flex-col gap-6 px-6 py-6">
        <div className="flex max-w-3xl flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight">{m.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{m.intro}</p>
        </div>
        {/* Panels stay mounted so switching modality keeps each one's samples and results. */}
        <Tabs defaultValue="text" className="gap-6">
          <TabsList variant="line" className="border-b pb-1">
            {TABS.map(({ id, icon: Icon, soon }) => (
              <TabsTrigger key={id} value={id} className="flex-none px-3">
                <Icon />
                {m.modalities[id]}
                {soon && <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{m.soon}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="text" forceMount className="data-[state=inactive]:hidden">
            <TextPanel />
          </TabsContent>
          <TabsContent value="ocr" forceMount className="data-[state=inactive]:hidden">
            <OcrPanel />
          </TabsContent>
          <TabsContent value="face" forceMount className="data-[state=inactive]:hidden">
            <FacePanel />
          </TabsContent>
          <TabsContent value="audio">
            <ComingSoon body={m.comingSoon.audio} />
          </TabsContent>
          <TabsContent value="video">
            <ComingSoon body={m.comingSoon.video} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
