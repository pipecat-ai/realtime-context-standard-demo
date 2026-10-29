import type {
  LipsyncCallbacks,
  SpeechSource,
} from "@/avatar-runtime/avatar-runtime.js"
import type { Keyframe } from "@/lib/mouth-shaper"
import type { SpeechTrackBuilder } from "@/lib/speech-track"

/**
 * The bot sends each lipsync batch timed to when its audio leaves the bot, but
 * the voice is heard later: after the bot's send buffer, the jitter buffer and
 * the output device, 100–320 ms on a local bot, and drifting through a reply
 * as those buffers fill and drain, in steps of up to 70 ms. So the mouth is
 * delayed by a trim that follows the voice as it's heard: every half second
 * the aligner matches the last 2 s of the batches' energy against the loudness
 * of the bot's audio as played, and eases the trim towards the lag that fits
 * best. Over four replies from a local bot, the mouth was within 3 ms of the
 * voice at the median and 27 ms at worst, before a reply's first estimate.
 */

/** The trim before the voice has been heard: a local bot's, over SmallWebRTC. */
const DEFAULT_TRIM_MS = 120
/** The span of speech each estimate matches, and how often one is made. */
const WINDOW_MS = 2000
const ESTIMATE_EVERY_MS = 500
/** The loudness envelope's grid, and the lag searched each side of the trim. */
const GRID_MS = 10
const SEARCH_MS = 200
const MAX_LAG_MS = 800
/** An estimate steers the trim only when the energy fits the voice this well. */
const MIN_CORRELATION = 0.75
/** A lag this far from the target waits for the next estimate to agree. */
const JUMP_MS = 40
const AGREE_MS = 20
/**
 * The fastest the trim moves: the mouth runs at most 15% fast or slow while
 * it catches up, too little to see.
 */
const SLEW_MS_PER_S = 150
/** Quieter than this, in dB of full scale, is silence. */
const FLOOR_DB = -60

/** Posts each ~10 ms of the bot's audio as [context time of its middle, mean square]. */
const ENVELOPE_WORKLET = `
registerProcessor("lipsync-envelope", class extends AudioWorkletProcessor {
  sum = 0
  count = 0
  start = 0
  process([input]) {
    const samples = input?.[0]
    if (!samples) return true
    if (this.count === 0) this.start = currentTime
    for (const sample of samples) this.sum += sample * sample
    this.count += samples.length
    if (this.count >= sampleRate / 100) {
      this.port.postMessage([this.start + this.count / sampleRate / 2, this.sum / this.count])
      this.sum = 0
      this.count = 0
    }
    return true
  }
})`

/** A value on the wall clock (performance.now()). */
interface Point {
  t: number
  value: number
}

export interface LipsyncAligner {
  /** The PipecatClient callbacks: the runtime's, with the batches and phones observed. */
  callbacks: LipsyncCallbacks
  /** The runtime's source, sampled `trimMs` earlier. */
  source: SpeechSource
  /** Hear the bot's audio as it plays. Returns the cleanup. */
  listen(track: MediaStreamTrack): () => void
  /** Create or resume the audio context: call it inside a user gesture. */
  resume(): void
  /** The trim now applied, in ms (positive delays the mouth). */
  readonly trimMs: number
}

/**
 * Wraps a live lipsync source from the avatar runtime's createLipsync, reading
 * the utterance's anchor and energy from `speech`, which its callbacks feed.
 */
export function createLipsyncAligner(
  live: { callbacks: LipsyncCallbacks; source: SpeechSource },
  speech: SpeechTrackBuilder
): LipsyncAligner {
  let trim = DEFAULT_TRIM_MS
  let target = DEFAULT_TRIM_MS
  // A jump not yet confirmed.
  let jump: number | null = null
  // Where the last estimate's window ended: once an utterance is over, its
  // last window stays put, and a repeat must not confirm a jump.
  let estimatedTo = -Infinity
  let lastSampleMs: number | null = null

  // The voice's loudness as heard, in dB.
  let heard: Point[] = []

  let context: AudioContext | null = null
  let worklet: Promise<void> | null = null

  const audioContext = () => {
    context ??= new AudioContext({ latencyHint: "interactive" })
    worklet ??= context.audioWorklet.addModule(
      URL.createObjectURL(
        new Blob([ENVELOPE_WORKLET], { type: "application/javascript" })
      )
    )
    return { context, worklet }
  }

  const estimate = () => {
    const { anchor } = speech
    const energy = speech.track.keyframes
    const first = energy[0]
    if (!first || heard.length === 0) return
    // On the grid, which the target, between grid points, is not.
    const lo = Math.max(0, onGrid(target - SEARCH_MS))
    const hi = Math.min(MAX_LAG_MS, onGrid(target + SEARCH_MS))
    // The latest window whose voice has been heard at every lag searched,
    // while the utterance is still under way or just over.
    const heardTo = performance.now() - hi
    const end = Math.min(heardTo, anchor + (energy.at(-1)?.offset ?? 0) * 1000)
    const start = end - WINDOW_MS
    if (start < anchor + first.offset * 1000 || heardTo - end > 1000) return
    if (end <= estimatedTo) return
    estimatedTo = end

    const n = WINDOW_MS / GRID_MS
    const mouth = energyTrack(energy, (start - anchor) / 1000, n)
    const voice = envelope(heard, start + lo, (WINDOW_MS + hi - lo) / GRID_MS)
    const fits = []
    for (let lag = lo; lag <= hi; lag += GRID_MS) {
      const shift = (lag - lo) / GRID_MS
      fits.push(correlation(mouth, voice.slice(shift, shift + n)))
    }
    const best = fits.indexOf(Math.max(...fits))
    const fit = fits[best] ?? 0
    if (fit < MIN_CORRELATION) return
    // A parabola through the peak and its neighbours, for the lag between
    // grid points.
    const before = fits[best - 1] ?? fit
    const after = fits[best + 1] ?? fit
    const curve = before - 2 * fit + after
    const offset = curve < 0 ? (before - after) / (2 * curve) : 0
    const lag = lo + (best + offset) * GRID_MS
    const confirmed = jump !== null && Math.abs(lag - jump) <= AGREE_MS
    if (Math.abs(lag - target) <= JUMP_MS || confirmed) {
      target = lag
      jump = null
    } else {
      jump = lag
    }
  }

  const callbacks: LipsyncCallbacks = {
    ...live.callbacks,
    onServerMessage: (data) => {
      speech.ingest(data, performance.now())
      live.callbacks.onServerMessage(data)
    },
    onDisconnected: () => {
      speech.reset()
      heard = []
      live.callbacks.onDisconnected()
    },
  }

  const source: SpeechSource = {
    sample(nowMs) {
      if (lastSampleMs !== null) {
        const step = (SLEW_MS_PER_S * Math.max(0, nowMs - lastSampleMs)) / 1000
        trim += Math.min(step, Math.max(-step, target - trim))
      }
      lastSampleMs = nowMs
      return live.source.sample(nowMs - trim)
    },
    reset: () => {
      live.source.reset()
    },
    dispose: () => live.source.dispose?.(),
  }

  return {
    callbacks,
    source,
    listen(track) {
      let stopped = false
      let nodes: AudioNode[] = []
      const { context, worklet } = audioContext()
      // Without the worklet the voice goes unheard, and the trim stays put.
      void worklet.then(
        () => {
          if (stopped) return
          const input = context.createMediaStreamSource(
            new MediaStream([track])
          )
          const meter = new AudioWorkletNode(context, "lipsync-envelope")
          // The worklet only runs while connected to the output: at no volume.
          const silence = context.createGain()
          silence.gain.value = 0
          meter.port.onmessage = ({ data }: MessageEvent<[number, number]>) => {
            const [time, power] = data
            heard.push({
              t: heardAt(context, time),
              value: Math.max(FLOOR_DB, 10 * Math.log10(power + 1e-12)),
            })
            const keep = performance.now() - WINDOW_MS - MAX_LAG_MS - 1000
            while (heard.length && (heard[0]?.t ?? keep) < keep) heard.shift()
          }
          input.connect(meter).connect(silence).connect(context.destination)
          nodes = [input, meter, silence]
        },
        () => undefined
      )
      const interval = setInterval(estimate, ESTIMATE_EVERY_MS)
      return () => {
        stopped = true
        clearInterval(interval)
        for (const node of nodes) node.disconnect()
        heard = []
      }
    },
    resume() {
      void audioContext().context.resume()
    },
    get trimMs() {
      return trim
    },
  }
}

function onGrid(ms: number): number {
  return Math.round(ms / GRID_MS) * GRID_MS
}

/** When audio at `time` on the context's clock reaches the speakers. */
function heardAt(context: AudioContext, time: number): number {
  const { contextTime, performanceTime } = context.getOutputTimestamp()
  if (contextTime !== undefined && performanceTime) {
    return performanceTime + (time - contextTime) * 1000
  }
  // Safari reports no output latency.
  const latency = context.baseLatency + (context.outputLatency || 0)
  return performance.now() + (time - context.currentTime + latency) * 1000
}

/**
 * The keyframes' energy on the grid from `start` seconds, `n` points, linearly
 * between keyframes, as the mouth plays them.
 */
function energyTrack(
  keyframes: readonly Keyframe[],
  start: number,
  n: number
): number[] {
  let i = 0
  return Array.from({ length: n }, (_, k) => {
    const offset = start + (k * GRID_MS) / 1000
    while ((keyframes[i + 1]?.offset ?? Infinity) <= offset) i++
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (!a) return 0
    if (!b || offset <= a.offset) return a.energy
    return (
      a.energy +
      ((b.energy - a.energy) * (offset - a.offset)) / (b.offset - a.offset)
    )
  })
}

/**
 * The heard loudness on the grid from `start`, `n` points: each the mean of
 * the 30 ms around it, a gap carrying the last value.
 */
function envelope(points: Point[], start: number, n: number): number[] {
  const sums = new Array<number>(n).fill(0)
  const counts = new Array<number>(n).fill(0)
  for (const { t, value } of points) {
    const i = Math.round((t - start) / GRID_MS)
    if (i >= 0 && i < n) {
      sums[i] = (sums[i] ?? 0) + value
      counts[i] = (counts[i] ?? 0) + 1
    }
  }
  let last = FLOOR_DB
  const grid = sums.map((sum, i) => {
    const count = counts[i] ?? 0
    last = count ? sum / count : last
    return last
  })
  return grid.map((_, i) => {
    const span = grid.slice(Math.max(0, i - 1), i + 2)
    return span.reduce((a, b) => a + b, 0) / span.length
  })
}

/** Pearson's r; 0 when either side is flat. */
function correlation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const a = x[i] ?? 0
    const b = y[i] ?? 0
    sx += a
    sy += b
    sxx += a * a
    syy += b * b
    sxy += a * b
  }
  const vx = sxx - (sx * sx) / n
  const vy = syy - (sy * sy) / n
  return vx > 1e-9 && vy > 1e-9 ? (sxy - (sx * sy) / n) / Math.sqrt(vx * vy) : 0
}
