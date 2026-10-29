import type { LipsyncEvent } from "@/avatar-runtime/avatar-runtime.js"
import type { Keyframe, Phone, SpeechTrack } from "@/lib/mouth-shaper"

/**
 * The utterance playing, assembled from the bot's server-messages: its lipsync
 * batches (server/lipsync/rtvi.py) and the phones of its words
 * (server/avatar/phones.py), which share its TTS context id. Offsets are
 * seconds into the utterance, each batch's playout shift `t0` added, as the
 * avatar runtime's feed reads them; it anchors the utterance the same way.
 */
export interface SpeechTrackBuilder {
  /** Take a server-message that arrived at `nowMs` (performance.now()); others are ignored. */
  ingest(data: unknown, nowMs: number): void
  /** Where the utterance's offset 0 plays, untrimmed (ms), or Infinity before any batch. */
  readonly anchor: number
  readonly track: SpeechTrack
  reset(): void
}

/** Phones of contexts not yet playing, kept for at most this many contexts. */
const MAX_WAITING_CONTEXTS = 8

const EMPTY: SpeechTrack = { keyframes: [], events: [], phones: [] }

export function createSpeechTrack(): SpeechTrackBuilder {
  let ctx: string | null = null
  let anchor = Infinity
  let progress = -Infinity
  let keyframes: Keyframe[] = []
  let events: LipsyncEvent[] = []
  // Each batch's window start (seconds of audio) and playout shift.
  let windows: { start: number; t0: number }[] = []
  // Phones by context, in seconds of audio, unshifted.
  const phones = new Map<string, Phone[]>()
  let track: SpeechTrack | null = EMPTY

  const restart = (next: string) => {
    if (ctx !== null && ctx !== next) phones.delete(ctx)
    ctx = next
    anchor = Infinity
    progress = -Infinity
    keyframes = []
    events = []
    windows = []
  }

  /** The playout shift of the window holding `offset` seconds of audio. */
  const shiftAt = (offset: number) => {
    let t0 = windows[0]?.t0 ?? 0
    for (const window of windows) {
      if (window.start > offset) break
      t0 = window.t0
    }
    return t0
  }

  const build = (): SpeechTrack => ({
    keyframes,
    events,
    phones: (ctx === null ? [] : (phones.get(ctx) ?? [])).map((phone) => ({
      ...phone,
      start: phone.start + shiftAt(phone.start),
    })),
  })

  return {
    ingest(data, nowMs) {
      if (isLipsyncBatch(data)) {
        const start = data.ws + data.t0
        // Another context, or offsets that went back: a new utterance.
        if (data.ctx !== ctx || start < progress - 1e-3) restart(data.ctx)
        anchor = Math.min(anchor, nowMs + (data.lead - start) * 1000)
        progress = Math.max(progress, start)
        windows.push({ start: data.ws, t0: data.t0 })
        windows.sort((a, b) => a.start - b.start)
        for (const row of data.kf) {
          const [offset, openness, width, rounding, energy, pitch] = row
          if (energy === undefined) continue
          keyframes.push({
            offset: (offset ?? 0) + data.t0,
            openness: openness ?? 0,
            width: width ?? 0,
            rounding: rounding ?? 0,
            energy,
            pitch: pitch ?? 0,
          })
        }
        keyframes.sort((a, b) => a.offset - b.offset)
        for (const [offset, kind, duration, confidence] of data.ev) {
          if (kind !== "closure" && kind !== "nasal" && kind !== "silence")
            continue
          events.push({
            offset: Number(offset) + data.t0,
            kind,
            duration: Number(duration),
            confidence: Number(confidence),
          })
        }
        events.sort((a, b) => a.offset - b.offset)
        track = null
      } else if (isPhones(data)) {
        const list = phones.get(data.ctx) ?? []
        for (const [start, duration, phone] of data.phones) {
          list.push({ start, duration, phone })
        }
        list.sort((a, b) => a.start - b.start)
        phones.delete(data.ctx)
        phones.set(data.ctx, list)
        while (phones.size > MAX_WAITING_CONTEXTS) {
          const oldest = phones.keys().next().value
          if (oldest === undefined || oldest === ctx) break
          phones.delete(oldest)
        }
        if (data.ctx === ctx) track = null
      }
    },
    get anchor() {
      return anchor
    },
    get track() {
      track ??= build()
      return track
    },
    reset() {
      ctx = null
      anchor = Infinity
      progress = -Infinity
      keyframes = []
      events = []
      windows = []
      phones.clear()
      track = EMPTY
    },
  }
}

interface LipsyncBatch {
  ctx: string
  t0: number
  ws: number
  lead: number
  kf: (number | undefined)[][]
  ev: unknown[][]
}

/** A bot-tts-lipsync server message (server/lipsync/rtvi.py), version 2. */
function isLipsyncBatch(data: unknown): data is LipsyncBatch {
  if (typeof data !== "object" || data === null) return false
  const batch = data as Record<string, unknown>
  return (
    batch.type === "bot-tts-lipsync" &&
    typeof batch.ctx === "string" &&
    typeof batch.t0 === "number" &&
    typeof batch.ws === "number" &&
    typeof batch.lead === "number" &&
    Array.isArray(batch.kf) &&
    Array.isArray(batch.ev)
  )
}

interface PhonesMessage {
  ctx: string
  phones: [number, number, string][]
}

/** A bot-tts-phones server message (server/avatar/phones.py). */
function isPhones(data: unknown): data is PhonesMessage {
  if (typeof data !== "object" || data === null) return false
  const message = data as Record<string, unknown>
  return (
    message.type === "bot-tts-phones" &&
    typeof message.ctx === "string" &&
    Array.isArray(message.phones) &&
    message.phones.every(
      (row) =>
        Array.isArray(row) &&
        typeof row[0] === "number" &&
        typeof row[1] === "number" &&
        typeof row[2] === "string"
    )
  )
}
