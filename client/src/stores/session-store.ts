import { create } from "zustand"

export type TtsChoice = "elevenlabs" | "cartesia"

/**
 * The two ways Sam's lines get their delivery: PhoneLLM Mini writes plain
 * words and the Tone tagger voices them for ElevenLabs, or GPT-5.6 Luna
 * writes the tags itself, for Cartesia.
 */
const MODES = {
  tagger: { tts: "elevenlabs", useTagger: true },
  llm: { tts: "cartesia", useTagger: false },
} as const satisfies Record<string, { tts: TtsChoice; useTagger: boolean }>

export type Mode = keyof typeof MODES

interface SessionState {
  /** The bot's start-time options (BotOptions in server/bot.py). */
  tts: TtsChoice
  useTagger: boolean
  detectBackchannels: boolean
  setTts: (tts: TtsChoice) => void
  setUseTagger: (useTagger: boolean) => void
  setDetectBackchannels: (detectBackchannels: boolean) => void
  setMode: (mode: Mode) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  ...MODES.tagger,
  detectBackchannels: true,
  setTts: (tts) => set({ tts }),
  setUseTagger: (useTagger) => set({ useTagger }),
  setDetectBackchannels: (detectBackchannels) => set({ detectBackchannels }),
  setMode: (mode) => set(MODES[mode]),
}))
