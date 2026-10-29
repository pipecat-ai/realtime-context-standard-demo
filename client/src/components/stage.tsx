import type { TransportState } from "@pipecat-ai/client-js"
import { usePipecatClientTransportState } from "@pipecat-ai/client-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"

import { BotAvatar } from "@/components/bot-avatar"
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
import { lipsync } from "@/stores/avatar-store"

/** The Deepgram demo's outline button: a 1.5px white ring on no fill. */
const OUTLINE_PILL =
  "border-[1.5px] dark:border-foreground/85 dark:bg-transparent"

/** States the call button can start a session from. */
const CONNECTABLE: TransportState[] = ["initialized", "disconnected", "error"]

/** A fade only, which reduced motion keeps. */
const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
}

interface StageProps {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  error: string | null
  className?: string
}

/** The agent on the ambient background: its face, status and call button. */
export function Stage({ connect, disconnect, error, className }: StageProps) {
  const transportState = usePipecatClientTransportState()
  const status = useAgentStatus()
  const [paletteId, setPaletteId] = useState(DEFAULT_AMBIENT_PALETTE)
  const connectable = CONNECTABLE.includes(transportState)

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {/* Below lg a band of the screen, 40% of its height, enough for Sam's
          lips to be read, but never short of the call button, leaving the
          rest to the panels; beside them, all the height there is. */}
      <section
        aria-label="Voice agent"
        className="on-ambient flex h-[40dvh] min-h-40 flex-col overflow-hidden rounded-[28px] bg-card lg:h-auto lg:min-h-0 lg:flex-1"
      >
        <AmbientBackground
          palette={ambientPalette(paletteId)}
          className="flex min-h-0 flex-1 flex-col items-center p-4 sm:p-6"
        >
          <BotAvatar className="min-h-0 w-full flex-1" />
          <p role="status" className="readout-label mt-3" aria-live="polite">
            {error ?? status}
          </p>
          <CallButton
            status={status}
            connectable={connectable}
            onClick={() => {
              if (!connectable) return void disconnect()
              // In the tap, so the browser lets the mouth hear the voice.
              lipsync.resume()
              void connect()
            }}
            disabled={
              transportState === "initializing" ||
              transportState === "disconnecting"
            }
            className="mt-5"
          />
        </AmbientBackground>
      </section>
      <footer className="flex min-h-12 shrink-0 flex-wrap items-center gap-3">
        <UserAudioControl variant="ghost" size="lg" />
        <BotAudioControl
          size="icon-lg"
          variant="outline"
          align="center"
          sliderProps={{ orientation: "vertical" }}
          className={OUTLINE_PILL}
        />
        {/* The bot reads them at the start of a session, so they're gone
            while one is up. Below lg, on a row of their own under the
            audio controls and palette. */}
        <AnimatePresence initial={false}>
          {connectable && (
            <motion.div
              key="session-options"
              {...FADE}
              className="max-lg:order-last max-lg:w-full"
            >
              <SessionOptions />
            </motion.div>
          )}
        </AnimatePresence>
        <PalettePicker
          value={paletteId}
          onChange={setPaletteId}
          className="ml-auto"
        />
      </footer>
    </div>
  )
}
