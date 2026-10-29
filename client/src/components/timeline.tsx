import { DuplexTimeline } from "@/components/pipecat/duplex-timeline"
import { cn } from "@/lib/utils"

/** As the transcript names them. */
const AGENT_LABEL = "sam"
const USER_LABEL = "you"

/**
 * Both voices on one clock: who spoke when, the backchannels, where the
 * caller talked over Sam, and how long each reply took. On the page, not in a
 * card, inset like the stage's content so the lane labels line up with it.
 */
export function Timeline({ className }: { className?: string }) {
  return (
    <section aria-label="Timeline" className={cn("px-4 sm:px-6", className)}>
      <DuplexTimeline
        noLegend
        agentLabel={AGENT_LABEL}
        userLabel={USER_LABEL}
        agentColor="--agent"
        userColor="--client"
      />
    </section>
  )
}
