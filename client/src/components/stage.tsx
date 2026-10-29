import type { TransportState } from "@pipecat-ai/client-js"
import {
  usePipecatClientMicControl,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react"

import { BotAvatar } from "@/components/bot-avatar"
import { BotAudioControl } from "@/components/pipecat/bot-audio"
import { UserAudioControl } from "@/components/pipecat/user-audio-control"
import { CallButton } from "@/components/call-button"
import { SettingsButton } from "@/components/settings-button"
import { StatusBadge } from "@/components/status-badge"
import { WakingNotice } from "@/components/waking-notice"
import { AmbientBackground } from "@/glass"
import { useAgentStatus, useLlmWaking } from "@/hooks/use-agent-status"
import { demoCaller, isDemo } from "@/lib/demo"
import { moodPalette } from "@/lib/mood-palette"
import { cn } from "@/lib/utils"
import { lipsync, useAvatarStore } from "@/stores/avatar-store"
import { useSessionStore } from "@/stores/session-store"

/** The Deepgram demo's outline button: a 1.5px white ring on no fill. */
const OUTLINE_PILL =
  "border-[1.5px] dark:border-foreground/85 dark:bg-transparent"

/**
 * The mic's level bars: live green, or muted, dark on the pill's pink fill
 * (styles/kit.css). The control's ghost variant would draw them pink, and the
 * fill would hide them.
 */
const MIC_BARS = {
  live: "--active-background",
  muted: "--inactive-foreground",
}

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
 * volume and settings in the top corners (on phones, just the mic).
 */
export function Stage({ connect, disconnect, error, className }: StageProps) {
  const transportState = usePipecatClientTransportState()
  const status = useAgentStatus()
  const waking = useLlmWaking()
  const expression = useAvatarStore((state) => state.expression)
  const { isMicEnabled } = usePipecatClientMicControl()
  const setMode = useSessionStore((state) => state.setMode)
  const connectable = CONNECTABLE.includes(transportState)

  // While Tagger mode's model wakes: a new call in LLM mode, from the tap, as
  // the call button starts one.
  const switchToLlm = async () => {
    lipsync.resume()
    await disconnect()
    setMode("llm")
    await connect()
  }

  return (
    // Below lg a band of the screen, 40% of its height, enough for Sam's lips
    // to be read, but never short of the controls, leaving the rest to the
    // panels; beside them, all the height there is.
    <section
      aria-label="Voice agent"
      className={cn(
        "on-ambient flex h-[40dvh] min-h-64 flex-col overflow-hidden rounded-stage bg-card lg:h-auto lg:min-h-0 lg:flex-1",
        className
      )}
    >
      <AmbientBackground
        palette={moodPalette(expression)}
        className="flex min-h-0 flex-1 flex-col items-center p-4 sm:p-6"
      >
        {/* Over the avatar's corners, in the background's padding, so the
            face keeps the full height. Lifted, since the avatar's mask
            stacks it above anything unlifted before it. Phones keep only the
            mic, off Sam's face: the status is still announced, and shown
            when it's an error; the phone has its own volume. */}
        <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-center justify-between gap-3 sm:inset-x-6 sm:top-6">
          <StatusBadge
            status={status}
            expression={expression}
            error={error}
            // Without its min height, the hidden badge's glass is a speck.
            className={cn("min-w-0", !error && "max-sm:sr-only max-sm:min-h-0")}
          />
          {/* Right-aligned even when a long mic error wraps it under. A
              demo has no mic, and its options are set by its URL. */}
          <div className="ml-auto flex items-center gap-3">
            {!isDemo && (
              <UserAudioControl
                variant="ghost"
                size="lg"
                visualizerProps={{
                  barColor: isMicEnabled ? MIC_BARS.live : MIC_BARS.muted,
                }}
              />
            )}
            <BotAudioControl
              size="icon-lg"
              variant="outline"
              align="center"
              sliderProps={{ orientation: "vertical" }}
              className={cn(OUTLINE_PILL, "max-sm:hidden")}
            />
            {!isDemo && (
              <SettingsButton
                locked={!connectable}
                className={cn(OUTLINE_PILL, "max-sm:hidden")}
              />
            )}
          </div>
        </div>
        <div className="relative flex min-h-0 w-full flex-1 flex-col">
          <BotAvatar className="min-h-0 w-full flex-1 drop-shadow-avatar" />
          {/* Over Sam's shoulders. A phone's stage is too short for that,
              so there it takes a row of its own and Sam makes room. */}
          {waking && (
            <WakingNotice
              onSwitch={() => void switchToLlm()}
              className="z-10 mx-auto mt-3 w-fit shrink-0 sm:absolute sm:inset-x-0 sm:bottom-0 sm:mt-0"
            />
          )}
        </div>
        <CallButton
          status={status}
          connectable={connectable}
          onClick={() => {
            if (!connectable) return void disconnect()
            // In the tap, so the browser lets the mouth hear the voice, and
            // a demo's caller be heard.
            lipsync.resume()
            demoCaller?.resume()
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
