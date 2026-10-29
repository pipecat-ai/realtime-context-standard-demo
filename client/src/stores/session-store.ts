import { create } from "zustand"

export type TtsChoice = "elevenlabs" | "cartesia"

interface SessionState {
  /** The bot's start-time options (BotOptions in server/bot.py). */
  tts: TtsChoice
  useTagger: boolean
  detectBackchannels: boolean
  setTts: (tts: TtsChoice) => void
  setUseTagger: (useTagger: boolean) => void
  setDetectBackchannels: (detectBackchannels: boolean) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  tts: "elevenlabs",
  useTagger: true,
  detectBackchannels: true,
  setTts: (tts) => set({ tts }),
  setUseTagger: (useTagger) => set({ useTagger }),
  setDetectBackchannels: (detectBackchannels) => set({ detectBackchannels }),
}))
