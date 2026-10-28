import { MAX_BARS } from "./bars"
import type { BarsLight } from "./bars-motion"
import type { FrostLook, GlassLook, GlassOptics } from "./optics"
import type { AmbientLook } from "./palettes"
import { COMPOSITE_FRAGMENT, MAX_PANES, SCENE_FRAGMENT } from "./shaders"
import {
  bindFullscreenTriangle,
  compileShader,
  FULLSCREEN_VERTEX,
  linkProgram,
} from "./webgl"

/** Weave texels per CSS px: one per device pixel at 2x, averaged at 1x. */
const WEAVE_DENSITY = 2
/** Strength of the weave's overlay blend, 0–1. */
const GRAIN_AMOUNT = 0.9

/** A pane of glass, in canvas pixels from the top-left. */
export interface PaneGeometry {
  x: number
  y: number
  halfWidth: number
  halfHeight: number
  radius: number
  /** The frosted disc, if any. */
  frost: { x: number; y: number; radius: number } | null
  look: GlassLook
  frostLook: FrostLook
}

/** The voice bars: their box in canvas pixels, their shape in scene units. */
export interface BarsGeometry {
  /** Centre of the box. */
  x: number
  y: number
  /** Canvas pixels per scene unit: half the box's height. */
  unit: number
  count: number
  /** Per bar, its centre across, scene units from the middle. */
  positions: Float32Array
  /** Per bar, 0 (square) to 1 (full height). */
  heights: Float32Array
  pitch: number
  radius: number
  maxHalf: number
  restHalf: number
  goo: number
  gather: number
  energy: number
  /** Canvas pixels. */
  light: BarsLight
  look: GlassLook
}

export interface AmbientFrame {
  look: AmbientLook
  /** Seconds. */
  time: number
  optics: GlassOptics
  panes: readonly PaneGeometry[]
  bars: BarsGeometry | null
  /** False reuses the last gradient and redraws only the composite. */
  drawScene: boolean
}

export interface AmbientRenderer {
  /** The output at `pixelRatio`, the gradient at `sceneScale`, per CSS px. */
  resize: (
    width: number,
    height: number,
    pixelRatio: number,
    sceneScale: number
  ) => void
  render: (frame: AmbientFrame) => void
  dispose: () => void
}

/**
 * Two passes: the gradient at low resolution into a texture, then a full
 * resolution composite that scales it up, presses in the weave and draws
 * the glass. Null without WebGL2.
 */
export function createAmbientRenderer(
  canvas: HTMLCanvasElement,
  weave: TexImageSource
): AmbientRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
  })
  if (!gl) return null

  const vertex = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX)
  const sceneProgram = linkProgram(gl, vertex, SCENE_FRAGMENT)
  const compositeProgram = linkProgram(gl, vertex, COMPOSITE_FRAGMENT)
  gl.deleteShader(vertex)
  const buffer = bindFullscreenTriangle(gl)

  const sceneTexture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const framebuffer = gl.createFramebuffer()

  // Filtered for the bent reads under glass, mipmapped for 1x screens.
  const weaveTexture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, weaveTexture)
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, weave)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const at = (program: WebGLProgram) => (name: string) =>
    gl.getUniformLocation(program, name)
  const sceneAt = at(sceneProgram)
  const s = {
    resolution: sceneAt("uResolution"),
    time: sceneAt("uTime"),
    stops: sceneAt("uStops"),
    glow: sceneAt("uGlow"),
    shadow: sceneAt("uShadow"),
    angle: sceneAt("uAngle"),
    glowAmount: sceneAt("uGlowAmount"),
    shadowAmount: sceneAt("uShadowAmount"),
  }
  const compositeAt = at(compositeProgram)
  const c = {
    resolution: compositeAt("uResolution"),
    pixelRatio: compositeAt("uPixelRatio"),
    weaveScale: compositeAt("uWeaveScale"),
    time: compositeAt("uTime"),
    depth: compositeAt("uDepth"),
    refraction: compositeAt("uRefraction"),
    dispersion: compositeAt("uDispersion"),
    splay: compositeAt("uSplay"),
    lightDir: compositeAt("uLightDir"),
    light: compositeAt("uLight"),
    innerShadow: compositeAt("uInnerShadow"),
    paneCount: compositeAt("uPaneCount"),
    paneBox: compositeAt("uPaneBox"),
    paneRadius: compositeAt("uPaneRadius"),
    paneFrost: compositeAt("uPaneFrost"),
    paneLook: compositeAt("uPaneLook"),
    paneFrostLook: compositeAt("uPaneFrostLook"),
    barsCount: compositeAt("uBarsCount"),
    barsCenter: compositeAt("uBarsCenter"),
    barsUnit: compositeAt("uBarsUnit"),
    barsShape: compositeAt("uBarsShape"),
    barsRest: compositeAt("uBarsRest"),
    barsMotion: compositeAt("uBarsMotion"),
    barsX: compositeAt("uBarsX"),
    barsHeights: compositeAt("uBarsHeights"),
    barsLight: compositeAt("uBarsLight"),
    barsLook: compositeAt("uBarsLook"),
  }
  gl.useProgram(compositeProgram)
  gl.uniform1i(compositeAt("uScene"), 0)
  gl.uniform1i(compositeAt("uGrain"), 1)
  gl.uniform1f(compositeAt("uGrainAmount"), GRAIN_AMOUNT)

  const stops = new Float32Array(12)
  const paneBox = new Float32Array(MAX_PANES * 4)
  const paneRadius = new Float32Array(MAX_PANES)
  const paneFrost = new Float32Array(MAX_PANES * 3)
  const paneLook = new Float32Array(MAX_PANES * 4)
  const paneFrostLook = new Float32Array(MAX_PANES * 2)
  let sceneWidth = 1
  let sceneHeight = 1
  let pixelRatio = 1

  return {
    resize(width, height, ratio, sceneScale) {
      pixelRatio = ratio
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      sceneWidth = Math.max(1, Math.round(width * sceneScale))
      sceneHeight = Math.max(1, Math.round(height * sceneScale))
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        sceneWidth,
        sceneHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      )
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        sceneTexture,
        0
      )
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    },

    render({ look, time, optics, panes, bars, drawScene }) {
      // The shader counts y up from the bottom.
      const flip = (y: number) => canvas.height - y

      if (drawScene) {
        look.stops.forEach((stop, i) => {
          stops.set(stop, i * 3)
        })
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.viewport(0, 0, sceneWidth, sceneHeight)
        gl.useProgram(sceneProgram)
        gl.uniform2f(s.resolution, sceneWidth, sceneHeight)
        gl.uniform1f(s.time, time)
        gl.uniform3fv(s.stops, stops)
        gl.uniform3fv(s.glow, look.glow)
        gl.uniform3fv(s.shadow, look.shadow)
        gl.uniform1f(s.angle, look.angle)
        gl.uniform1f(s.glowAmount, look.glowAmount)
        gl.uniform1f(s.shadowAmount, look.shadowAmount)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      }

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(compositeProgram)
      gl.uniform2f(c.resolution, canvas.width, canvas.height)
      gl.uniform1f(c.pixelRatio, pixelRatio)
      gl.uniform1f(c.weaveScale, WEAVE_DENSITY / pixelRatio)
      gl.uniform1f(c.time, time)

      const angle = (optics.lightAngle * Math.PI) / 180
      gl.uniform1f(c.depth, optics.depth)
      gl.uniform1f(c.refraction, optics.refraction / 100)
      gl.uniform1f(c.dispersion, optics.dispersion / 100)
      gl.uniform1f(c.splay, optics.splay / 100)
      gl.uniform2f(c.lightDir, Math.sin(angle), Math.cos(angle))
      gl.uniform1f(c.light, optics.light)
      gl.uniform1f(c.innerShadow, optics.innerShadow)

      const paneCount = Math.min(panes.length, MAX_PANES)
      for (let i = 0; i < paneCount; i++) {
        const pane = panes[i]
        if (!pane) continue
        paneBox.set(
          [pane.x, flip(pane.y), pane.halfWidth, pane.halfHeight],
          i * 4
        )
        paneRadius[i] = pane.radius
        const disc = pane.frost
        paneFrost.set(
          disc ? [disc.x, flip(disc.y), disc.radius] : [0, 0, 0],
          i * 3
        )
        const { look: paneMaterial, frostLook } = pane
        paneLook.set(
          [
            paneMaterial.seeThrough,
            paneMaterial.fill,
            paneMaterial.rim,
            paneMaterial.rimWidth,
          ],
          i * 4
        )
        paneFrostLook.set([frostLook.seeThrough, frostLook.fill], i * 2)
      }
      gl.uniform1i(c.paneCount, paneCount)
      if (paneCount > 0) {
        gl.uniform4fv(c.paneBox, paneBox)
        gl.uniform1fv(c.paneRadius, paneRadius)
        gl.uniform3fv(c.paneFrost, paneFrost)
        gl.uniform4fv(c.paneLook, paneLook)
        gl.uniform2fv(c.paneFrostLook, paneFrostLook)
      }

      gl.uniform1i(c.barsCount, bars ? Math.min(bars.count, MAX_BARS) : 0)
      if (bars) {
        gl.uniform2f(c.barsCenter, bars.x, flip(bars.y))
        gl.uniform1f(c.barsUnit, bars.unit)
        gl.uniform4f(
          c.barsShape,
          bars.pitch,
          bars.radius,
          bars.maxHalf,
          bars.goo
        )
        gl.uniform1f(c.barsRest, bars.restHalf)
        gl.uniform2f(c.barsMotion, bars.gather, bars.energy)
        gl.uniform1fv(c.barsX, bars.positions)
        gl.uniform1fv(c.barsHeights, bars.heights)
        gl.uniform3f(
          c.barsLight,
          bars.light.x,
          flip(bars.light.y),
          bars.light.intensity
        )
        gl.uniform4f(
          c.barsLook,
          bars.look.seeThrough,
          bars.look.fill,
          bars.look.rim,
          bars.look.rimWidth
        )
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },

    dispose() {
      gl.deleteBuffer(buffer)
      gl.deleteFramebuffer(framebuffer)
      gl.deleteTexture(sceneTexture)
      gl.deleteTexture(weaveTexture)
      gl.deleteProgram(sceneProgram)
      gl.deleteProgram(compositeProgram)
    },
  }
}
