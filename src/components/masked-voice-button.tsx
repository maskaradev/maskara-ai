"use client"

import { Square, Volume2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { useMessages } from "@/lib/i18n"

/**
 * Plays the masked transcript with browser speech synthesis. A different voice
 * replaces the speaker's own, so the recording's voiceprint is gone too.
 */
export function MaskedVoiceButton({ script }: { script: string }) {
  const [playing, setPlaying] = useState(false)
  const m = useMessages().results

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  function play() {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const voices = synth.getVoices().filter((v) => v.lang.startsWith("en"))
    const speakers = new Map<string, SpeechSynthesisVoice | undefined>()
    const lines = script.split("\n").filter((l) => l.trim())
    lines.forEach((line, i) => {
      const m = line.match(/^([^:]{2,40}):\s+(.*)$/)
      const speaker = m?.[1] ?? "narrator"
      if (!speakers.has(speaker)) speakers.set(speaker, voices[(speakers.size * 3 + 1) % Math.max(voices.length, 1)])
      const u = new SpeechSynthesisUtterance(m?.[2] ?? line)
      const voice = speakers.get(speaker)
      if (voice) u.voice = voice
      u.rate = 1.05
      if (i === lines.length - 1) u.onend = () => setPlaying(false)
      synth.speak(u)
    })
    setPlaying(true)
  }

  function stop() {
    window.speechSynthesis?.cancel()
    setPlaying(false)
  }

  return (
    <Button size="sm" variant="outline" onClick={playing ? stop : play}>
      {playing ? <Square /> : <Volume2 />}
      {playing ? m.stop : m.playVoice}
    </Button>
  )
}
