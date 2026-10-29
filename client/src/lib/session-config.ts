import type { UsePipecatAppOptions } from "@/hooks/use-pipecat-app"
import { isDemo } from "@/lib/demo"
import { lipsync } from "@/stores/avatar-store"
import { useSessionStore } from "@/stores/session-store"

/** Must match the start endpoint, which reads the same variable. */
const BOT_TRANSPORT =
  import.meta.env.VITE_BOT_TRANSPORT === "daily" ? "daily" : "smallwebrtc"

/**
 * Sessions start at /api/start (server/bot-api.ts), which holds the bot's
 * location and key and passes on only the bot's own options. Only the
 * configured transport is loaded. A demo has no mic: its caller is the bot's.
 */
export function sessionOptions(): UsePipecatAppOptions {
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
      // Read as each session starts, so a mode picked in the same tap counts.
      get requestData() {
        const { tts, useTagger, detectBackchannels } =
          useSessionStore.getState()
        return {
          tts,
          use_tagger: String(useTagger),
          detect_backchannels: String(detectBackchannels),
          demo: String(isDemo),
        }
      },
    },
    clientOptions: { callbacks: lipsync.callbacks, enableMic: !isDemo },
    initDevicesOnMount: !isDemo,
  }
}
