/** Side of the tile, in texels; it repeats seamlessly. */
const TILE = 512
/**
 * Each thread's lit and shaded sides, around mid-grey. The shade runs
 * deeper than the light, so the weave reads as pressed into the surface.
 */
const LIGHT = 0.16
const SHADE = 0.36
/** Per-texel grain, also leaning dark. */
const GRAIN = 0.13
const GRAIN_BIAS = -0.03

/** A deterministic hash of a cell and a seed, 0–1. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

let values: Float32Array | null = null
let tile: HTMLCanvasElement | null = null
let url: string | null = null

/**
 * Woven canvas, as greys 0–1: each 2×2 block is a short thread running
 * across or down, lit on one side and shaded on the other, over per-texel
 * grain. No low-frequency variation, which would show as the tile repeats.
 * Mid-grey is neutral, for an overlay blend.
 */
function weaveValues(): Float32Array {
  if (values) return values
  values = new Float32Array(TILE * TILE)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const bx = x >> 1
      const by = y >> 1
      const across = hash(bx, by, 1) < 0.5
      const lit = across ? (y & 1) === 0 : (x & 1) === 0
      const strength = 0.45 + 0.55 * hash(bx, by, 2)
      const thread = (lit ? LIGHT : -SHADE) * strength
      const grain = GRAIN * (hash(x, y, 3) * 2 - 1) + GRAIN_BIAS
      values[y * TILE + x] = 0.5 + thread + grain
    }
  }
  return values
}

function toCanvas(source: Float32Array): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = TILE
  canvas.height = TILE
  const context = canvas.getContext("2d")
  if (!context) return canvas
  const image = context.createImageData(TILE, TILE)
  source.forEach((value, i) => {
    const grey = Math.round(Math.min(Math.max(value, 0), 1) * 255)
    image.data[i * 4] = grey
    image.data[i * 4 + 1] = grey
    image.data[i * 4 + 2] = grey
    image.data[i * 4 + 3] = 255
  })
  context.putImageData(image, 0, 0)
  return canvas
}

/** The weave as a grey tile, drawn at two texels per CSS pixel. Built once. */
export function weaveCanvas(): HTMLCanvasElement {
  tile ??= toCanvas(weaveValues())
  return tile
}

/** The tile as a data URL, for a CSS overlay where WebGL isn't available. */
export function weaveTexture(): string {
  url ??= weaveCanvas().toDataURL("image/png")
  return url
}

/**
 * The tile's size in CSS pixels: two texels each, so the weave is as fine
 * on any screen (one texel per device pixel on a 2x one).
 */
export const WEAVE_TILE_CSS = TILE / 2
