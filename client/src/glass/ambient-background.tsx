import { type ReactNode, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { startAmbient } from "./ambient-loop"
import { FIGMA_GLASS, type GlassOptics } from "./optics"
import { ambientGradient, paletteLook, type AmbientPalette } from "./palettes"
import { createGlassScene, GlassSceneContext } from "./scene"
import { WEAVE_TILE_CSS, weaveTexture } from "./weave"
import { supportsWebGL2 } from "./webgl"

/** The weave as a CSS blend layer, without WebGL2. */
function GrainOverlay() {
  const [texture] = useState(weaveTexture)
  return (
    <div
      className="absolute inset-0 opacity-90 mix-blend-overlay"
      style={{
        backgroundImage: `url(${texture})`,
        backgroundSize: `${String(WEAVE_TILE_CSS)}px`,
      }}
    />
  )
}

export interface AmbientBackgroundProps {
  palette: AmbientPalette
  /** Glass optics shared by every surface; defaults to the design's. */
  optics?: GlassOptics
  /** Content over the background; glass panes and bars must be inside. */
  children?: ReactNode
  className?: string
}

/**
 * A slow, shifting gradient under a woven grain, like an out-of-focus photo
 * printed on canvas, drawing glass beneath the GlassButtons, useGlassPane
 * elements and GlassVoiceBars inside it. Without WebGL2 it's a still CSS
 * gradient under the grain, and no glass.
 */
export function AmbientBackground({
  palette,
  optics = FIGMA_GLASS,
  children,
  className,
}: AmbientBackgroundProps) {
  const [scene] = useState(() => (supportsWebGL2() ? createGlassScene() : null))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lookRef = useRef(paletteLook(palette))
  const opticsRef = useRef(optics)

  useEffect(() => {
    lookRef.current = paletteLook(palette)
  }, [palette])

  useEffect(() => {
    opticsRef.current = optics
  }, [optics])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !scene) return
    return startAmbient(canvas, scene, () => ({
      look: lookRef.current,
      optics: opticsRef.current,
    }))
  }, [scene])

  return (
    <div className={cn("relative isolate", className)}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 overflow-hidden"
        style={{ backgroundImage: ambientGradient(palette) }}
      >
        {scene ? (
          <canvas ref={canvasRef} className="block size-full" />
        ) : (
          <GrainOverlay />
        )}
      </div>
      <GlassSceneContext value={scene}>{children}</GlassSceneContext>
    </div>
  )
}
