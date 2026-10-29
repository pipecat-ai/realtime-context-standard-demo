import type { BotOutputData } from "@pipecat-ai/client-js"
import { create } from "zustand"

import { lipsync, useAvatarStore } from "@/stores/avatar-store"

/** Sam's face for one line, from Jev (server/avatar/). */
interface AvatarCue {
  segment: number
  expression: string | null
  reaction: string | null
}

const isCue = (data: unknown): data is AvatarCue & { type: "avatar-cue" } =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === "avatar-cue"

/** The face Sam listens with. */
const LISTENING = "neutral"

function play({
  expression,
  reaction,
}: Pick<AvatarCue, "expression" | "reaction">) {
  const avatar = useAvatarStore.getState()
  if (expression) avatar.setExpression(expression)
  // Rejects only while no avatar is mounted, when there's no face to move.
  if (reaction) avatar.react(reaction).catch(() => undefined)
}

/**
 * Plays each cue as its line is heard. The bot sends a line's cue as soon as
 * Jev has read it, usually before the line plays; RTVI's bot-output reports
 * each segment's first word as it leaves the bot, and the voice is heard the
 * lipsync's trim later.
 */
interface AvatarCueState {
  /** Cues that came before their segment played, by segment id. */
  cues: Record<number, AvatarCue>
  /** Segments that have started playing, and whether each has finished. */
  started: Record<number, "playing" | "done">
  serverMessage: (data: unknown) => void
  botOutput: (data: BotOutputData) => void
  /** Sam listens while the user talks. */
  userStartedSpeaking: () => void
  reset: () => void
}

export const useAvatarCueStore = create<AvatarCueState>()((set, get) => ({
  cues: {},
  started: {},
  serverMessage: (data) => {
    if (!isCue(data)) return
    const { segment, expression, reaction } = data
    const started = get().started[segment]
    if (started === undefined) {
      set(({ cues }) => ({ cues: { ...cues, [segment]: data } }))
    } else {
      // Late: the line is under way, or over and too late for a gesture.
      play({ expression, reaction: started === "playing" ? reaction : null })
    }
  },
  botOutput: ({ segment_id, spoken_status }) => {
    if (segment_id === undefined || !spoken_status || spoken_status === "new") {
      return
    }
    const { cues, started } = get()
    const state = spoken_status === "completed" ? "done" : "playing"
    if (started[segment_id] === state) return
    set({ started: { ...started, [segment_id]: state } })
    // Its first word (or, spoken in one piece, all of it) has left the bot.
    const cue = cues[segment_id]
    if (cue && started[segment_id] === undefined) {
      setTimeout(() => play(cue), lipsync.trimMs)
    }
  },
  userStartedSpeaking: () => {
    play({ expression: LISTENING, reaction: null })
  },
  reset: () => {
    set({ cues: {}, started: {} })
    play({ expression: LISTENING, reaction: null })
  },
}))
