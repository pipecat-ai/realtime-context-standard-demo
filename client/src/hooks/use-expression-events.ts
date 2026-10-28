import { RTVIEvent } from "@pipecat-ai/client-js"
import { useRTVIClientEvent } from "@pipecat-ai/client-react"

import { useExpressionStore } from "@/stores/expression-store"

/** Feeds the expression store from RTVI; mount once, inside the provider. */
export function useExpressionEvents() {
  const userInput = useExpressionStore((state) => state.userInput)
  const botOutput = useExpressionStore((state) => state.botOutput)
  const serverMessage = useExpressionStore((state) => state.serverMessage)
  const reset = useExpressionStore((state) => state.reset)

  useRTVIClientEvent(RTVIEvent.UserInput, userInput)
  useRTVIClientEvent(RTVIEvent.BotOutput, botOutput)
  useRTVIClientEvent(RTVIEvent.ServerMessage, serverMessage)
  useRTVIClientEvent(RTVIEvent.Connected, reset)
}
