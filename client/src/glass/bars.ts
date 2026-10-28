/** The most bars the shader draws. */
export const MAX_BARS = 8

/** The row spans this much of the box's width, in half-heights per bar. */
const SPAN = 0.675
/** Caps the pitch so a few bars in a wide box don't balloon. */
const MAX_PITCH = 0.255
/** Bar half-width as a fraction of the pitch; the rest is the gap. */
const WIDTH = 0.392

/**
 * The bars' shape: square when quiet, tall with the voice, breathing by
 * drifting sideways.
 */
export const BAR_SHAPE = {
  /** A quiet bar's height over its width. */
  restAspect: 1,
  /** Heights up to this (silence's breathing) leave a bar square. */
  quiet: 0.05,
  /** Bends the voice's heights; below 1 lifts the peaks. */
  peakCurve: 0.7,
  /** A full bar's half-height, as a fraction of the box's. */
  peak: 0.95,
  /** The most a gap closes as the bars drift, as a fraction of the pitch. */
  drift: 0.08,
  /** How readily neighbours melt, as a fraction of the pitch. */
  goo: 0.55,
} as const

/**
 * Spacing between bar centres and each bar's half-width, in scene units
 * (the box spans y from -1 to 1), for a box aspect ratio.
 */
export function barLayout(
  count: number,
  aspect: number
): { pitch: number; radius: number } {
  const pitch = Math.min((2 * aspect * SPAN) / count, MAX_PITCH)
  return { pitch, radius: pitch * WIDTH }
}

/** A bar's centre across the box, 0–1; fractional indices land between bars. */
export function barBoxX(index: number, count: number, aspect: number): number {
  const centre = (index - (count - 1) / 2) * barLayout(count, aspect).pitch
  return (centre / aspect + 1) / 2
}

/** A voice height (0–1) as a bar's growth: 0 square, 1 full height. */
export function barLift(height: number): number {
  const { quiet, peakCurve } = BAR_SHAPE
  return Math.max((height - quiet) / (1 - quiet), 0) ** peakCurve
}

/**
 * Each bar's centre across, in scene units from the row's middle, into
 * `out`. Each gap closes now and then to its own slow rhythm, never opening
 * past rest, so neighbours melt and part; stilled as the bars gather.
 */
export function barPositions(
  count: number,
  pitch: number,
  gather: number,
  time: number,
  out: Float32Array
): void {
  const calm = 1 - gather
  let x = 0
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      // Rates no other gap shares, so the pattern never visibly repeats;
      // squared, so a gap mostly rests.
      const j = i - 1
      const wave =
        0.6 * Math.sin(time * (0.28 + 0.05 * j) + j * 2.39) +
        0.4 * Math.sin(time * (0.16 + 0.03 * j) + j * 1.31)
      x += pitch * (1 - BAR_SHAPE.drift * calm * (0.5 + 0.5 * wave) ** 2)
    }
    out[i] = x
  }
  for (let i = 0; i < count; i++) out[i] = (out[i] ?? 0) - x / 2
}
