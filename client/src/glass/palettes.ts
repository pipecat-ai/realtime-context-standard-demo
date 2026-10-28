export type Rgb = [number, number, number]

/** A look for the ambient background. Colours are sRGB hex. */
export interface AmbientPalette {
  id: string
  name: string
  /** Ground to sky. */
  stops: [string, string, string, string]
  /** The light wandering near the horizon. */
  glow: string
  /** The dark masses on the horizon. */
  shadow: string
  /** Tilt of the bands in degrees; positive tilts them up to the right. */
  angle: number
  /** 0–1. */
  glowAmount: number
  /** 0–1. */
  shadowAmount: number
}

/** The first is the default. */
export const AMBIENT_PALETTES: readonly AmbientPalette[] = [
  {
    id: "plum",
    name: "Plum",
    stops: ["#1e0319", "#4b122b", "#7a3e8a", "#a77cdf"],
    glow: "#9a3a78",
    shadow: "#160212",
    angle: -40,
    glowAmount: 0.4,
    shadowAmount: 0.45,
  },
  {
    id: "violet",
    name: "Violet",
    stops: ["#9440bf", "#ad4cc2", "#d79bd5", "#c98dd9"],
    glow: "#e0a8dc",
    shadow: "#5a2380",
    angle: 2,
    glowAmount: 0.35,
    shadowAmount: 0.2,
  },
  {
    id: "rose",
    name: "Rose",
    stops: ["#d3a3c0", "#d6609f", "#d38fb2", "#9b5aa0"],
    glow: "#e2559f",
    shadow: "#3d1a3a",
    angle: 0,
    glowAmount: 0.45,
    shadowAmount: 0.85,
  },
  {
    id: "amber",
    name: "Amber",
    stops: ["#5f4630", "#c27e2c", "#b9752f", "#85614a"],
    glow: "#dc9a30",
    shadow: "#3b2a1a",
    angle: 0,
    glowAmount: 0.55,
    shadowAmount: 0.35,
  },
  {
    id: "lagoon",
    name: "Lagoon",
    stops: ["#2e5a52", "#9aa27a", "#74a893", "#6aa794"],
    glow: "#c8c9ae",
    shadow: "#222a22",
    angle: 6,
    glowAmount: 0.4,
    shadowAmount: 0.8,
  },
  {
    id: "slate",
    name: "Slate",
    stops: ["#365757", "#5f8484", "#6c9694", "#3f4a58"],
    glow: "#79a69f",
    shadow: "#2e3344",
    angle: -8,
    glowAmount: 0.5,
    shadowAmount: 0.3,
  },
]

export const DEFAULT_AMBIENT_PALETTE = AMBIENT_PALETTES[0]?.id ?? "plum"

/** The palette with this id, or the default. */
export function ambientPalette(id: string): AmbientPalette {
  const palette =
    AMBIENT_PALETTES.find((candidate) => candidate.id === id) ??
    AMBIENT_PALETTES[0]
  if (!palette) throw new Error("glass: no palettes")
  return palette
}

/** The palette as a CSS gradient: swatches and the no-WebGL fallback. */
export function ambientGradient(palette: AmbientPalette): string {
  const [ground, low, high, sky] = palette.stops
  // CSS angles turn clockwise, the shader's counter-clockwise.
  return `linear-gradient(${String(-palette.angle)}deg,${ground}, ${low} 35%, ${high} 65%, ${sky})`
}

/** A palette in the shader's terms: linear RGB, angle in radians. */
export interface AmbientLook {
  stops: [Rgb, Rgb, Rgb, Rgb]
  glow: Rgb
  shadow: Rgb
  angle: number
  glowAmount: number
  shadowAmount: number
}

function hexToLinear(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number) => (((value >> shift) & 0xff) / 255) ** 2.2
  return [channel(16), channel(8), channel(0)]
}

export function paletteLook(palette: AmbientPalette): AmbientLook {
  const [ground, low, high, sky] = palette.stops
  return {
    stops: [
      hexToLinear(ground),
      hexToLinear(low),
      hexToLinear(high),
      hexToLinear(sky),
    ],
    glow: hexToLinear(palette.glow),
    shadow: hexToLinear(palette.shadow),
    angle: (palette.angle * Math.PI) / 180,
    glowAmount: palette.glowAmount,
    shadowAmount: palette.shadowAmount,
  }
}

function lerpRgb(from: Rgb, to: Rgb, k: number): number {
  let moved = 0
  for (const i of [0, 1, 2] as const) {
    const step = (to[i] - from[i]) * k
    from[i] += step
    moved += Math.abs(step)
  }
  return moved
}

/** Moves `from` a fraction `k` toward `to`, in place; returns how far it moved. */
export function lerpLook(
  from: AmbientLook,
  to: AmbientLook,
  k: number
): number {
  let moved = 0
  from.stops.forEach((stop, i) => {
    moved += lerpRgb(stop, to.stops[i] ?? stop, k)
  })
  moved += lerpRgb(from.glow, to.glow, k)
  moved += lerpRgb(from.shadow, to.shadow, k)
  for (const key of ["angle", "glowAmount", "shadowAmount"] as const) {
    const step = (to[key] - from[key]) * k
    from[key] += step
    moved += Math.abs(step)
  }
  return moved
}
