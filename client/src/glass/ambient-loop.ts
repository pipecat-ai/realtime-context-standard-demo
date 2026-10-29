import { barsGeometry, canvasBox, paneGeometry } from "./geometry"
import type { GlassOptics } from "./optics"
import { lerpLook, type AmbientLook } from "./palettes"
import {
  createAmbientRenderer,
  type AmbientRenderer,
  type BarsGeometry,
  type PaneGeometry,
} from "./renderer"
import type { GlassScene } from "./scene"
import { weaveCanvas } from "./weave"

/** Gradient pixels per CSS px: it's all soft focus. */
const SCENE_SCALE = 0.5
const MAX_PIXEL_RATIO = 2
/** The gradient's frame interval (~20fps); moving glass redraws every frame. */
const FRAME_MS = 50
/** Palette blend rate, per second (~1.5s to settle). */
const BLEND_RATE = 2.5
/** Seconds in, past the noise's tidy origin. */
const START_SECONDS = 90
/** Largest step the bars' springs take. */
const MAX_BARS_DT = 1 / 30

export interface AmbientInputs {
  look: AmbientLook
  optics: GlassOptics
}

function geometryKey(
  version: number,
  panes: readonly PaneGeometry[],
  bars: BarsGeometry | null
): string {
  const values = [version]
  for (const pane of panes) {
    values.push(pane.x, pane.y, pane.halfWidth, pane.halfHeight, pane.radius)
  }
  if (bars) values.push(bars.x, bars.y, bars.unit)
  return values.map((value) => Math.round(value)).join(",")
}

/**
 * Runs the background on `canvas` until the returned stop is called. Draws
 * only what changed, pauses off-screen, holds still under reduced motion,
 * follows device pixel ratio changes and survives context loss.
 */
export function startAmbient(
  canvas: HTMLCanvasElement,
  scene: GlassScene,
  read: () => AmbientInputs
): () => void {
  let renderer: AmbientRenderer | null = null
  let width = 0
  let height = 0
  let dirty = true

  const resize = () => {
    if (!renderer || width === 0) return
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO)
    renderer.resize(width, height, ratio, SCENE_SCALE)
    dirty = true
  }
  const create = () => {
    try {
      renderer = createAmbientRenderer(canvas, weaveCanvas())
    } catch (error) {
      console.error(error)
      renderer = null
    }
    resize()
  }
  create()

  const sizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    ;({ width, height } = entry.contentRect)
    resize()
  })
  sizeObserver.observe(canvas)

  // A move between screens changes the ratio without resizing.
  let ratioQuery: MediaQueryList | null = null
  const onRatio = () => {
    resize()
    watchRatio()
  }
  const watchRatio = () => {
    ratioQuery?.removeEventListener("change", onRatio)
    ratioQuery = window.matchMedia(
      `(resolution: ${String(window.devicePixelRatio)}dppx)`
    )
    ratioQuery.addEventListener("change", onRatio)
  }
  watchRatio()

  let visible = true
  const visibility = new IntersectionObserver(([entry]) => {
    if (entry) visible = entry.isIntersecting
  })
  visibility.observe(canvas)

  const onLost = (event: Event) => {
    event.preventDefault()
    renderer = null
  }
  canvas.addEventListener("webglcontextlost", onLost)
  canvas.addEventListener("webglcontextrestored", create)

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  const look = structuredClone(read().look)
  let optics = read().optics
  let time = START_SECONDS
  let last = performance.now()
  let lastDraw = 0
  let lastScene = 0
  let lastKey = ""

  let frameId = requestAnimationFrame(function frame(now) {
    frameId = requestAnimationFrame(frame)
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    const still = reducedMotion.matches
    if (!still) time += dt
    const inputs = read()
    const blending =
      lerpLook(look, inputs.look, 1 - Math.exp(-dt * BLEND_RATE)) > 1e-4
    if (inputs.optics !== optics) {
      optics = inputs.optics
      dirty = true
    }
    // Not until the canvas is measured: before then it's the default 300×150,
    // and the scene's framebuffer has nothing attached.
    if (!renderer || !visible || width === 0 || canvas.width < 2) return

    const barsSource = scene.bars
    const barsState =
      barsSource?.step(Math.min(dt, MAX_BARS_DT), now / 1000) ?? null
    const barsMoving = barsState?.moving ?? false
    if (!blending && !dirty && !barsMoving && now - lastDraw < FRAME_MS) return
    lastDraw = now

    // Glass elements can move or resize between frames.
    const box = canvasBox(canvas)
    if (!box) return
    const panes = Array.from(scene.panes, (source) => paneGeometry(source, box))
    const bars =
      barsSource && barsState
        ? barsGeometry(barsSource, barsState, time, box)
        : null
    const key = geometryKey(scene.version, panes, bars)
    if (key !== lastKey) {
      lastKey = key
      dirty = true
    }
    if (still && !blending && !dirty && !barsMoving) return

    const drawScene = blending || dirty || now - lastScene >= FRAME_MS
    if (drawScene) lastScene = now
    dirty = false
    renderer.render({ look, time, optics, panes, bars, drawScene })
  })

  return () => {
    cancelAnimationFrame(frameId)
    sizeObserver.disconnect()
    visibility.disconnect()
    ratioQuery?.removeEventListener("change", onRatio)
    canvas.removeEventListener("webglcontextlost", onLost)
    canvas.removeEventListener("webglcontextrestored", create)
    renderer?.dispose()
  }
}
