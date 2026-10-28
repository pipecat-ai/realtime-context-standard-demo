import { useEffect, useRef } from "react"

import { AudioVisualizerBarView } from "@/components/pipecat/audio-visualizer-bar"
import { cn } from "@/lib/utils"
import {
  createVisualizerAnalyser,
  createVoiceBands,
  readBand,
  type VisualizerBand,
} from "@/lib/visualizer"

import { MAX_BARS } from "./bars"
import {
  createBarsMotion,
  type Backlight,
  type BarsLight,
  type BarsModes,
} from "./bars-motion"
import { BARS_LOOK, type GlassLook } from "./optics"
import { useGlassScene } from "./scene"

/** Pointer distance past the box, as a fraction of its height, where a pointer backlight fades out. */
const POINTER_REACH = 0.6

/** Per-band voice levels (0–1) from an analyser, rebuilt as it or the count changes. */
function createVoiceLevels() {
  const levels = new Float32Array(MAX_BARS)
  let spectrum = new Uint8Array(0)
  let bands: VisualizerBand[] = []
  let built: { analyser: AnalyserNode; count: number } | null = null
  return (analyser: AnalyserNode, count: number): Float32Array => {
    if (built?.analyser !== analyser || built.count !== count) {
      bands = createVoiceBands(
        count,
        analyser.context.sampleRate,
        analyser.frequencyBinCount
      )
      spectrum = new Uint8Array(analyser.frequencyBinCount)
      built = { analyser, count }
    }
    analyser.getByteFrequencyData(spectrum)
    bands.forEach((band, i) => {
      levels[i] = readBand(spectrum, band) / 255
    })
    return levels
  }
}

/** Where the backlight heads: the set point, or the pointer, fading as it strays. */
function backlightAim(
  backlight: Backlight | null,
  pointer: { x: number; y: number } | null,
  box: Element,
  current: BarsLight
): BarsLight {
  if (!backlight) return { ...current, intensity: 0 }
  if (backlight !== "pointer") return { ...backlight, intensity: 1 }
  if (!pointer) return { ...current, intensity: 0 }
  const rect = box.getBoundingClientRect()
  const x = (pointer.x - rect.left) / rect.width
  const y = (pointer.y - rect.top) / rect.height
  const outside = Math.hypot(
    Math.max(0, Math.abs(x - 0.5) - 0.5) * rect.width,
    Math.max(0, Math.abs(y - 0.5) - 0.5) * rect.height
  )
  return {
    x: Math.min(Math.max(x, -0.1), 1.1),
    y: Math.min(Math.max(y, -0.1), 1.1),
    intensity: Math.max(0, 1 - outside / (rect.height * POINTER_REACH)),
  }
}

export interface GlassVoiceBarsProps {
  /** Audio to visualize; the bars rest, breathing, when null. */
  track: MediaStreamTrack | null
  /** Gathers the bars into one pulsing glob; wins over thinking. */
  isConnecting?: boolean
  /** Sends a lit ripple along the bars and back, ignoring the track. */
  isThinking?: boolean
  /** Up to 8. */
  barCount?: number
  /** Lights the bars from behind; fades as it's set and cleared. */
  backlight?: Backlight | null
  look?: GlassLook
  /** Bar colour for the flat fallback: a CSS colour or "--css-var". */
  fallbackColor?: string
  className?: string
}

/**
 * Voice-band bars of liquid glass that melt into one another, drawn by the
 * enclosing AmbientBackground. Flat bars without one, or without WebGL2.
 */
export function GlassVoiceBars({
  track,
  isConnecting = false,
  isThinking = false,
  barCount = MAX_BARS,
  backlight = null,
  look = BARS_LOOK,
  fallbackColor = "currentColor",
  className,
}: GlassVoiceBarsProps) {
  const scene = useGlassScene()
  const boxRef = useRef<HTMLDivElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const modesRef = useRef<BarsModes>({ isConnecting, isThinking, barCount })
  const backlightRef = useRef(backlight)
  const lookRef = useRef(look)

  useEffect(() => {
    modesRef.current = { isConnecting, isThinking, barCount }
    backlightRef.current = backlight
    lookRef.current = look
  }, [isConnecting, isThinking, barCount, backlight, look])

  useEffect(() => {
    if (!track || !scene) return
    const { analyser, dispose } = createVisualizerAnalyser(track)
    analyserRef.current = analyser
    return () => {
      analyserRef.current = null
      dispose()
    }
  }, [track, scene])

  useEffect(() => {
    const box = boxRef.current
    if (!scene || !box) return

    // The mouse, for a pointer backlight; touch has no hover to follow.
    let pointer: { x: number; y: number } | null = null
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        pointer = { x: event.clientX, y: event.clientY }
      }
    }
    const onPointerLeave = () => {
      pointer = null
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    document.documentElement.addEventListener("pointerleave", onPointerLeave)

    const motion = createBarsMotion()
    const readLevels = createVoiceLevels()
    const source = {
      element: box,
      get look() {
        return lookRef.current
      },
      step: (dt: number, time: number) => {
        const modes = modesRef.current
        const analyser = analyserRef.current
        return motion.step(dt, time, {
          modes,
          levels: analyser
            ? readLevels(
                analyser,
                Math.min(Math.max(modes.barCount, 1), MAX_BARS)
              )
            : null,
          aspect: box.clientWidth / Math.max(box.clientHeight, 1),
          backlight: (current) =>
            backlightAim(backlightRef.current, pointer, box, current),
        })
      },
    }
    const unregister = scene.setBars(source)

    return () => {
      unregister()
      window.removeEventListener("pointermove", onPointerMove)
      document.documentElement.removeEventListener(
        "pointerleave",
        onPointerLeave
      )
    }
  }, [scene])

  if (!scene) {
    return (
      <AudioVisualizerBarView
        track={track}
        isConnecting={isConnecting}
        isThinking={isThinking}
        barCount={barCount}
        barColor={fallbackColor}
        className={className}
      />
    )
  }

  return <div ref={boxRef} aria-hidden className={cn("size-full", className)} />
}
