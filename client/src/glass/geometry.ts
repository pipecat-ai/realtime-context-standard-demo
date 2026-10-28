import { BAR_SHAPE, barLayout, barLift, barPositions, MAX_BARS } from "./bars"
import type { BarsState } from "./bars-motion"
import type { BarsGeometry, PaneGeometry } from "./renderer"
import type { BarsSource, PaneSource } from "./scene"

/** The canvas's on-screen box and its canvas pixels per CSS px. */
export interface CanvasBox {
  left: number
  top: number
  scale: number
}

export function canvasBox(canvas: HTMLCanvasElement): CanvasBox | null {
  const rect = canvas.getBoundingClientRect()
  if (rect.width === 0) return null
  return { left: rect.left, top: rect.top, scale: canvas.width / rect.width }
}

/** Where a pane's element sits over the canvas, following its corner radius. */
export function paneGeometry(
  { element, look, frost }: PaneSource,
  { left, top, scale }: CanvasBox
): PaneGeometry {
  const rect = element.getBoundingClientRect()
  const corner = Number.parseFloat(
    getComputedStyle(element).borderTopLeftRadius
  )
  const disc = element
    .querySelector("[data-glass-frost]")
    ?.getBoundingClientRect()
  return {
    x: (rect.left + rect.width / 2 - left) * scale,
    y: (rect.top + rect.height / 2 - top) * scale,
    halfWidth: (rect.width / 2) * scale,
    halfHeight: (rect.height / 2) * scale,
    radius: (Number.isNaN(corner) ? 0 : corner) * scale,
    frost: disc
      ? {
          x: (disc.left + disc.width / 2 - left) * scale,
          y: (disc.top + disc.height / 2 - top) * scale,
          radius: (disc.width / 2) * scale,
        }
      : null,
    look,
    frostLook: frost,
  }
}

const positions = new Float32Array(MAX_BARS)
const lifts = new Float32Array(MAX_BARS)

/** The bars laid out over the canvas; reuses shared buffers. */
export function barsGeometry(
  { element, look }: BarsSource,
  state: BarsState,
  time: number,
  { left, top, scale }: CanvasBox
): BarsGeometry | null {
  const rect = element.getBoundingClientRect()
  if (rect.height === 0) return null
  const count = Math.min(state.count, MAX_BARS)
  const { pitch, radius } = barLayout(count, rect.width / rect.height)
  barPositions(count, pitch, state.gather, time, positions)
  for (let i = 0; i < count; i++) lifts[i] = barLift(state.heights[i] ?? 0)
  return {
    x: (rect.left + rect.width / 2 - left) * scale,
    y: (rect.top + rect.height / 2 - top) * scale,
    unit: (rect.height / 2) * scale,
    count,
    positions,
    heights: lifts,
    pitch,
    radius,
    maxHalf: BAR_SHAPE.peak,
    restHalf: radius * BAR_SHAPE.restAspect,
    goo: pitch * BAR_SHAPE.goo,
    gather: state.gather,
    energy: state.energy,
    light: {
      x: (rect.left + state.light.x * rect.width - left) * scale,
      y: (rect.top + state.light.y * rect.height - top) * scale,
      intensity: state.light.intensity,
    },
    look,
  }
}
