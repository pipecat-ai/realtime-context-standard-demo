import { usePipecatClientMediaTrack } from "@pipecat-ai/client-react"

import { GlassVoiceBars } from "@/glass"
import type { AgentStatus } from "@/hooks/use-agent-status"

/** The bot's voice as glass bars. */
export function BotVoiceBars({
  status,
  className,
}: {
  status: AgentStatus
  className?: string
}) {
  const botTrack = usePipecatClientMediaTrack("audio", "bot")

  return (
    <GlassVoiceBars
      track={botTrack}
      isConnecting={status === "connecting"}
      isThinking={status === "thinking"}
      // Before a call, the light behind the glass follows the mouse.
      backlight={status === "idle" ? "pointer" : null}
      fallbackColor="--agent"
      className={className}
    />
  )
}
