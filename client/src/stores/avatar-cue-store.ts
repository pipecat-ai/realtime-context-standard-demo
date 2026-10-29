import type { BotOutputData } from "@pipecat-ai/client-js"
import { create } from "zustand"

import { lipsync, listening, useAvatarStore } from "@/stores/avatar-store"

/** Sam's face for one line, from Jev (server/avatar/director.py). */
interface AvatarCue {
  segment: number
  expression: string | null
  reaction: string | null
}

/**
 * What Sam does as the user talks (server/avatar/listener.py), as it comes: a
 * nod, or a reaction and a face.
 */
interface ListenCue {
  nod?: number
  double?: boolean
  expression?: string | null
  reaction?: string | null
}

const isCue = (data: unknown): data is AvatarCue & { type: "avatar-cue" } =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === "avatar-cue"

const isListenCue = (data: unknown): data is ListenCue =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === "avatar-listen"

/** The face Sam starts listening with. */
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

function hear({ nod, double, expression, reaction }: ListenCue) {
  // A reaction has the head while it plays.
  if (typeof nod === "number" && !useAvatarStore.getState().reaction) {
    listening.nod(nod, double === true)
  }
  play({ expression: expression ?? null, reaction: reaction ?? null })
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
  /** The last reaction to the user, which ends as Sam answers. */
  heard: string | null
  serverMessage: (data: unknown) => void
  botOutput: (data: BotOutputData) => void
  /** Sam listens from the start of the user's turn until she answers. */
  userStartedSpeaking: () => void
  botStartedSpeaking: () => void
  reset: () => void
}

export const useAvatarCueStore = create<AvatarCueState>()((set, get) => ({
  cues: {},
  started: {},
  heard: null,
  serverMessage: (data) => {
    if (isListenCue(data)) {
      hear(data)
      if (data.reaction) set({ heard: data.reaction })
      return
    }
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
    listening.listen(true)
    play({ expression: LISTENING, reaction: null })
  },
  botStartedSpeaking: () => {
    listening.listen(false)
    // A reaction to what the user said is over as Sam answers: her first
    // line's face would otherwise play under it, wide-eyed and sympathetic.
    const { reaction, player } = useAvatarStore.getState()
    if (reaction !== null && reaction === get().heard) player?.endReaction()
    set({ heard: null })
  },
  reset: () => {
    set({ cues: {}, started: {}, heard: null })
    listening.listen(false)
    play({ expression: LISTENING, reaction: null })
  },
}))
