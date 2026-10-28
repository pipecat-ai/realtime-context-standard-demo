import type { TransportState } from "@pipecat-ai/client-js"
import { usePipecatClientTransportState } from "@pipecat-ai/client-react"
import { useState } from "react"

import { BotVoiceBars } from "@/components/bot-voice-bars"
import { BotAudioControl } from "@/components/pipecat/bot-audio"
import { UserAudioControl } from "@/components/pipecat/user-audio-control"
import { CallButton } from "@/components/call-button"
import { SessionOptions } from "@/components/session-options"
import {
  AmbientBackground,
  ambientPalette,
  DEFAULT_AMBIENT_PALETTE,
  PalettePicker,
} from "@/glass"
import { useAgentStatus } from "@/hooks/use-agent-status"
import { cn } from "@/lib/utils"

/** The Deepgram demo's outline button: a 1.5px white ring on no fill. */
const OUTLINE_PILL =
  "border-[1.5px] dark:border-foreground/85 dark:bg-transparent"

/** States the call button can start a session from. */
const CONNECTABLE: TransportState[] = ["initialized", "disconnected", "error"]

interface StageProps {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  error: string | null
  className?: string
}

/** The agent on the ambient background: its voice, status and call button. */
export function Stage({ connect, disconnect, error, className }: StageProps) {
  const transportState = usePipecatClientTransportState()
  const status = useAgentStatus()
  const [paletteId, setPaletteId] = useState(DEFAULT_AMBIENT_PALETTE)
  const connectable = CONNECTABLE.includes(transportState)

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <section
        aria-label="Voice agent"
        className="on-ambient flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-card"
      >
        <AmbientBackground
          palette={ambientPalette(paletteId)}
          className="flex min-h-0 flex-1 flex-col items-center p-4 sm:p-6"
        >
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <BotVoiceBars
              status={status}
              className="h-full max-h-105 w-[min(100%,640px)]"
            />
          </div>
          <p role="status" className="readout-label mt-3" aria-live="polite">
            {error ?? status}
          </p>
          <CallButton
            status={status}
            connectable={connectable}
            onClick={() => void (connectable ? connect() : disconnect())}
            disabled={
              transportState === "initializing" ||
              transportState === "disconnecting"
            }
            className="mt-5"
          />
        </AmbientBackground>
      </section>
      <footer className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <UserAudioControl variant="ghost" size="lg" />
          <BotAudioControl
            size="icon-lg"
            variant="outline"
            align="center"
            sliderProps={{ orientation: "vertical" }}
            className={OUTLINE_PILL}
          />
          <SessionOptions disabled={!connectable} />
        </div>
        <PalettePicker
          value={paletteId}
          onChange={setPaletteId}
          className="ml-auto"
        />
      </footer>
    </div>
  )
}
