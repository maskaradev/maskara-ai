"use client"

import { useEffect, useRef } from "react"

import { loadImage, paintRegions, type PaintMode } from "@/lib/pipeline/image"
import type { ImageItem } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Renders an image with the identification agent's blanks or the generation agent's
 * persona values painted on top. Only box coordinates are stored, never pixels.
 */
export function ImageCanvas({
  item,
  mode,
  showWords = false,
  className,
  onCanvas,
}: {
  item: ImageItem
  mode: PaintMode
  showWords?: boolean
  className?: string
  onCanvas?: (canvas: HTMLCanvasElement) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    loadImage(item.src).then((img) => {
      const canvas = ref.current
      if (cancelled || !canvas) return
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      paintRegions(ctx, item.regions, mode, { words: item.words, showWords })
      onCanvas?.(canvas)
    })
    return () => {
      cancelled = true
    }
  }, [item, mode, showWords, onCanvas])

  return <canvas ref={ref} className={cn("h-auto w-full rounded border bg-white", className)} />
}
