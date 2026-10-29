import { RTVIEvent, type TransportState } from "@pipecat-ai/client-js"
import {
  usePipecatClientTransportState,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react"
import { useState } from "react"

export type AgentStatus =
  "idle" | "connecting" | "listening" | "thinking" | "speaking" | "waking"

/** Excludes "initializing": devices init on load, before any session. */
const CONNECTING: TransportState[] = [
  "authenticating",
  "authenticated",
  "connecting",
  "connected",
]

/** The bot's word on its LLM: waking, or ready (server/cold_start.py). */
const LLM_STATUS = "llm-status"

type Turn = "user" | "thinking" | "bot" | null

/**
 * Whether the call's LLM is still waking, which from zero can take minutes:
 * PhoneLLM Mini, in Tagger mode. Through the holding lines Sam says and
 * whatever the caller says meanwhile.
 */
export function useLlmWaking(): boolean {
  const [waking, setWaking] = useState(false)

  useRTVIClientEvent(RTVIEvent.Connected, () => setWaking(false))
  useRTVIClientEvent(RTVIEvent.Disconnected, () => setWaking(false))
  useRTVIClientEvent(RTVIEvent.ServerMessage, (data: unknown) => {
    const message = data as { type?: string; status?: string } | null
    if (message?.type === LLM_STATUS) setWaking(message.status === "waking")
  })

  return waking
}

/**
 * What the agent is doing, from the transport state and the turn events, and
 * while its LLM wakes, that, between the lines either side says.
 */
export function useAgentStatus(): AgentStatus {
  const transportState = usePipecatClientTransportState()
  const [turn, setTurn] = useState<Turn>(null)
  const waking = useLlmWaking()

  useRTVIClientEvent(RTVIEvent.Connected, () => setTurn(null))
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, () => setTurn("user"))
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, () => setTurn("thinking"))
  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, () => setTurn("bot"))
  useRTVIClientEvent(RTVIEvent.BotStoppedSpeaking, () => setTurn(null))

  if (CONNECTING.includes(transportState)) return "connecting"
  if (transportState !== "ready") return "idle"
  if (turn === "bot") return "speaking"
  if (turn === "user") return "listening"
  if (waking) return "waking"
  if (turn === "thinking") return "thinking"
  return "listening"
}
