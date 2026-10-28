import type {
  BotOutputData,
  UserInputData,
  UserPerceptionSignal,
} from "@pipecat-ai/client-js"
import { create } from "zustand"

/** A segment's delivery from character `at` of its text on. */
export interface DeliveryChange {
  at: number
  delivery: string[]
}

/** The caller's mood after a user turn, from server/meter.py. */
export interface MoodReading {
  value: number
  change: number
  word: string
}

const isMood = (data: unknown): data is MoodReading & { type: "mood" } =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === "mood"

interface SegmentDelivery {
  changes: DeliveryChange[]
  /** Characters spoken so far, where the next change starts. */
  spoken: number
}

/**
 * What RTVI 2.3.0 says about how each line was said, which client-react's
 * conversation leaves out: the Tone reader's reading of each user line, and
 * the delivery the bot spoke each of its segments in, word by word. And the
 * caller's mood over the call, which the bot works out from the readings.
 */
interface ExpressionState {
  /** The bot's final user transcripts, trimmed: what it heard the user say. */
  heard: Set<string>
  /** Readings of final user transcripts, by their text. */
  perception: Record<string, UserPerceptionSignal[]>
  /** Delivery changes of each bot segment, by segment id. */
  segments: Record<number, SegmentDelivery>
  /** The caller's mood after each user turn, oldest first. */
  moods: MoodReading[]
  userInput: (data: UserInputData) => void
  botOutput: (data: BotOutputData) => void
  serverMessage: (data: unknown) => void
  reset: () => void
}

const sameDelivery = (a: string[] | undefined, b: string[]) =>
  a?.join() === b.join()

export const useExpressionStore = create<ExpressionState>()((set) => ({
  heard: new Set(),
  perception: {},
  segments: {},
  moods: [],
  userInput: ({ text, final, input_type, perception }) => {
    // A backchannel was heard, but never as a transcript of a turn.
    if (!final || input_type === "backchannel") return
    const line = text.trim()
    set((state) => ({
      heard: new Set(state.heard).add(line),
      perception: perception
        ? { ...state.perception, [line]: perception }
        : state.perception,
    }))
  },
  botOutput: ({ segment_id, delivery, spoken_progress }) => {
    if (segment_id === undefined || !delivery) return
    set(({ segments }) => {
      const segment = segments[segment_id] ?? { changes: [], spoken: 0 }
      // Each update's delivery is the word just spoken, which starts where
      // the last update's spoken text ended.
      const changes = sameDelivery(segment.changes.at(-1)?.delivery, delivery)
        ? segment.changes
        : [...segment.changes, { at: segment.spoken, delivery }]
      const spoken = spoken_progress?.accumulated_text.length ?? segment.spoken
      return { segments: { ...segments, [segment_id]: { changes, spoken } } }
    })
  },
  serverMessage: (data) => {
    if (!isMood(data)) return
    const { value, change, word } = data
    set((state) => ({ moods: [...state.moods, { value, change, word }] }))
  },
  reset: () =>
    set({ heard: new Set(), perception: {}, segments: {}, moods: [] }),
}))
