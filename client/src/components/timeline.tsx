import { DuplexTimeline } from "@/components/pipecat/duplex-timeline"
import { demoCaller, USER_NAME } from "@/lib/demo"

/** As the transcript names them. */
const AGENT_LABEL = "sam"

/**
 * Both voices on one clock: who spoke when, the backchannels, where the
 * caller talked over Sam, and how long each reply took. On the page, not in a
 * card, edge to edge with the voice agent panel above it.
 */
export function Timeline({ className }: { className?: string }) {
  return (
    <section aria-label="Timeline" className={className}>
      <DuplexTimeline
        noLegend
        agentLabel={AGENT_LABEL}
        userLabel={USER_NAME}
        // A demo's caller is the bot's, not the mic.
        userTrack={demoCaller?.track}
        agentColor="--agent"
        userColor="--client"
      />
    </section>
  )
}
