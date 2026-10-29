import { RTVIEvent } from "@pipecat-ai/client-js"
import {
  PipecatClientProvider,
  usePipecatClientTransportState,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react"
import { useEffect, useState } from "react"

import { ModeDialog } from "@/components/mode-dialog"
import { BotAudioOutput } from "@/components/pipecat/bot-audio"
import { SidePanel } from "@/components/side-panel"
import { Stage } from "@/components/stage"
import { Timeline } from "@/components/timeline"
import { useExpressionEvents } from "@/hooks/use-expression-events"
import { usePipecatApp } from "@/hooks/use-pipecat-app"
import { demoCaller, isDemo } from "@/lib/demo"
import { sessionOptions } from "@/lib/session-config"
import { lipsync } from "@/stores/avatar-store"
import { useSessionStore, type Mode } from "@/stores/session-store"

/**
 * Below lg, the rest of the screen under the stage. Beside it, the panel
 * takes 38% of the window: at least 26rem, so the stage keeps the larger
 * share on laptops, and at most 48rem, so wide displays give the transcript
 * room without starving the stage.
 */
const SIDE_PANEL = "flex-1 lg:w-[clamp(26rem,38vw,48rem)] lg:flex-none"

interface SessionProps {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  error: string | null
}

/**
 * One screen, never scrolled: the stage over the timeline on the left and the
 * transcript, mood, tool calls and metrics on the right, or below lg, the
 * stage and timeline over the panel the tab bar picks. The side panel runs
 * to the window's edges; only the stage's side is inset, and on phones the
 * stage runs to them too, square, leaving only the timeline inset.
 */
function Session(props: SessionProps) {
  useExpressionEvents()
  const { connect } = props
  const transportState = usePipecatClientTransportState()
  const setMode = useSessionStore((state) => state.setMode)
  // Outside a demo, the call's mode is picked on landing.
  const [choosing, setChoosing] = useState(!isDemo)

  const pick = (mode: Mode) => {
    setMode(mode)
    setChoosing(false)
    // In the tap, as the call button does. The client may still be waiting
    // on the mic, and then the call button starts the call.
    if (transportState !== "initialized") return
    lipsync.resume()
    void connect()
  }

  // A demo starts itself where the browser lets it play without a tap.
  useEffect(() => {
    if (!demoCaller?.unlocked) return
    lipsync.resume()
    void connect()
  }, [connect])

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <div className="flex min-w-0 shrink-0 flex-col gap-3 pb-3 sm:p-4 lg:min-h-0 lg:flex-1">
        <Stage {...props} className="max-sm:rounded-none lg:flex-1" />
        {/* The timeline keeps room above its lanes for backchannel labels,
            which on phones is gap enough, so it takes back the column's. */}
        <Timeline className="shrink-0 max-sm:-mt-3 max-sm:px-3" />
      </div>
      <SidePanel className={SIDE_PANEL} />
      <ModeDialog open={choosing} onPick={pick} />
      {demoCaller && <DemoCallerAudio />}
    </div>
  )
}

/** Plays a demo's caller, whose audio the bot sends as it goes. */
function DemoCallerAudio() {
  useRTVIClientEvent(RTVIEvent.ServerMessage, demoCaller?.onServerMessage)
  return null
}

export function App() {
  const { client, connect, disconnect, error } = usePipecatApp(sessionOptions())

  if (!client) {
    return (
      <p className="flex h-dvh items-center justify-center font-mono text-xs text-muted-foreground">
        {error ?? "starting client…"}
      </p>
    )
  }

  return (
    <PipecatClientProvider client={client}>
      <Session connect={connect} disconnect={disconnect} error={error} />
      {/* The bot's audio, at the volume control's level. */}
      <BotAudioOutput />
    </PipecatClientProvider>
  )
}
