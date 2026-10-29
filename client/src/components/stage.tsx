import type { TransportState } from "@pipecat-ai/client-js"
import { usePipecatClientTransportState } from "@pipecat-ai/client-react"

import { BotAvatar } from "@/components/bot-avatar"
import { BotAudioControl } from "@/components/pipecat/bot-audio"
import { UserAudioControl } from "@/components/pipecat/user-audio-control"
import { CallButton } from "@/components/call-button"
import { SettingsButton } from "@/components/settings-button"
import { StatusBadge } from "@/components/status-badge"
import { AmbientBackground } from "@/glass"
import { useAgentStatus } from "@/hooks/use-agent-status"
import { moodPalette } from "@/lib/mood-palette"
import { cn } from "@/lib/utils"
import { lipsync, useAvatarStore } from "@/stores/avatar-store"

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

/**
 * The agent on the ambient background, which washes to the mood of its
 * expression: its face over the call button, with its status and the mic,
 * volume and settings in the top corners.
 */
export function Stage({ connect, disconnect, error, className }: StageProps) {
  const transportState = usePipecatClientTransportState()
  const status = useAgentStatus()
  const expression = useAvatarStore((state) => state.expression)
  const connectable = CONNECTABLE.includes(transportState)

  return (
    // Below lg a band of the screen, 40% of its height, enough for Sam's lips
    // to be read, but never short of the controls, leaving the rest to the
    // panels; beside them, all the height there is.
    <section
      aria-label="Voice agent"
      className={cn(
        "on-ambient flex h-[40dvh] min-h-64 flex-col overflow-hidden rounded-[28px] bg-card lg:h-auto lg:min-h-0 lg:flex-1",
        className
      )}
    >
      <AmbientBackground
        palette={moodPalette(expression)}
        className="flex min-h-0 flex-1 flex-col items-center p-4 sm:p-6"
      >
        {/* Over the avatar's corners, in the background's padding, so the
            face keeps the full height. Lifted, since the avatar's mask
            stacks it above anything unlifted before it. */}
        <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-center justify-between gap-3 sm:inset-x-6 sm:top-6">
          <StatusBadge status={status} error={error} className="min-w-0" />
          {/* Right-aligned even when a long mic error wraps it under. */}
          <div className="ml-auto flex items-center gap-3">
            <UserAudioControl variant="ghost" size="lg" />
            <BotAudioControl
              size="icon-lg"
              variant="outline"
              align="center"
              sliderProps={{ orientation: "vertical" }}
              className={OUTLINE_PILL}
            />
            <SettingsButton locked={!connectable} className={OUTLINE_PILL} />
          </div>
        </div>
        <BotAvatar className="min-h-0 w-full flex-1" />
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
          className="mt-5 sm:mt-6"
        />
      </AmbientBackground>
    </section>
  )
}
