/**
 * Figma's Glass effect, as its panel shows it; shared by every surface. The
 * shader is a port of figma_glass (MIT, pub.dev/packages/figma_glass).
 */
export interface GlassOptics {
  /** Degrees, 0 from the top, clockwise; -45 lights the top-left. */
  lightAngle: number
  /** 0–1. */
  light: number
  /** 0–100 in Figma; past 100 pulls in further. */
  refraction: number
  /** How far in the bevel reaches, CSS px. */
  depth: number
  /** 0–100. */
  dispersion: number
  /** 0–100. */
  splay: number
  /**
   * Soft inset shadow along the top-left edges, 0–1. Not a Figma control,
   * but Figma's glass shows one; it beds the glass in.
   */
  innerShadow: number
}

/** A surface's own material. */
export interface GlassLook {
  /**
   * How much of the weave's contrast shows through, 0–1. Stands in for
   * Figma's Frost: blurring the pixel-fine weave leaves blotches.
   */
  seeThrough: number
  /** White fill, 0–1. */
  fill: number
  /** Rim brightness; 1 as Figma draws it. */
  rim: number
  /** Rim width, CSS px. */
  rimWidth: number
}

/** The frostier disc under a pane's `data-glass-frost` child. */
export type FrostLook = Pick<GlassLook, "seeThrough" | "fill">

/** The design's Figma values; depth is 19.34 there, deepened to match its render. */
export const FIGMA_GLASS: GlassOptics = {
  lightAngle: -45,
  light: 0.8,
  refraction: 100,
  depth: 21.67,
  dispersion: 56,
  splay: 64,
  innerShadow: 0.14,
}

/** Panes and buttons: Figma's 6% white fill over a faint weave. */
export const PANE_LOOK: GlassLook = {
  seeThrough: 0.4,
  fill: 0.06,
  rim: 1,
  rimWidth: 1,
}

/** A pane's frosted disc, standing in for a backdrop blur. */
export const PANE_FROST: FrostLook = { seeThrough: 0.15, fill: 0.18 }

/** The voice bars: frostier and milkier, with a brighter, wider rim. */
export const BARS_LOOK: GlassLook = {
  seeThrough: 0.25,
  fill: 0.12,
  rim: 1.8,
  rimWidth: 1.5,
}
