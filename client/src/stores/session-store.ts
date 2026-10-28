import { create } from "zustand"

export type TtsChoice = "elevenlabs" | "cartesia"

interface SessionState {
  /** The bot's start-time options (BotOptions in server/bot.py). */
  tts: TtsChoice
  useTagger: boolean
  setTts: (tts: TtsChoice) => void
  setUseTagger: (useTagger: boolean) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  tts: "elevenlabs",
  useTagger: true,
  setTts: (tts) => set({ tts }),
  setUseTagger: (useTagger) => set({ useTagger }),
}))
