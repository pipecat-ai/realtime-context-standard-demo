// The avatar runtime's public API: plays a creator export (character.svg, rig.json, face.json, animation.json) in a web
// page. It idles, blinks and glances, holds an expression and plays reactions over it, and moves the mouth with speech
// from a recorded clip or a live pipecat-visemes bot.
//
//   import { loadAvatar, mountAvatar, recordingSource, parseRecording, createLipsync } from "./avatar-runtime.js";
//   const player = mountAvatar(element, await loadAvatar("/avatar/"), { clip: "bottom", expression: "happy" });
//   player.start();
//   player.setSpeech(recordingSource(audio, parseRecording(await (await fetch("/clips/x.lipsync.json")).json())));
//   player.setExpression("thinking");
//   await player.react("laugh");
//
// Written by hand; the creator checks it against the code (src/runtime/public.typetest.ts).

/* ============================================================================ geometry */

/** A point or a vector, px. */
export type Vec = [number, number];
/** [x0, y0, x1, y1]. */
export type Box = [number, number, number, number];
/** An SVG matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];

/* ============================================================================ speech */

/** The rig's mouth controls, each 0–1. Rest: openness 0, width 0.5, rounding 0, energy 0. */
export interface Articulation {
  openness: number;
  width: number;
  rounding: number;
  energy: number;
}

export type LipsyncEventKind = "closure" | "nasal" | "silence";

/** One analyzer event, offset and duration in seconds of its utterance. */
export interface LipsyncEvent {
  offset: number;
  kind: LipsyncEventKind;
  duration: number;
  confidence: number;
}

/** One sample of speech on the wire's scale (rest openness 0.15, width 0.35, rounding 0.35). */
export interface SpeechSample {
  openness: number;
  width: number;
  rounding: number;
  energy: number;
  pitch: number;
  confidence: number;
  /** A keyframe is being played (not a hold or release). */
  live: boolean;
  /** The utterance holds the mouth, through pauses between words. */
  speaking: boolean;
  /** Keep the lips shut through a resolved silence or a pause or cut release. */
  sealed?: boolean;
  /** The source's own release to rest. */
  release?: { from: Pick<SpeechSample, "openness" | "width" | "rounding">; amount: number };
  /** Seconds into the current utterance, or null between utterances. */
  relTime: number | null;
  /** The events active at this moment. */
  events: LipsyncEvent[];
  /**
   * realtime-context-standard-demo: the speech's own acting, which the creator's export lacks (scripts/use-avatar.sh
   * applies it). `pose` is added to the frame's pose, its head, brows and eyes scaled by the motion (none with reduced
   * motion); `relax` (0–1) eases the expression's smile and smirk towards rest; `attend` holds the gaze on the viewer,
   * as speaking does, while listening.
   */
  gesture?: { pose?: Partial<Pose>; relax?: number; attend?: boolean };
}

/** Where a player's speech comes from. `sample` never returns null: with nothing to say it reports rest, not speaking. */
export interface SpeechSource {
  /** `nowMs` is wall time (performance.now()). */
  sample(nowMs: number): SpeechSample;
  /** Forget everything in flight (a disconnect, a new clip). */
  reset(): void;
  dispose?(): void;
}

/** A bot-tts-lipsync batch (the RTVI server message's data). */
export interface LipsyncBatch {
  ctx: string;
  t0: number;
  ws: number;
  lead: number;
  keyframes: { offset: number; openness: number; width: number; rounding: number; energy: number; pitch: number; confidence: number }[];
  events: LipsyncEvent[];
}

/** A recorded clip's lipsync (`<name>.lipsync.json`, nemo-avatar-lipsync v1), as parseRecording reads it. */
export interface SpeechRecording {
  format: "nemo-avatar-lipsync";
  version: 1;
  duration: number;
  sampleRate: number;
  batches: LipsyncBatch[];
  keyframes: LipsyncBatch["keyframes"];
  events: LipsyncEvent[];
}

/** What a recording source reads from its <audio> element (an HTMLAudioElement is one). */
export interface AudioClock {
  readonly currentTime: number;
  readonly paused: boolean;
  readonly ended: boolean;
}

/** The PipecatClient callbacks a live source needs: spread them into the client's callbacks. */
export interface LipsyncCallbacks {
  onServerMessage(data: unknown): void;
  onUserStartedSpeaking(): void;
  onUserStoppedSpeaking(): void;
  onBotStoppedSpeaking(): void;
  onDisconnected(): void;
}

/** Parse a `<name>.lipsync.json` (throws when it is not one). */
export declare function parseRecording(value: unknown): SpeechRecording;
/** A source over an <audio> element playing `recording`; `trimMs` is the A/V trim. */
export declare function recordingSource(audio: AudioClock, recording: SpeechRecording, options?: { trimMs?: number }): SpeechSource;
/** A live source over pipecat-visemes batches: spread `callbacks` into PipecatClient's, give `source` to the player. */
export declare function createLipsync(options?: { trimMs?: number; now?: () => number }): { callbacks: LipsyncCallbacks; source: SpeechSource };

/* ============================================================================ the bundle's rig (rig.json, face.json v2) */

/** What moves the layers: rig.json (v2) is one. */
export interface RigInput {
  /** The head width / 200: the studio's acting units. */
  actingScale: number;
  anchors: Record<string, Vec>;
  /** `cutBy`: the key of the layer (a hat's) whose motion this layer's cut rides; its clip's path is `[data-cr-cut]`. */
  layers: readonly { key: string; kind: string; follows: "head" | "body" | "none"; pivot: Vec; bounds: Box | null; cutBy?: string }[];
}

/** A rigged layer's frame: its `[data-cr-frame]` group's matrix (local → canvas). */
export interface RigFrame {
  /** The layer's data-cr-key. */
  layer: string;
  frame: Affine;
}

/** An eye: what the blink squashes and the glance moves, in its frame's local px. */
export interface EyeRigSpec extends RigFrame {
  side: "left" | "right";
  kind: "round" | "mass";
  shine?: RigFrame;
  corners: [Vec, Vec];
  iris: { at: Vec; r: number };
  lid: { d: string; width: number; paint: string };
  travel: Vec;
  squash: string[];
  move: string[];
}

export type MouthType = "line" | "lips" | "jaw";

/** The mouth's rest shape, fitted to the drawn seam (local px). */
export interface MouthRest {
  cx: number;
  halfWidth: number;
  leftY: number;
  rightY: number;
  middleY: number;
  leftHandle: number;
  rightHandle: number;
}

/** The mouth: its type, rest shape and engine numbers, in its frame's local px. */
export interface MouthRigSpec extends RigFrame {
  type: MouthType;
  rest: MouthRest;
  fitError: number;
  params: { open: number; teeth: boolean; tongue: boolean; drop: number; foreshorten: number };
  lipWidth: number;
  lipShadow?: { top: number; clearance: number };
  hinge?: Vec;
  paint: { line: string; cavity: string; teeth: string; tongue: string; tongueDeep: string };
  hideWhileOpen: string[];
}

/** A brow: it lifts and turns about its centre, in its frame's local px. */
export interface BrowRigSpec extends RigFrame {
  side: "left" | "right";
  centre: Vec;
  inner: Vec;
  outer: Vec;
}

/** The head, for the effects: the face a shade paints and where a shade is drawn. Canvas px at rest. */
export interface HeadRigSpec {
  /** The head's layer (its data-cr-key). */
  layer: string;
  /** The head's skin, path data in canvas px: a shade is clipped to it. */
  face: string[];
  /** Each band, back to front, and the first layer drawn after it (or null): a shade over a band is drawn before it. */
  after: Record<string, string | null>;
}

/** face.json's `rig`: what the runtime animates. */
export interface FaceRig {
  eyes: EyeRigSpec[];
  mouth: MouthRigSpec | null;
  /** The brows (face.json before brows has none, and its brows stay still). */
  brows: BrowRigSpec[];
  /** The head the shades paint (face.json before effects has none, and draws no shades). */
  head?: HeadRigSpec;
}

/** rig.json v2 (the fields the runtime and most hosts read). */
export interface RigJson extends RigInput {
  format: "creator-rig";
  version: 2;
  name: string;
  canvas: { width: number; height: number; viewBox: Box; framing: string };
  look: {
    outline: { on: boolean; width: number; color: string; filter: string; sigmaPerWidth: number };
    overlay: { color: string; back: number };
  };
  layers: {
    key: string;
    name: string;
    attr: "data-rig-layer" | "data-rig-feature";
    kind: string;
    band: string;
    order: number;
    follows: "head" | "body" | "none";
    pivot: Vec;
    bounds: Box | null;
    file: string | null;
    subRoles: string[];
    cutBy?: string;
  }[];
}

/** face.json v2 (the fields the runtime and most hosts read). */
export interface FaceJson {
  format: "creator-face";
  version: 2;
  features: { layer: string; layers: string[]; rigRole: string; side?: "left" | "right"; subRoles: string[] }[];
  rig: FaceRig;
}

/* ============================================================================ expressions and reactions (animation.json) */

/** The face and body's acting values (a head 200 units wide; the rig scales them to the character). Left and right are
 * the viewer's. Rest: every field 0 but eyeLeft, eyeRight and smile, which are 1. */
export interface Pose {
  headAngle: number;
  headX: number;
  headY: number;
  chest: number;
  browLeft: number;
  browRight: number;
  browAngleLeft: number;
  browAngleRight: number;
  eyeLeft: number;
  eyeRight: number;
  eyeSmile: number;
  gazeX: number;
  gazeY: number;
  smile: number;
  smirk: number;
  cheek: number;
  restOpen: number;
}
export type PoseKey = keyof Pose;

/** The body and secondary channels a reaction's motion tracks drive. */
export type ReactionMotionKey = "headAngle" | "headX" | "headY" | "chest" | "hair" | "rearHair" | "scarf" | "scarfBounce";

/** An expression's idle: a cycle of looks and gestures, and the breathing, sway and tempo they ride on. */
export interface IdleProfile {
  cycle: number;
  breathing: number;
  sway: number;
  tempo: number;
  looks: { at: number; hold: number; x: number; y: number; tilt?: number; chin?: number }[];
  gestures: { at: number; duration: number; angle?: number; y?: number; chest?: number }[];
}

/** Where an expression or a reaction came from: built in, or a prompt in the creator. */
export type AnimationSource = { kind: "builtin" } | { kind: "prompt"; prompt: string; model?: string; createdAt?: string };

/** A held mood: its pose (the fields that differ from rest) and its idle. */
export interface ExpressionDef {
  id: string;
  name: string;
  gloss: string;
  /** A lucide icon name. */
  icon: string;
  pose: Partial<Pose>;
  idle: IdleProfile;
  /** The effects it plays (ids of the library's effects): a burst as it begins, a shade while it lasts. */
  effects?: string[];
  source?: AnimationSource;
}

/** amount × sin²(π (t − at) / for) while at < t < at + for (seconds). */
export interface Pulse {
  at: number;
  for: number;
  amount: number;
}

/** A short performance over the expression: a weight that rises over `enter` s, holds, and falls from `release` to
 * `duration` s; the pose it holds under that weight; and pulses on pose fields and motion channels. */
export interface ReactionDef {
  format?: "creator-reaction";
  version?: 1;
  id: string;
  name: string;
  gloss: string;
  /** A lucide icon name. */
  icon: string;
  duration: number;
  enter: number;
  release: number;
  pose: Partial<Pose>;
  tracks: { pose?: Partial<Record<PoseKey, Pulse[]>>; motion?: Partial<Record<ReactionMotionKey, Pulse[]>> };
  /** It startles accessories. */
  startle?: boolean;
  /** The effects it plays (ids of the library's effects): a burst from its start, a shade under its weight. */
  effects?: string[];
  source?: AnimationSource;
}

/** animation.json's expressions (neutral first) and reactions, as the player plays them, and their effects. */
export interface AnimationLibrary {
  expressions: ExpressionDef[];
  reactions: ReactionDef[];
  /** The effects the entries name (animation.json before effects has none). */
  effects?: EffectDef[];
  /** The glyphs bursts' particles name by id. */
  glyphs?: GlyphDef[];
}

/** A reaction as a frame shows it. */
export interface ReactionState {
  id: string;
  /** Seconds since it started (on the idle clock: a hold pauses it). */
  age: number;
  /** 0–1: it rises, holds and falls. */
  weight: number;
  /** The accessories' startle, 0 unless the reaction startles. */
  startle: number;
}

/* ============================================================================ effects (animation.json) */

/** A glyph's paint: a colour (#rrggbb), or "particle" for the colour of the particle carrying it. Effect units: about the
 * eyes' midpoint, y down, actingScale × 2.75 / 2.15 canvas px a unit. */
export type EffectPaint = string | "particle";

/** A small shape a burst's particles carry, in effect units about its own origin. */
export interface GlyphDef {
  id?: string;
  /** Painted in order; strokes have round caps and joins; `width` in effect units. */
  paths: { d: string; fill?: EffectPaint; stroke?: EffectPaint; width?: number }[];
  /** The width of the trail it leaves, in the particle's colour; 0: none. */
  wake: number;
  /** Its strokes draw on over the first quarter of its flight. */
  draw?: boolean;
  /** It fades in as it grows (default true). */
  fade?: boolean;
}

/** One particle of a burst: a glyph thrown from `at` on a ballistic path, turning as it goes. Effect units. */
export interface Particle {
  glyph: string | GlyphDef;
  color: string;
  at: Vec;
  velocity: Vec;
  gravity?: number;
  spin?: number;
  delay?: number;
  size?: number;
}

/** Particles thrown out once, as the expression or reaction naming it begins. */
export interface BurstDef {
  duration: number;
  particles: Particle[];
}

/** A shade's paint over the face: a colour, or a linear gradient between two points (effect units). */
export type ShadeFill =
  | { color: string; opacity?: number }
  | { from: Vec; to: Vec; stops: { at: number; color: string; opacity?: number }[] };

/** Paint and lines over the face, held while the expression or reaction naming it lasts. */
export interface ShadeDef {
  /** Time constants (s) it rises and falls with. */
  enter: number;
  exit: number;
  /** The band it is drawn over. */
  over: string;
  fill?: ShadeFill;
  lines?: { d: string; color: string; width: number; opacity?: number }[];
}

/** One effect: a burst or a shade. */
export interface EffectDef {
  id: string;
  name: string;
  gloss: string;
  burst?: BurstDef;
  shade?: ShadeDef;
}

/** An effect as a frame shows it: a burst `age` s in (thrown with the motion as its strength), or a shade at `level`. */
export type EffectState =
  | { id: string; kind: "burst"; age: number; strength: number }
  | { id: string; kind: "shade"; level: number };

/* ============================================================================ the player */

/** What setLook changes; anything left out keeps its value. */
export interface AvatarLook {
  /** true or false switches the outline; an object sets any of on, width (canvas px) and colour. */
  outline?: boolean | { on?: boolean; width?: number; color?: string };
  /** The depth grade: its colour, the back layer's strength (0–1) and single layers' (by rig.json name or key). */
  overlay?: { color?: string; back?: number; layers?: Record<string, number> };
}

/** rig.json's `look`: where setLook starts. */
export interface LookBase {
  outline?: { on?: boolean; width?: number; color?: string; sigmaPerWidth?: number };
  overlay?: { color?: string; back?: number };
}

export interface PlayerOptions {
  /** Idle motion, 0 (still) to 1.5; 1 by default. Speech moves the mouth at any value. */
  motion?: number;
  /** Reduced motion on or off; by default the page's prefers-reduced-motion (the speaking mouth still moves). */
  reducedMotion?: boolean;
  /** The prefix of the generated clips' and gradient's ids (default: a fresh one per player). */
  idPrefix?: string;
  /** rig.json's `look`. */
  look?: LookBase;
  /** The expressions and reactions it can play (loadAvatar's `animation`); without it, neutral alone and no reactions. */
  animation?: AnimationLibrary;
  /** The expression it starts in, with no spring (default "neutral"; one the library lacks plays neutral). */
  expression?: string;
}

/** What the last frame drew, for a status line. */
export interface PlayerFrame {
  /** The pose shown: the expression's (sprung towards a new one), with the reaction over it. */
  pose: Pose;
  /** The reaction under way, or null. */
  reaction: ReactionState | null;
  /** The effects playing. */
  effects: EffectState[];
}

export interface AvatarPlayer {
  /** The svg the player writes into. */
  readonly svg: SVGSVGElement;
  /** The loop is running. */
  readonly running: boolean;
  /** Run the loop (requestAnimationFrame). */
  start(): void;
  /** Stop the loop and remove every write; the idle clock keeps its place for the next start. */
  stop(): void;
  /** Stop for good; a mounted player also takes its svg out of the page. */
  destroy(): void;
  /** Ease the eyes open, the glance to centre and the idle to rest (and back when false); speech keeps the mouth. */
  hold(on: boolean): void;
  /** Idle motion, 0–1.5. */
  setMotion(amount: number): void;
  /** Where speech comes from, or null for none. */
  setSpeech(source: SpeechSource | null): void;
  /** The look's attribute writes: the outline and the overlay. */
  setLook(look: AvatarLook): void;
  /** Find every element again after a host re-rendered the svg. */
  rebind(): void;
  /** Draw one frame at `nowMs` (performance.now() time; default now), for a host with its own loop. */
  tick(nowMs?: number): void;
  /** The expressions it can play, neutral first (from the bundle's animation.json; neutral alone without one). */
  readonly expressions: readonly ExpressionDef[];
  /** The reactions it can play (none without an animation.json). */
  readonly reactions: readonly ReactionDef[];
  /** The expression it holds (an id of `expressions`). */
  readonly expression: string;
  /** Hold an expression: the face springs to its pose and the idle takes its manner. An id it lacks plays neutral. */
  setExpression(id: string): void;
  /** Play a reaction over the expression, as frames are drawn (start(), or tick()). Resolves when it ends, when another
   * replaces it, or when the player stops; rejects, playing nothing, for an id `reactions` lacks. */
  react(id: string): Promise<void>;
  /** What the last frame drew (the pose and the reaction under way), or null before the first. */
  readonly frame: PlayerFrame | null;
}

export type AvatarClip = "bottom" | "canvas" | "none";

export interface MountOptions extends Omit<PlayerOptions, "idPrefix" | "look" | "animation"> {
  /** Where the character is cut: "bottom" (default: hair and hats may pass the top and sides), "canvas" or "none". */
  clip?: AvatarClip;
  /** false removes the outline's filter (it re-rasterises every frame); setLook can bring it back. */
  outline?: boolean;
}

/** What mountAvatar needs: character.svg's text, rig.json and face.json (v2), and the expressions and reactions. */
export interface Avatar {
  svg: string;
  rig: RigInput & { look?: LookBase };
  face: { rig: FaceRig };
  animation?: AnimationLibrary;
}

/** A bundle as loadAvatar reads it. */
export interface LoadedAvatar extends Avatar {
  /** The folder URL it came from. */
  base: string;
  rig: RigJson;
  face: FaceJson;
  /** animation.json's expressions and reactions; absent when the bundle has none (an export from before expressions). */
  animation?: AnimationLibrary;
}

/**
 * Fetch character.svg, rig.json and face.json from the folder at `base`, and animation.json when it is there (a reply
 * that is not ok, or an html page, means none); throws unless rig.json and face.json are version 2 and animation.json,
 * when there, is version 1.
 */
export declare function loadAvatar(base: string | URL, options?: { fetch?: typeof fetch; init?: RequestInit }): Promise<LoadedAvatar>;
/** Inline `avatar` into `element` (ids re-scoped, sized to fit, clipped) and return its player, not started. */
export declare function mountAvatar(element: Element, avatar: Avatar, options?: MountOptions): AvatarPlayer;
/** A player over an svg already in the page with its ids as they are. */
export declare function createPlayer(svg: SVGSVGElement, rig: RigInput, face: FaceRig, options?: PlayerOptions): AvatarPlayer;
