import { RTVIEvent, type TransportState } from "@pipecat-ai/client-js"
import {
  usePipecatClientTransportState,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react"
import { useState } from "react"

export type AgentStatus =
  "idle" | "connecting" | "listening" | "thinking" | "speaking"

/** Excludes "initializing": devices init on load, before any session. */
const CONNECTING: TransportState[] = [
  "authenticating",
  "authenticated",
  "connecting",
  "connected",
]

type Turn = "user" | "thinking" | "bot" | null

/** What the agent is doing, from the transport state and the turn events. */
export function useAgentStatus(): AgentStatus {
  const transportState = usePipecatClientTransportState()
  const [turn, setTurn] = useState<Turn>(null)

  useRTVIClientEvent(RTVIEvent.Connected, () => setTurn(null))
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, () => setTurn("user"))
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, () => setTurn("thinking"))
  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, () => setTurn("bot"))
  useRTVIClientEvent(RTVIEvent.BotStoppedSpeaking, () => setTurn(null))

  if (CONNECTING.includes(transportState)) return "connecting"
  if (transportState !== "ready") return "idle"
  if (turn === "bot") return "speaking"
  if (turn === "thinking") return "thinking"
  return "listening"
}
