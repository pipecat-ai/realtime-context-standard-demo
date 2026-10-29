import { RTVIEvent } from "@pipecat-ai/client-js"
import { useRTVIClientEvent } from "@pipecat-ai/client-react"

import { useAvatarCueStore } from "@/stores/avatar-cue-store"

/** Feeds the avatar's cues from RTVI; mount once, inside the provider. */
export function useAvatarCues() {
  const serverMessage = useAvatarCueStore((state) => state.serverMessage)
  const botOutput = useAvatarCueStore((state) => state.botOutput)
  const userStartedSpeaking = useAvatarCueStore(
    (state) => state.userStartedSpeaking
  )
  const botStartedSpeaking = useAvatarCueStore(
    (state) => state.botStartedSpeaking
  )
  const reset = useAvatarCueStore((state) => state.reset)

  useRTVIClientEvent(RTVIEvent.ServerMessage, serverMessage)
  useRTVIClientEvent(RTVIEvent.BotOutput, botOutput)
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, userStartedSpeaking)
  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, botStartedSpeaking)
  useRTVIClientEvent(RTVIEvent.Connected, reset)
  useRTVIClientEvent(RTVIEvent.Disconnected, reset)
}
