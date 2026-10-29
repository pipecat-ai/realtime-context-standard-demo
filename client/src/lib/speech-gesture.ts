import type { SpeechSource } from "@/avatar-runtime/avatar-runtime.js"
import { talkAt, type Keyframe, type SpeechTrack } from "@/lib/mouth-shaper"

/**
 * Moves Sam's head, brows and eyes with her speech, so her mouth doesn't talk
 * alone. A vowel that stands out from the second before it, louder or higher,
 * is a beat: her head dips into it and turns a touch, the other way each time,
 * and her brows lift with it as far as its pitch rises. Each phrase tilts her
 * head a little differently, a higher voice lifts it, and she blinks as a
 * phrase starts after a pause. While she talks, her expression's smile eases,
 * so a happy mouth talks rather than grins. In the rig's acting units: a head
 * 200 wide, angles in degrees.
 */
const ACTING = {
  /** A vowel's prominence over the second before (its loudness, and half its pitch) that starts and completes a beat. */
  beatFrom: 0.04,
  beatTo: 0.3,
  /** A vowel this quiet makes no beat; from `loud`, a full one. */
  quiet: 0.3,
  loud: 0.75,
  /** What a vowel stands out from before a second of them has been heard: about River's. */
  usualLoudness: 0.82,
  usualPitch: 0.45,
  /** A full beat's dip and turn: about 5px and a degree on a laptop, where a unit draws about a pixel. */
  nod: 5,
  turn: 1.2,
  /** A beat this soon after the last, seconds, is none; by `refractory`, a full one. */
  crowded: 0.12,
  refractory: 0.35,
  /** How far a beat lifts the brows, as its pitch rises from `browFrom` to `browTo` over the second before. */
  brow: 4.5,
  browFrom: 0.02,
  browTo: 0.25,
  /** How far the eyes open for each unit the brows lift. */
  widen: 0.012,
  /** A beat peaks `peak` into its vowel: the head dips over `attack` and recovers over `release`, the brows over `browRelease`. */
  peak: 0.05,
  attack: 0.16,
  release: 0.38,
  browRelease: 0.6,
  /** Each phrase's tilt and lean, eased in over `tiltEase` from `tiltLead` before it starts. */
  tilt: 2.5,
  lean: 1.5,
  tiltLead: 0.15,
  tiltEase: 0.8,
  /** The voice back after this long below `hush`, seconds, starts a phrase. */
  pause: 0.25,
  hush: 0.25,
  /** How far the head lifts and the brows rise with the pitch, from the middle of the voice's range; over this σ. */
  lift: 2,
  browTone: 1.5,
  toneSigma: 0.15,
  /** She blinks as a phrase starts after a pause this long, no more than once in `blinkEvery`. */
  blinkPause: 0.3,
  blinkEvery: 1.6,
  /**
   * How far the smile eases while she talks (0–1): over `relaxIn` seconds as
   * she starts, and back over `relaxOut`, so a pause between sentences doesn't
   * flash a grin.
   */
  relax: 0.6,
  relaxIn: 0.08,
  relaxOut: 0.5,
  /** Smoothing time constants, seconds: while speaking, and back to rest after. */
  follow: 0.03,
  rest: 0.35,
}

const VOWELS = new Set(
  "AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW".split(" ")
)

/** What the speech adds to the pose, and how far it eases the smile. */
const KEYS = [
  "relax",
  "headY",
  "headAngle",
  "headX",
  "browLeft",
  "browRight",
  "eyeLeft",
  "eyeRight",
] as const
type Acting = Record<(typeof KEYS)[number], number>
const STILL: Acting = {
  relax: 0,
  headY: 0,
  headAngle: 0,
  headX: 0,
  browLeft: 0,
  browRight: 0,
  eyeLeft: 0,
  eyeRight: 0,
}

/** Where a beat peaks; how strong it is and how far its pitch lifts the brows (0–1); which way it turns. */
interface Beat {
  at: number
  strength: number
  brow: number
  side: number
}

/** Where a phrase starts, and the pause before it (Infinity for the first). */
interface Phrase {
  start: number
  pause: number
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const smooth = (value: number) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}
const ramp = (from: number, to: number, value: number) =>
  smooth((value - from) / (to - from))

/** The keyframes from `from` to `to` seconds. */
function keyframesIn(keyframes: readonly Keyframe[], from: number, to: number) {
  let lo = 0
  let hi = keyframes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((keyframes[mid]?.offset ?? 0) < from) lo = mid + 1
    else hi = mid
  }
  let end = lo
  while (end < keyframes.length && (keyframes[end]?.offset ?? 0) <= to) end++
  return keyframes.slice(lo, end)
}

const mean = (values: readonly number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length

/** The mean of `values`, leaning on `fallback` until there are three. */
function usual(values: readonly number[], fallback: number) {
  if (!values.length) return fallback
  return fallback + (mean(values) - fallback) * Math.min(1, values.length / 3)
}

/** Each vowel against the vowels of the second before it: the ones that stand out are beats. */
function beatsOf(track: SpeechTrack): Beat[] {
  const vowels = track.phones
    .filter((phone) => VOWELS.has(phone.phone))
    .map((phone) => {
      const end = phone.start + phone.duration
      let loudness = 0
      const pitches: number[] = []
      for (const k of keyframesIn(
        track.keyframes,
        phone.start - 0.02,
        end + 0.02
      )) {
        loudness = Math.max(loudness, k.energy)
        if (k.pitch > 0.02) pitches.push(k.pitch)
      }
      return {
        start: phone.start,
        loudness,
        pitch: pitches.length ? mean(pitches) : null,
      }
    })
  const beats: Beat[] = []
  let last = -Infinity
  let first = 0
  for (const [i, vowel] of vowels.entries()) {
    while ((vowels[first]?.start ?? Infinity) < vowel.start - 1) first++
    const before = vowels.slice(first, i)
    const loudness = usual(
      before.map((v) => v.loudness),
      ACTING.usualLoudness
    )
    const pitched = before.flatMap((v) => (v.pitch === null ? [] : [v.pitch]))
    const rise =
      vowel.pitch === null ? 0 : vowel.pitch - usual(pitched, ACTING.usualPitch)
    const strength =
      ramp(
        ACTING.beatFrom,
        ACTING.beatTo,
        vowel.loudness - loudness + rise / 2
      ) *
      ramp(ACTING.quiet, ACTING.loud, vowel.loudness) *
      ramp(ACTING.crowded, ACTING.refractory, vowel.start - last)
    if (strength < 0.05) continue
    beats.push({
      at: vowel.start + ACTING.peak,
      strength,
      brow: ramp(ACTING.browFrom, ACTING.browTo, rise),
      side: beats.length % 2 ? -1 : 1,
    })
    last = vowel.start
  }
  return beats
}

/**
 * Where the voice starts, and starts again after a pause. The voice's, not the
 * phones': a sentence's last word stretches its phones over most of the pause
 * after it.
 */
function phrasesOf(track: SpeechTrack): Phrase[] {
  const phrases: Phrase[] = []
  let hushed: number | null = -Infinity
  for (const k of track.keyframes) {
    if (k.energy < ACTING.hush) {
      hushed ??= k.offset
    } else if (hushed !== null) {
      const pause = k.offset - hushed
      if (pause >= ACTING.pause) phrases.push({ start: k.offset, pause })
      hushed = null
    }
  }
  return phrases
}

/** Each version of a track's beats and phrases, read once. */
const readings = new WeakMap<
  SpeechTrack,
  { beats: Beat[]; phrases: Phrase[] }
>()
function readingOf(track: SpeechTrack) {
  let reading = readings.get(track)
  if (!reading) {
    reading = { beats: beatsOf(track), phrases: phrasesOf(track) }
    readings.set(track, reading)
  }
  return reading
}

/** The pitch around `offset`, from its loud voiced keyframes, and the middle of the range where there are none. */
function toneAt(track: SpeechTrack, offset: number) {
  const sigma = ACTING.toneSigma
  let sum = 0.1
  let weights = 0.2
  for (const k of keyframesIn(
    track.keyframes,
    offset - 2 * sigma,
    offset + 2 * sigma
  )) {
    if (k.pitch <= 0.02) continue
    const d = (k.offset - offset) / sigma
    const weight = Math.exp(-(d * d) / 2) * k.energy
    sum += weight * k.pitch
    weights += weight
  }
  return sum / weights
}

/** A repeatable 0–1 for `n`. */
function wobble(n: number) {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453
  return x - Math.floor(x)
}

/** Phrase `n`'s tilt: the other way from the last, by a varying amount; none before the first. */
const tiltOf = (n: number, utterance: number) =>
  n < 0
    ? 0
    : ACTING.tilt *
      ((n + utterance) % 2 ? -1 : 1) *
      (0.45 + 0.55 * wobble(utterance * 7 + n))

/** The acting at `offset` seconds into the `utterance`th utterance. */
function actingAt(
  track: SpeechTrack,
  offset: number,
  utterance: number
): Acting {
  const { beats, phrases } = readingOf(track)
  let dip = 0
  let turn = 0
  let brow = 0
  for (const beat of beats) {
    const t = offset - beat.at
    if (t < -ACTING.attack || t > ACTING.browRelease) continue
    const rise = ramp(-ACTING.attack, 0, t)
    const head = t < 0 ? rise : 1 - ramp(0, ACTING.release, t)
    dip += ACTING.nod * beat.strength * head
    turn += ACTING.turn * beat.strength * beat.side * head
    brow +=
      ACTING.brow *
      beat.strength *
      beat.brow *
      (t < 0 ? rise : 1 - ramp(0, ACTING.browRelease, t))
  }

  let n = -1
  while ((phrases[n + 1]?.start ?? Infinity) - ACTING.tiltLead <= offset) n++
  const into = smooth(
    (offset - (phrases[n]?.start ?? 0) + ACTING.tiltLead) / ACTING.tiltEase
  )
  const from = tiltOf(n - 1, utterance)
  const tilt = from + (tiltOf(n, utterance) - from) * into

  let blink = 0
  let blinked = -Infinity
  for (const phrase of phrases) {
    if (
      phrase.pause < ACTING.blinkPause ||
      phrase.start - blinked < ACTING.blinkEvery
    )
      continue
    blinked = phrase.start
    const t = offset - phrase.start
    blink = Math.max(blink, t < 0 ? ramp(-0.07, 0, t) : 1 - ramp(0, 0.12, t))
  }

  const talk = talkAt(track, offset)
  const tone = (toneAt(track, offset) - 0.5) * talk
  const raised = brow + ACTING.browTone * tone
  // A blink shuts eyes held as wide as 1.3; lifted brows open them a little.
  const eyes = ACTING.widen * Math.max(0, raised) - 1.3 * blink
  return {
    relax: ACTING.relax * talk,
    headY: dip - ACTING.lift * tone,
    headAngle: tilt + turn,
    headX: (ACTING.lean * tilt) / ACTING.tilt,
    browLeft: -raised,
    browRight: -raised * 0.85,
    eyeLeft: eyes,
    eyeRight: eyes,
  }
}

/** Eases the acting towards each frame's, quickly while she speaks, and back to still after. */
class ActingFollower {
  private acting: Acting = { ...STILL }
  private at: number | null = null

  step(target: Acting, speaking: boolean, nowMs: number): Acting {
    const elapsed = this.at === null ? Infinity : (nowMs - this.at) / 1000
    this.at = nowMs
    const easing =
      target.relax > this.acting.relax ? ACTING.relaxIn : ACTING.relaxOut
    for (const key of KEYS) {
      const tau =
        key === "relax" ? easing : speaking ? ACTING.follow : ACTING.rest
      const keep = elapsed > 0.25 ? 0 : Math.exp(-Math.max(0, elapsed) / tau)
      this.acting[key] = target[key] + (this.acting[key] - target[key]) * keep
    }
    return { ...this.acting }
  }

  reset(): void {
    this.acting = { ...STILL }
    this.at = null
  }
}

/** `source`'s speech with Sam's acting: `speech` holds the track it reads. */
export function gesturedSource(
  source: SpeechSource,
  speech: { readonly track: SpeechTrack }
): SpeechSource {
  const follower = new ActingFollower()
  let utterance = 0
  let speaking = false
  return {
    sample(nowMs) {
      const sample = source.sample(nowMs)
      const offset = sample.relTime
      const now = sample.speaking && offset !== null
      if (now && !speaking) utterance += 1
      speaking = now
      const target = now ? actingAt(speech.track, offset, utterance) : STILL
      const { relax, ...pose } = follower.step(target, now, nowMs)
      return { ...sample, gesture: { relax, pose } }
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
