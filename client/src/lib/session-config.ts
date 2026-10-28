import type { UsePipecatAppOptions } from "@/hooks/use-pipecat-app"
import type { TtsChoice } from "@/stores/session-store"

/** Must match the start endpoint, which reads the same variable. */
const BOT_TRANSPORT =
  import.meta.env.VITE_BOT_TRANSPORT === "daily" ? "daily" : "smallwebrtc"

/**
 * Sessions start at /api/start (server/bot-api.ts), which holds the bot's
 * location and key and passes on only the bot's own options. Only the
 * configured transport is loaded.
 */
export function sessionOptions(
  tts: TtsChoice,
  useTagger: boolean,
  detectBackchannels: boolean
): UsePipecatAppOptions {
  return {
    transportType: BOT_TRANSPORT,
    transportFactory: async (options) =>
      BOT_TRANSPORT === "daily"
        ? new (await import("@pipecat-ai/daily-transport")).DailyTransport(
            options
          )
        : new (
            await import("@pipecat-ai/small-webrtc-transport")
          ).SmallWebRTCTransport(options),
    startBotParams: {
      endpoint: "/api/start",
      requestData: {
        tts,
        use_tagger: String(useTagger),
        detect_backchannels: String(detectBackchannels),
      },
    },
    initDevicesOnMount: true,
  }
}
