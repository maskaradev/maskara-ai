"use client"

import { useEffect, useRef } from "react"

import { drawRepaintedFaces, loadImage, loadRaster, paintRegions, rasterSize, type PaintMode } from "@/lib/pipeline/image"
import type { ImageItem } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Renders an image with the identification agent's blanks (and optionally the OCR layout) or the generation agent's
 * persona values painted on top. Only box coordinates are stored, never pixels.
 */
export function ImageCanvas({
  item,
  mode,
  showLayout = false,
  className,
  onCanvas,
}: {
  item: ImageItem
  mode: PaintMode
  showLayout?: boolean
  className?: string
  onCanvas?: (canvas: HTMLCanvasElement) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    // Generated photos take their faces from the repainted image when the GPU repaint model produced one.
    const repaint = mode === "generate" && item.repainted ? loadImage(item.repainted) : null
    Promise.all([loadRaster(item), repaint]).then(([img, repainted]) => {
      const canvas = ref.current
      if (cancelled || !canvas) return
      const size = rasterSize(img)
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      if (repainted) drawRepaintedFaces(ctx, repainted, item.regions, item.words)
      paintRegions(ctx, item.regions, mode, { words: item.words, blocks: item.blocks, showLayout, facesRepainted: !!repainted })
      onCanvas?.(canvas)
    })
    return () => {
      cancelled = true
    }
  }, [item, mode, showLayout, onCanvas])

  return <canvas ref={ref} className={cn("h-auto w-full rounded border bg-white", className)} />
}
