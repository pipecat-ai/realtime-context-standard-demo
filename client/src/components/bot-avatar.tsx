import { usePipecatClientMediaTrack } from "@pipecat-ai/client-react"
import { useEffect } from "react"

import { Avatar } from "@/avatar-runtime/avatar-react.js"
import { useAvatarCues } from "@/hooks/use-avatar-cues"
import { cn } from "@/lib/utils"
import { lipsync, useAvatarStore } from "@/stores/avatar-store"

/**
 * Sam's face, which speaks with the bot's voice, and shows the expression and
 * gesture Jev picks for each line. The bust is cut off at the canvas's bottom
 * edge, so it fades out there. Hidden from screen readers: the status line
 * says what Sam is doing.
 */
export function BotAvatar({ className }: { className?: string }) {
  const botTrack = usePipecatClientMediaTrack("audio", "bot")
  useAvatarCues()

  // The mouth follows the voice as it's heard (lib/lipsync-aligner.ts).
  useEffect(() => (botTrack ? lipsync.listen(botTrack) : undefined), [botTrack])

  return (
    <div
      aria-hidden
      className={cn("mask-b-from-80% mask-b-to-100%", className)}
    >
      <Avatar store={useAvatarStore} className="size-full" />
    </div>
  )
}
