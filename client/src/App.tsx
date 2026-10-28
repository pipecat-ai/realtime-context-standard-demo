import { PipecatClientProvider } from "@pipecat-ai/client-react"
import { useShallow } from "zustand/react/shallow"

import { Header } from "@/components/header"
import { BotAudioOutput } from "@/components/pipecat/bot-audio"
import { SidePanel } from "@/components/side-panel"
import { Stage } from "@/components/stage"
import { useExpressionEvents } from "@/hooks/use-expression-events"
import { usePipecatApp } from "@/hooks/use-pipecat-app"
import { sessionOptions } from "@/lib/session-config"
import { useSessionStore } from "@/stores/session-store"

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
 * One screen, never scrolled: the stage on the left and the transcript, mood,
 * tool calls and metrics on the right, or below lg, the stage over the panel
 * the tab bar picks.
 */
function Session(props: SessionProps) {
  useExpressionEvents()

  return (
    <div className="flex h-dvh flex-col gap-3 p-3 sm:p-4 lg:flex-row">
      <div className="flex min-w-0 shrink-0 flex-col gap-3 lg:min-h-0 lg:flex-1">
        <Header className="h-10" />
        <Stage {...props} className="lg:flex-1" />
      </div>
      <SidePanel className={SIDE_PANEL} />
    </div>
  )
}

export function App() {
  const { tts, useTagger } = useSessionStore(
    useShallow(({ tts, useTagger }) => ({ tts, useTagger }))
  )
  const { client, connect, disconnect, error } = usePipecatApp(
    sessionOptions(tts, useTagger)
  )

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
