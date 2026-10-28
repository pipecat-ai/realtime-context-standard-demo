import { MAX_BARS } from "./bars"

/** The most panes of glass drawn at once. */
export const MAX_PANES = 8

/**
 * The gradient, drawn at low resolution: an out-of-focus landscape of soft
 * bands folded by domain-warped noise, a glow near the horizon and dark
 * masses along it. Colours are linear and mixed in linear light.
 */
export const SCENE_FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
/** Ground to sky. */
uniform vec3 uStops[4];
uniform vec3 uGlow;
uniform vec3 uShadow;
/** Radians; positive tilts the bands up to the right. */
uniform float uAngle;
uniform float uGlowAmount;
uniform float uShadowAmount;

out vec4 fragColor;

/** A fold drifts its own width in ~13s. */
const float SPEED = 0.07;
/** Stretched across, so the folds run wide like a horizon. */
const vec2 STRETCH = vec2(0.85, 2.1);
/** How far the folds push the bands. */
const float FOLD = 0.42;
/** How hard the noise folds back on itself. */
const float WARP = 2.1;
/** Light and shade across the folds. */
const float SHADE = 0.32;
/** Where the dark masses sit along the band axis. */
const float HORIZON = 0.44;
const float VIGNETTE = 0.32;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

/** Gradient noise, about -0.7 to 0.7. */
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Three fast-falling octaves: broad shapes only, finer reads as blotches. */
float fbm(vec2 p) {
  const mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  float sum = 0.0;
  float amp = 0.6;
  for (int i = 0; i < 3; i++) {
    sum += amp * noise(p);
    p = turn * p * 1.9 + 7.31;
    amp *= 0.38;
  }
  return sum;
}

/** The four stops, with wide overlaps so no edge shows. */
vec3 ramp(float h) {
  vec3 col = uStops[0];
  col = mix(col, uStops[1], smoothstep(0.05, 0.42, h));
  col = mix(col, uStops[2], smoothstep(0.38, 0.7, h));
  col = mix(col, uStops[3], smoothstep(0.62, 1.0, h));
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = uTime * SPEED;

  // Noise warped by itself twice, so shapes roll into one another.
  vec2 s = p * STRETCH;
  vec2 q = vec2(
    fbm(s + vec2(0.0, t)),
    fbm(s + vec2(5.2, 1.3) - t * 0.8)
  );
  vec2 r = vec2(
    fbm(s + WARP * q + vec2(1.7, 9.2) + t * 0.6),
    fbm(s + WARP * q + vec2(8.3, 2.8) - t * 0.45)
  );

  vec2 axis = vec2(-sin(uAngle), cos(uAngle));
  float level = dot(p, axis) + 0.5;
  float h = level + FOLD * r.y + 0.1 * q.x;
  vec3 col = ramp(h);
  col *= 1.0 + SHADE * (q.y - r.x);

  // A glow wandering near the horizon, wider than tall.
  vec2 glowAt = vec2(
    0.32 * aspect * sin(t * 0.9 + 1.3),
    0.04 + 0.1 * sin(t * 0.63 + 0.4)
  );
  vec2 g = (p - glowAt) * vec2(0.75 / max(aspect, 1.0), 1.7);
  float glow = exp(-5.0 * dot(g, g)) * (0.8 + 0.6 * r.x);
  col = mix(col, uGlow, clamp(glow * uGlowAmount, 0.0, 1.0));

  // Dark masses: a ragged top, a soft fade below, only where a slower noise
  // lets them through.
  float above = level + 0.12 * r.y - HORIZON;
  float ridge = 0.07 + 0.1 * fbm(vec2(p.x * 2.2 + t * 0.5, t * 0.3 + 3.0));
  float mass = (1.0 - smoothstep(ridge - 0.03, ridge + 0.09, above))
    * smoothstep(-0.34, -0.1, above);
  float reach = smoothstep(-0.12, 0.12, fbm(vec2(p.x * 0.65 - t * 0.35, 4.0)));
  col = mix(col, uShadow, mass * reach * uShadowAmount);

  vec2 v = (uv - 0.5) * vec2(1.1, 1.3);
  col *= 1.0 - VIGNETTE * smoothstep(0.1, 0.55, dot(v, v));

  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  // Dither against banding; the grain hides the rest.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  fragColor = vec4(col + (dither - 0.5) / 255.0, 1.0);
}
`

/**
 * Full resolution: the gradient scaled up with the weave pressed in by an
 * overlay blend, then the glass over it, as Figma's Glass effect draws it.
 * Within `depth` of an edge the background is read from further in, so it
 * bends toward the rim (refraction, splay), with red and blue bent apart
 * (dispersion). Over that: fill, an inset shadow, a sheen along the lit
 * edges and a hairline rim lit by how squarely it faces the light. Positions
 * are device pixels from the bottom-left; lengths named in CSS px are scaled
 * by uPixelRatio.
 */
export const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;

#define MAX_PANES ${String(MAX_PANES)}
#define MAX_BARS ${String(MAX_BARS)}

uniform sampler2D uScene;
uniform sampler2D uGrain;
uniform vec2 uResolution;
uniform float uPixelRatio;
/** Weave texels per device pixel; mipmaps average them on 1x screens. */
uniform float uWeaveScale;
uniform float uGrainAmount;
/** Seconds, for the ripple over the bars. */
uniform float uTime;

// Optics, shared. Figma's 0–100 values arrive as 0–1.
uniform float uDepth;
uniform float uRefraction;
uniform float uDispersion;
uniform float uSplay;
/** Toward the light, y up. */
uniform vec2 uLightDir;
uniform float uLight;
uniform float uInnerShadow;

uniform int uPaneCount;
/** Centre, half-size. */
uniform vec4 uPaneBox[MAX_PANES];
uniform float uPaneRadius[MAX_PANES];
/** Frosted disc: centre, radius (0 for none). */
uniform vec3 uPaneFrost[MAX_PANES];
/** See-through, fill, rim, rim width (CSS px). */
uniform vec4 uPaneLook[MAX_PANES];
/** The disc's see-through and fill. */
uniform vec2 uPaneFrostLook[MAX_PANES];

/** 0 for no bars. */
uniform int uBarsCount;
uniform vec2 uBarsCenter;
/** Device pixels per scene unit (the box spans y from -1 to 1). */
uniform float uBarsUnit;
/** Scene units: pitch, half-width, full half-height, melt. */
uniform vec4 uBarsShape;
/** A resting bar's half-height, scene units. */
uniform float uBarsRest;
/** Gather (0–1), voice energy (0–1). */
uniform vec2 uBarsMotion;
/** Each bar's centre across, scene units, before gathering. */
uniform float uBarsX[MAX_BARS];
uniform float uBarsHeights[MAX_BARS];
/** A light inside the bars: position and strength. */
uniform vec3 uBarsLight;
/** See-through, fill, rim, rim width (CSS px). */
uniform vec4 uBarsLook;

out vec4 fragColor;

// figma_glass's calibration, retuned: its glow filled the bevel and read as
// a bubble, so here it's a narrow sheen and a brighter rim.
const float GLOW_GAIN = 0.65;
/** Width of the sheen, as a fraction of the bevel. */
const float SHEEN = 0.35;
const float RIM_GAIN = 0.85;
const float OPPOSITE_PEAK = 0.85;
const float DARK_FLOOR = 0.04;
/** Inset shadow, cast down-right (CSS px, y down). */
const vec2 SHADOW_OFFSET = vec2(3.0, 3.0);
const float SHADOW_BLUR = 12.0;

// The bars' outline.
/** Corner radius as a fraction of the half-width. */
const float CORNER = 0.6;
/** Caps the corner, as a fraction of the half-width. */
const float DEPTH = 0.72;
/** Melt between resting neighbours, against moving ones (1). */
const float REST_MELT = 0.7;
/** Half-height of the band along the centre line where bars melt. */
const float SEAM = 0.2;
/** Melt left above and below the seam; low keeps each bar distinct. */
const float TIP_MELT = 0.22;
/** Melt left once gathered; each overlap swells the glob. */
const float GATHER_MELT = 0.45;
/** Gathered bars stop this far short of the centre, bunching into a glob. */
const float GATHER_SPREAD = 0.1;
/** Gathered bars swell by this much, holding their combined mass. */
const float GATHER_SWELL = 0.6;
/** Spread of the light inside the bars, scene units. */
const float BARS_LIGHT_RADIUS = 0.38;
const float BARS_LIGHT = 0.7;

vec3 overlay(vec3 base, vec3 blend) {
  vec3 low = 2.0 * base * blend;
  vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
  return mix(low, high, step(0.5, base));
}

float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float grainAt(vec2 p) {
  return texture(uGrain, p * uWeaveScale / vec2(textureSize(uGrain, 0))).r;
}

/** The background with its grain. */
vec3 bare(vec2 p) {
  vec3 base = texture(uScene, p / uResolution).rgb;
  return mix(base, overlay(base, vec3(grainAt(p))), uGrainAmount);
}

/** Light across a pane: a peak facing it, a smaller one opposite, dim between. */
float lightAcross(vec2 local, vec2 halfSize) {
  float reach = halfSize.x * abs(uLightDir.x) + halfSize.y * abs(uLightDir.y);
  float s = 0.5 - dot(local, uLightDir) / (2.0 * max(reach, 1.0));
  if (s < 0.4) return mix(1.0, DARK_FLOOR, s / 0.4);
  if (s < 0.6) return DARK_FLOOR;
  return mix(DARK_FLOOR, OPPOSITE_PEAK, (s - 0.6) / 0.4);
}

/**
 * Glass over \`under\` at p. d: signed distance to the edge (negative
 * inside); n: outward normal; shadowEdge: distance to the shape moved by
 * the shadow offset; local, halfSize: p within the pane the light spreads
 * across; look: see-through, fill, rim, rim width.
 */
vec3 glassOver(
  vec3 under, vec2 p, float d, vec2 n, float shadowEdge,
  vec2 local, vec2 halfSize, vec4 look
) {
  float inside = -d;

  // Refraction: 1 at the edge, 0 at the bevel's depth.
  float bevel = max(min(uDepth * uPixelRatio, min(halfSize.x, halfSize.y)), 1.0);
  float t = clamp(1.0 - inside / bevel, 0.0, 1.0);
  float lens = pow(t, mix(2.0, 1.0, uSplay));
  float shift = lens * bevel * uRefraction * 0.6;
  // Dispersion splits the gradient only: split, the pixel-fine weave
  // scatters into rainbow speckle.
  float disp = uDispersion * 0.25;
  vec2 bent = p - n * shift;
  vec3 base = vec3(
    texture(uScene, (p - n * shift * (1.0 - disp)) / uResolution).r,
    texture(uScene, bent / uResolution).g,
    texture(uScene, (p - n * shift * (1.0 + disp)) / uResolution).b
  );
  // Faded toward the weave's own mean (its top mip); mid-grey lightens it.
  float weaveMean = textureLod(uGrain, vec2(0.5), 16.0).r;
  float seen = weaveMean + (grainAt(bent) - weaveMean) * look.x;
  vec3 glass = mix(base, overlay(base, vec3(seen)), uGrainAmount);

  glass = mix(glass, vec3(1.0), look.y);

  float blur = SHADOW_BLUR * uPixelRatio;
  glass *= 1.0 - uInnerShadow * smoothstep(-blur, blur, shadowEdge);

  float band = 1.0 - smoothstep(0.0, bevel * SHEEN, inside);
  float glow = band * lightAcross(local, halfSize) * 0.45 * GLOW_GAIN * uLight;
  glass = mix(glass, overlay(glass, vec3(1.0)), clamp(glow, 0.0, 1.0));

  float facing = dot(n, uLightDir);
  float lit = DARK_FLOOR + (1.0 - DARK_FLOOR) * pow(abs(facing), 1.2)
    * (facing >= 0.0 ? 1.0 : OPPOSITE_PEAK);
  float rimWidth = look.w * uPixelRatio;
  float hairline = smoothstep(-0.5, 0.5, inside)
    * (1.0 - smoothstep(rimWidth - 0.5, rimWidth + 0.5, inside));
  glass = mix(glass, vec3(1.0), clamp(0.9 * RIM_GAIN * look.z * uLight * lit * hairline, 0.0, 1.0));

  return mix(under, glass, 1.0 - smoothstep(-0.5, 0.5, d));
}

float barsSpread() {
  return 1.0 - uBarsMotion.x * (1.0 - GATHER_SPREAD);
}

float barX(int i) {
  return uBarsX[i] * barsSpread();
}

/** A bar's half-size at a height, scene units. */
vec2 barHalf(float h) {
  float swell = 1.0 + GATHER_SWELL * uBarsMotion.x;
  float r = uBarsShape.y * swell;
  float rest = max(uBarsRest * swell, r);
  return vec2(r, rest + clamp(h, 0.0, 1.0) * (uBarsShape.z - rest));
}

/** Distance to the bars' outline, scene units: melted slabs with a ripple. */
float barsMap(vec2 q) {
  float k = uBarsShape.w * mix(1.0, TIP_MELT, smoothstep(0.0, SEAM, abs(q.y)))
    * mix(1.0, GATHER_MELT, uBarsMotion.x);
  float d = 1e5;
  float prev = 0.0;
  for (int i = 0; i < MAX_BARS; i++) {
    if (i >= uBarsCount) break;
    float h = uBarsHeights[i];
    vec2 halfSize = barHalf(h);
    float corner = min(halfSize.x * mix(CORNER, 1.0, uBarsMotion.x), halfSize.x * DEPTH);
    float bar = roundedBox(q - vec2(barX(i), 0.0), halfSize, corner);
    float melt = mix(REST_MELT, 1.0, smoothstep(0.0, 0.3, max(prev, h)));
    d = smin(d, bar, max(k * melt, 1e-4));
    prev = h;
  }
  float ripple = sin(q.y * 7.0 - uTime * 2.1 + q.x * 3.0)
    * sin(q.x * 5.0 + q.y * 2.0 + uTime * 1.3);
  return d + ripple * uBarsShape.y * (0.025 + 0.06 * uBarsMotion.y);
}

float barsDistance(vec2 p) {
  return barsMap((p - uBarsCenter) / uBarsUnit) * uBarsUnit;
}

vec3 drawPane(vec3 col, vec2 p, int i, vec2 shadowShift) {
  vec2 halfSize = uPaneBox[i].zw;
  vec2 local = p - uPaneBox[i].xy;
  float radius = min(uPaneRadius[i], min(halfSize.x, halfSize.y));
  float d = roundedBox(local, halfSize, radius);
  if (d >= 1.0) return col;
  vec2 g = vec2(
    roundedBox(local + vec2(1.0, 0.0), halfSize, radius)
      - roundedBox(local - vec2(1.0, 0.0), halfSize, radius),
    roundedBox(local + vec2(0.0, 1.0), halfSize, radius)
      - roundedBox(local - vec2(0.0, 1.0), halfSize, radius)
  );
  vec2 n = g / max(length(g), 1e-5);
  float shadowEdge = roundedBox(local - shadowShift, halfSize, radius);
  vec3 disc = uPaneFrost[i];
  float frost = step(0.5, disc.z)
    * (1.0 - smoothstep(-0.5, 0.5, length(p - disc.xy) - disc.z));
  vec4 look = uPaneLook[i];
  look.xy = mix(look.xy, uPaneFrostLook[i], frost);
  return glassOver(col, p, d, n, shadowEdge, local, halfSize, look);
}

vec3 drawBars(vec3 col, vec2 p, vec2 shadowShift) {
  vec2 q = (p - uBarsCenter) / uBarsUnit;
  float reachX = 0.5 * float(uBarsCount - 1) * uBarsShape.x * barsSpread()
    + uBarsShape.y * (1.0 + GATHER_SWELL) + uBarsShape.w;
  float reachY = uBarsShape.z + uBarsShape.w;
  if (abs(q.x) >= reachX || abs(q.y) >= reachY) return col;
  float d = barsDistance(p);
  if (d >= 1.0) return col;
  vec2 g = vec2(
    barsDistance(p + vec2(1.0, 0.0)) - barsDistance(p - vec2(1.0, 0.0)),
    barsDistance(p + vec2(0.0, 1.0)) - barsDistance(p - vec2(0.0, 1.0))
  );
  vec2 n = g / max(length(g), 1e-5);
  float shadowEdge = barsDistance(p - shadowShift);
  // The light spreads across the nearest bar, as across a pane.
  int nearest = 0;
  float nearestGap = 1e9;
  for (int i = 0; i < MAX_BARS; i++) {
    if (i >= uBarsCount) break;
    float gap = abs(q.x - barX(i));
    if (gap < nearestGap) {
      nearestGap = gap;
      nearest = i;
    }
  }
  vec2 halfSize = barHalf(uBarsHeights[nearest]) * uBarsUnit;
  vec2 local = p - uBarsCenter - vec2(barX(nearest) * uBarsUnit, 0.0);
  vec4 look = uBarsLook;
  // The rim burns brighter with the voice.
  look.z *= mix(0.8, 1.3, smoothstep(0.05, 0.3, uBarsMotion.y));
  col = glassOver(col, p, d, n, shadowEdge, local, halfSize, look);

  // The bars' own light (pointer, thinking ripple, connecting pulse).
  vec2 toLight = (p - uBarsLight.xy) / (BARS_LIGHT_RADIUS * uBarsUnit);
  float shine = uBarsLight.z * exp(-dot(toLight, toLight))
    * (1.0 - smoothstep(-0.5, 0.5, d));
  return mix(col, overlay(col, vec3(1.0)), clamp(shine * BARS_LIGHT, 0.0, 1.0));
}

void main() {
  vec2 p = gl_FragCoord.xy;
  vec3 col = bare(p);
  vec2 shadowShift = SHADOW_OFFSET * vec2(1.0, -1.0) * uPixelRatio;
  for (int i = 0; i < MAX_PANES; i++) {
    if (i >= uPaneCount) break;
    col = drawPane(col, p, i, shadowShift);
  }
  if (uBarsCount > 0) col = drawBars(col, p, shadowShift);
  fragColor = vec4(col, 1.0);
}
`
