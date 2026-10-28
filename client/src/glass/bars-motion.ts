import { barBoxX, MAX_BARS } from "./bars"

/** Per-bar spring: underdamped, so it overshoots and settles like jelly. */
const STIFFNESS = 240
const DAMPING = 15
/** Bars never grow past this; the spring may briefly aim beyond. */
const HEIGHT_LIMIT = 1.04
/** Gather spring: quick and underdamped, so the glob wobbles home. */
const GATHER_STIFFNESS = 260
const GATHER_DAMPING = 13
/** Seconds for the thinking ripple to cross the bars, each way. */
const SWEEP_SECONDS = 1.3
/** Width of the ripple's crest, in bars. */
const RIPPLE_WIDTH = 1.1
const RIPPLE_LIGHT = 0.85
/** Seconds for one on-and-off of the connecting glob's light. */
const PULSE_SECONDS = 1.6
const PULSE_LIGHT = 1

/** A light inside the bars: box coordinates (0–1, top-left) and strength. */
export interface BarsLight {
  x: number
  y: number
  intensity: number
}

/**
 * A light behind the bars: a fixed point in box coordinates, or "pointer" to
 * follow the mouse.
 */
export type Backlight = "pointer" | { x: number; y: number }

export interface BarsModes {
  /** Gathers the bars into one pulsing glob; wins over thinking. */
  isConnecting: boolean
  /** Sends a lit ripple along the bars and back. */
  isThinking: boolean
  barCount: number
}

/** The bars' state after a step, as the shader reads it. */
export interface BarsState {
  count: number
  /** Per bar, 0 (resting) to ~1 (full height). */
  heights: Float32Array
  /** Overall voice level, 0–1. */
  energy: number
  /** 0 spread out, 1 gathered into one glob. */
  gather: number
  light: BarsLight
  /** False once everything has settled, so frames can be skipped. */
  moving: boolean
}

export interface BarsInput {
  modes: BarsModes
  /** Per-band voice levels, 0–1, or null when silent. */
  levels: Float32Array | null
  /** The box's width over its height. */
  aspect: number
  /** Where the backlight is heading when nothing else claims the light. */
  backlight: (current: BarsLight) => BarsLight
}

/** Thinking ripple's position as a fractional bar index, eased there and back. */
function ripplePosition(time: number, count: number): number {
  const phase = (time / SWEEP_SECONDS) % 2
  const leg = phase < 1 ? phase : 2 - phase
  return (0.5 - 0.5 * Math.cos(Math.PI * leg)) * (count - 1)
}

/** The connecting glob's light, 0–1. */
function connectPulse(time: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * time) / PULSE_SECONDS)
}

function targetHeight(
  modes: BarsModes,
  i: number,
  count: number,
  time: number,
  level: number | null
): number {
  if (modes.isConnecting) return 0.04 + 0.1 * connectPulse(time)
  if (modes.isThinking) {
    const d = (i - ripplePosition(time, count)) / RIPPLE_WIDTH
    return 0.04 + 0.34 * Math.exp(-d * d)
  }
  if (level !== null) return level ** 1.2
  // Silent: breathing out of step.
  return 0.02 + 0.03 * (0.5 + 0.5 * Math.sin(time * 1.3 + i * 0.9))
}

/** Spring-driven bar heights, gather and light. */
export function createBarsMotion(): {
  step: (dt: number, time: number, input: BarsInput) => BarsState
} {
  const velocities = new Float32Array(MAX_BARS)
  let gatherVelocity = 0
  const state: BarsState = {
    count: MAX_BARS,
    heights: new Float32Array(MAX_BARS),
    energy: 0,
    gather: 0,
    light: { x: 0.5, y: 0.5, intensity: 0 },
    moving: true,
  }

  return {
    step(dt, time, { modes, levels, aspect, backlight }) {
      const count = Math.min(Math.max(modes.barCount, 1), MAX_BARS)
      const connecting = modes.isConnecting
      const thinking = modes.isThinking && !connecting
      const live = levels !== null && !connecting && !thinking
      const { heights, light } = state

      let total = 0
      for (let i = 0; i < count; i++) {
        const level = live ? (levels[i] ?? 0) : null
        const target = targetHeight(modes, i, count, time, level)
        total += target
        const h = heights[i] ?? 0
        const v =
          (velocities[i] ?? 0) +
          (STIFFNESS * (target - h) - DAMPING * (velocities[i] ?? 0)) * dt
        velocities[i] = v
        heights[i] = Math.min(Math.max(h + v * dt, 0), HEIGHT_LIMIT)
      }
      state.count = count
      state.energy += (total / count - state.energy) * Math.min(1, dt * 6)

      gatherVelocity +=
        (GATHER_STIFFNESS * ((connecting ? 1 : 0) - state.gather) -
          GATHER_DAMPING * gatherVelocity) *
        dt
      state.gather += gatherVelocity * dt

      // Connecting: the light pulses inside the glob once gathered.
      // Thinking: it rides the ripple's crest.
      const aim: BarsLight = connecting
        ? {
            x: 0.5,
            y: 0.5,
            intensity:
              PULSE_LIGHT * connectPulse(time) * Math.min(state.gather, 1) ** 2,
          }
        : thinking
          ? {
              x: barBoxX(ripplePosition(time, count), count, aspect),
              y: 0.5,
              intensity: RIPPLE_LIGHT,
            }
          : backlight(light)
      const glide = Math.min(1, dt * (connecting || thinking ? 20 : 8))
      const fade = Math.min(1, dt * (connecting ? 14 : 4))
      const moved =
        Math.abs(aim.x - light.x) +
        Math.abs(aim.y - light.y) +
        Math.abs(aim.intensity - light.intensity)
      light.x += (aim.x - light.x) * glide
      light.y += (aim.y - light.y) * glide
      light.intensity += (aim.intensity - light.intensity) * fade

      const resting = !live && !connecting && !thinking
      const settled =
        state.energy < 0.08 &&
        moved < 0.002 &&
        Math.abs(state.gather) + Math.abs(gatherVelocity) < 0.001
      state.moving = !(resting && settled)
      return state
    },
  }
}
