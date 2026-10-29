import type {
  Articulation,
  LipsyncEvent,
  SpeechSample,
  SpeechSource,
} from "@/avatar-runtime/avatar-runtime.js"

/**
 * Shapes Sam's mouth from the bot's lipsync analysis and the phones of its
 * words. Read frame by frame, the analysis swings from shut to wide open at
 * every syllable, rounds on every "m", and gapes through pauses: it hears how
 * open and loud the voice is, but not which sound it is. So the mouth opens
 * with the voice's loudness, in a speaking range; the phones say where the
 * lips meet, round and spread, timed against the analysis's closures; and
 * every control is smoothed around the moment shown, which the batches and
 * phones arrive far enough ahead of to allow. While she talks, her lips draw
 * in from their rest and purse a little, so she talks with a mouth, not a
 * flap the width of her smile.
 */

/** One analyzer keyframe: seconds into its utterance, and the wire's 0–1 controls. */
export interface Keyframe {
  offset: number
  openness: number
  width: number
  rounding: number
  energy: number
  /** Within the voice's range so far, 0–1; 0 unvoiced. */
  pitch: number
}

/** A phone of a spoken word (server/avatar/phones.py): seconds into its utterance. */
export interface Phone {
  start: number
  duration: number
  phone: string
}

/** An utterance's analysis and phones so far, each in offset order. */
export interface SpeechTrack {
  keyframes: readonly Keyframe[]
  events: readonly LipsyncEvent[]
  phones: readonly Phone[]
}

/**
 * The shaping, tuned on Sam's voice (ElevenLabs River) against the timing of
 * its words: rig units for the mouth, the wire's 0–1 for the analysis.
 */
const MOUTH = {
  /** Energy below `quiet` closes the mouth; from `loud` it opens fully. */
  quiet: 0.2,
  loud: 0.8,
  /** The analyzer's openness, as vowel height: `low` is a close vowel, `high` an open one. */
  low: 0.15,
  high: 0.8,
  /** How much of the opening the vowel's height decides; loudness decides the rest. */
  heightShare: 0.55,
  /** How much of that height the phones decide, where there are phones. */
  phoneShare: 0.6,
  /** The rig openness of a loud, open vowel: about two-fifths as tall as the mouth is wide. */
  maxOpen: 0.5,
  /** The lips' width at rest, and talking between vowels: drawn in and a little pursed. */
  restWidth: 0.47,
  talkWidth: 0.44,
  talkRound: 0.2,
  /** Without phones: the analyzer's rounding and width that start and complete a shape. */
  roundFrom: 0.45,
  roundTo: 0.9,
  maxRound: 0.5,
  spreadFrom: 0.5,
  spreadTo: 0.95,
  maxWidth: 0.6,
  /** Gaussian smoothing, seconds: the opening follows syllables, shapes the vowel. */
  openSigma: 0.022,
  shapeSigma: 0.05,
  /** Talking is the voice over this σ, from `talkFrom` to `talkTo`: it holds through words, not pauses. */
  talkSigma: 0.1,
  talkFrom: 0.1,
  talkTo: 0.4,
  /** Lips take at most this long to close before a closure, and to part after it. */
  closeLead: 0.07,
  closeRelease: 0.06,
  /** The shortest time lips that meet stay shut, seconds. */
  closeHold: 0.05,
  /** How far a closure the phones don't explain (a "t", "k") draws the lips together. */
  stopDepth: 0.5,
  /** A bilabial phone takes the analysis's closure or nasal this near it, seconds. */
  snap: 0.08,
  /** Output smoothing time constants, seconds: while speaking, and to rest. */
  follow: 0.018,
  rest: 0.06,
}

type MouthParams = typeof MOUTH

/** A phone's mouth: its share of the opening, its rig width and rounding, and how much it shapes the lips. */
interface Viseme {
  open: number
  width: number
  round: number
  weight: number
}

const vowel = (open: number, width: number, round = 0): Viseme => ({
  open,
  width,
  round,
  weight: 1,
})
const consonant = (
  open: number,
  width = MOUTH.talkWidth,
  round = MOUTH.talkRound,
  weight = 0.25
): Viseme => ({
  open,
  width,
  round,
  weight,
})

/**
 * ARPAbet without stress. Rounding draws the corners in and lifts the upper
 * lip, so the open vowels keep some: an oval rather than a slot. Consonants
 * weigh little: they take the lips of the vowels around them.
 */
const VISEMES: Record<string, Viseme> = {
  AA: vowel(1, 0.44, 0.24),
  AH: vowel(0.8, 0.43, 0.26),
  AE: vowel(0.9, 0.47, 0.2),
  AW: vowel(0.95, 0.42, 0.3),
  AY: vowel(0.95, 0.46, 0.22),
  AO: vowel(0.85, 0.41, 0.36),
  EH: vowel(0.75, 0.47, 0.18),
  EY: vowel(0.6, 0.52, 0.14),
  IH: vowel(0.5, 0.52, 0.14),
  IY: vowel(0.35, 0.62, 0.06),
  ER: vowel(0.45, 0.42, 0.32),
  OW: vowel(0.7, 0.4, 0.44),
  OY: vowel(0.75, 0.41, 0.38),
  UH: vowel(0.5, 0.4, 0.42),
  UW: vowel(0.4, 0.38, 0.54),
  W: consonant(0.25, 0.36, 0.6, 1),
  R: consonant(0.35, 0.42, 0.34, 0.6),
  Y: consonant(0.3, 0.54, 0.1, 0.6),
  F: consonant(0.12, 0.48, 0.1, 0.8),
  V: consonant(0.12, 0.48, 0.1, 0.8),
  SH: consonant(0.3, 0.4, 0.42, 0.7),
  ZH: consonant(0.3, 0.4, 0.42, 0.7),
  CH: consonant(0.3, 0.4, 0.42, 0.7),
  JH: consonant(0.3, 0.4, 0.42, 0.7),
  S: consonant(0.2, 0.5, 0.1),
  Z: consonant(0.2, 0.5, 0.1),
  P: consonant(0, MOUTH.talkWidth, MOUTH.talkRound, 0.5),
  B: consonant(0, MOUTH.talkWidth, MOUTH.talkRound, 0.5),
  M: consonant(0, MOUTH.talkWidth, MOUTH.talkRound, 0.5),
}
const OTHER_CONSONANT = consonant(0.35)
const BILABIALS = new Set(["P", "B", "M"])

const REST: Articulation = { openness: 0, width: 0.5, rounding: 0, energy: 0 }

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value))
const smooth = (value: number) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}
const ramp = (from: number, to: number, value: number) =>
  smooth((value - from) / (to - from))

/** The keyframes at `offset`, linearly between them; outside them, silence. */
function keyframeAt(keyframes: readonly Keyframe[], offset: number): Keyframe {
  const first = keyframes[0]
  const last = keyframes.at(-1)
  if (!first || !last || offset < first.offset || offset > last.offset) {
    return {
      offset,
      openness: 0,
      width: 0.35,
      rounding: 0.35,
      energy: 0,
      pitch: 0,
    }
  }
  let lo = 0
  let hi = keyframes.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if ((keyframes[mid]?.offset ?? 0) <= offset) lo = mid
    else hi = mid
  }
  const a = keyframes[lo] ?? first
  const b = keyframes[hi] ?? last
  const t =
    b.offset > a.offset ? (offset - a.offset) / (b.offset - a.offset) : 0
  return {
    offset,
    openness: a.openness + (b.openness - a.openness) * t,
    width: a.width + (b.width - a.width) * t,
    rounding: a.rounding + (b.rounding - a.rounding) * t,
    energy: a.energy + (b.energy - a.energy) * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  }
}

/** The phone spoken at `offset`, or null between words. */
function phoneAt(phones: readonly Phone[], offset: number): Phone | null {
  let lo = 0
  let hi = phones.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((phones[mid]?.start ?? 0) <= offset) lo = mid + 1
    else hi = mid
  }
  const phone = phones[lo - 1]
  return phone && offset < phone.start + phone.duration ? phone : null
}

/** A Gaussian average of `read` around `offset`, sampled at a sixth of `sigma`. */
function gaussian(offset: number, sigma: number, read: (at: number) => number) {
  let sum = 0
  let weights = 0
  for (let i = -12; i <= 12; i++) {
    const weight = Math.exp(-(i * i) / 72)
    sum += weight * read(offset + (i * sigma) / 6)
    weights += weight
  }
  return sum / weights
}

/** How loud the voice is at `t`, as the share of a full opening it allows. */
const voiceAt = (track: SpeechTrack, t: number, p: MouthParams) =>
  ramp(p.quiet, p.loud, keyframeAt(track.keyframes, t).energy)

/**
 * How far Sam is talking at `offset` (0–1): her voice over the syllables
 * around it, so it holds through a phrase and lets go in a pause.
 */
export function talkAt(
  track: SpeechTrack,
  offset: number,
  p: MouthParams = MOUTH
) {
  const voice = gaussian(offset, p.talkSigma, (t) => voiceAt(track, t, p))
  return ramp(p.talkFrom, p.talkTo, voice)
}

/**
 * Where the lips close: each span, how far they close in it (0–1), and how
 * long they take to close before it and to part after it.
 */
interface Closure {
  start: number
  end: number
  depth: number
  lead: number
  release: number
}

/**
 * The closures around `offset`. A bilabial phone closes the lips fully, at the
 * analysis's closure nearest it when there is one (or, for an "m", its nasal),
 * since the phones' timing is only the words' and the lips shut as a stop's
 * silence starts. A closure no bilabial explains is another stop, where the
 * lips only come together; a silence shuts them. Lips close and part over at
 * most `closeLead` and `closeRelease`, and over less between closures close
 * together, so the vowel between them ("mom") still opens.
 */
function closures(
  track: SpeechTrack,
  offset: number,
  p: MouthParams
): Closure[] {
  const near = (t: number) => Math.abs(t - offset) < 0.5
  const spans: Closure[] = []
  const claimed = new Set<LipsyncEvent>()
  for (const phone of track.phones) {
    if (!BILABIALS.has(phone.phone) || !near(phone.start)) continue
    let best: LipsyncEvent | null = null
    for (const event of track.events) {
      const fits =
        event.kind === "closure" ||
        (event.kind === "nasal" && phone.phone === "M")
      if (!fits || claimed.has(event)) continue
      const distance = Math.abs(event.offset - phone.start)
      if (
        distance <= p.snap &&
        (!best || distance < Math.abs(best.offset - phone.start))
      ) {
        best = event
      }
    }
    if (best) claimed.add(best)
    const start = best?.offset ?? phone.start
    const span = best?.kind === "closure" ? best.duration : phone.duration
    spans.push({
      start,
      end: start + Math.max(span, p.closeHold),
      depth: 1,
      lead: p.closeLead,
      release: p.closeRelease,
    })
  }
  const phoned = track.phones.length > 0
  for (const event of track.events) {
    if (!near(event.offset) || claimed.has(event) || event.kind === "nasal")
      continue
    const depth = event.kind === "silence" || !phoned ? 1 : p.stopDepth
    const end =
      event.offset +
      Math.max(event.duration, event.kind === "silence" ? 0.03 : p.closeHold)
    spans.push({
      start: event.offset,
      end,
      depth,
      lead: p.closeLead,
      release: p.closeRelease,
    })
  }
  spans.sort((a, b) => a.start - b.start)
  for (const [i, span] of spans.entries()) {
    const before = spans[i - 1]
    const after = spans[i + 1]
    if (before) span.lead = fit(span.start - before.end, p.closeLead)
    if (after) span.release = fit(after.start - span.end, p.closeRelease)
  }
  return spans
}

/** The quickest lips close or part, seconds. */
const MIN_RAMP = 0.025

/** A ramp that takes at most `most`, and under half the `room` it has. */
const fit = (room: number, most: number) => clamp(room * 0.45, MIN_RAMP, most)

/** How far the lips are drawn shut at `offset` (0–1). */
function closedAt(spans: readonly Closure[], offset: number) {
  let closed = 0
  for (const { start, end, depth, lead, release } of spans) {
    if (offset < start - lead || offset > end + release) continue
    const shut =
      offset < start
        ? ramp(start - lead, start, offset)
        : 1 - ramp(end, end + release, offset)
    closed = Math.max(closed, shut * depth)
  }
  return closed
}

/** The mouth the track asks for at `offset` seconds into the utterance, in rig units. */
function shapeMouth(
  track: SpeechTrack,
  offset: number,
  p: MouthParams = MOUTH
): Articulation {
  const phoned = track.phones.length > 0
  const openAt = (t: number) => {
    const k = keyframeAt(track.keyframes, t)
    const heard = ramp(p.low, p.high, k.openness)
    const phone = phoned ? phoneAt(track.phones, t) : null
    const viseme = phone ? (VISEMES[phone.phone] ?? OTHER_CONSONANT) : null
    const height = viseme ? heard + (viseme.open - heard) * p.phoneShare : heard
    return voiceAt(track, t, p) * (1 - p.heightShare + p.heightShare * height)
  }
  const openness = p.maxOpen * gaussian(offset, p.openSigma, openAt)

  // The lips' shape: the phones' visemes, weighted so consonants borrow the
  // vowels', or the analysis's rounding and width where no word is spoken.
  let width = 0
  let rounding = 0
  let weights = 0
  for (let i = -12; i <= 12; i++) {
    const t = offset + (i * p.shapeSigma) / 6
    const kernel = Math.exp(-(i * i) / 72)
    const phone = phoned ? phoneAt(track.phones, t) : null
    let shape: { width: number; round: number; weight: number }
    if (phone) {
      shape = VISEMES[phone.phone] ?? OTHER_CONSONANT
    } else {
      const k = keyframeAt(track.keyframes, t)
      const spread = ramp(p.spreadFrom, p.spreadTo, k.width)
      const round = ramp(p.roundFrom, p.roundTo, k.rounding)
      shape = {
        width: p.talkWidth + (p.maxWidth - p.talkWidth) * spread,
        round: p.talkRound + (p.maxRound - p.talkRound) * round,
        weight: 0.3,
      }
    }
    const w = kernel * shape.weight
    width += w * shape.width
    rounding += w * shape.round
    weights += w
  }
  // The lips relax to rest as she stops talking, not between syllables.
  const talk = talkAt(track, offset, p)
  const shaped = weights > 0 ? width / weights : p.restWidth
  return {
    openness: openness * (1 - closedAt(closures(track, offset, p), offset)),
    width: p.restWidth + (shaped - p.restWidth) * talk,
    rounding: (weights > 0 ? rounding / weights : 0) * talk,
    energy: keyframeAt(track.keyframes, offset).energy,
  }
}

/**
 * Follows the shaped mouth over time: smooths its last few milliseconds, so
 * nothing jumps where the track starts, stops or is cut, and eases it to rest
 * when the utterance stops. It looks `follow` ahead, so the smoothing adds no
 * lag.
 */
class MouthFollower {
  private mouth: Articulation = { ...REST }
  private at: number | null = null
  private readonly p: MouthParams

  constructor(p: MouthParams = MOUTH) {
    this.p = p
  }

  step(
    track: SpeechTrack,
    offset: number | null,
    speaking: boolean,
    nowMs: number
  ): Articulation {
    const target =
      speaking && offset !== null
        ? shapeMouth(track, offset + this.p.follow, this.p)
        : REST
    const elapsed = this.at === null ? Infinity : (nowMs - this.at) / 1000
    this.at = nowMs
    const tau = speaking ? this.p.follow : this.p.rest
    const keep = elapsed > 0.25 ? 0 : Math.exp(-Math.max(0, elapsed) / tau)
    const follow = (from: number, to: number) => to + (from - to) * keep
    this.mouth = {
      openness: follow(this.mouth.openness, target.openness),
      width: follow(this.mouth.width, target.width),
      rounding: follow(this.mouth.rounding, target.rounding),
      energy: target.energy,
    }
    return { ...this.mouth }
  }

  reset(): void {
    this.mouth = { ...REST }
    this.at = null
  }
}

/**
 * The runtime's live speech, shaped: `source` says where the utterance's
 * playhead is and whether it's speaking (it keeps the runtime's cuts and
 * windows), and `speech` holds the track the mouth is shaped from.
 */
export function shapedSource(
  source: SpeechSource,
  speech: { readonly track: SpeechTrack }
): SpeechSource {
  const follower = new MouthFollower()
  return {
    sample(nowMs) {
      const sample = source.sample(nowMs)
      const mouth = follower.step(
        speech.track,
        sample.relTime,
        sample.speaking,
        nowMs
      )
      return sampleFor(mouth, sample)
    },
    reset() {
      follower.reset()
      source.reset()
    },
    dispose() {
      source.dispose?.()
    },
  }
}

/**
 * The speech sample that the runtime's mapSpeechToRig turns into `mouth`
 * exactly: its rounding and width maps inverted, and the openness its
 * calibration needs found by bisection. Marked as no keyframe, with no events,
 * so the runtime neither damps it again nor snaps it shut.
 */
function sampleFor(mouth: Articulation, base: SpeechSample): SpeechSample {
  const width = clamp(mouth.width)
  const wireWidth = width <= 0.5 ? width * 0.7 : 0.35 + (width - 0.5) * 1.3
  const wireRounding = 0.35 + 0.65 * clamp(mouth.rounding)
  const target = clamp(mouth.openness)
  let low = 0
  let high = 1
  for (let i = 0; i < 24 && target > 0; i++) {
    const mid = (low + high) / 2
    if (calibratedOpenness(mid, wireWidth, wireRounding) < target) low = mid
    else high = mid
  }
  return {
    ...base,
    openness: target > 0 ? high : 0,
    width: wireWidth,
    rounding: wireRounding,
    energy: clamp(mouth.energy),
    live: false,
    sealed: false,
    release: undefined,
    events: [],
  }
}

/** The runtime's calibratedOpenness (speech/calibrate.ts), for the inversion. */
function calibratedOpenness(openness: number, width: number, rounding: number) {
  const distance = Math.max(0.1 - rounding, rounding - 0.35, 0)
  const articulated = ramp(0.01, 0.12, Math.hypot(width - 0.35, distance))
  const x = Math.max(
    clamp((openness - 0.15) / 0.85),
    Math.min(clamp(openness), 0.15) * articulated
  )
  return (2.4 * x) / (1 + 1.4 * x)
}
