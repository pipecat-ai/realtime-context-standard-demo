import { Metrics } from "@/components/metrics"
import { Mood } from "@/components/mood"
import { ToolCalls } from "@/components/tool-calls"
import { Transcript } from "@/components/transcript"
import { cn } from "@/lib/utils"

/** The session as it happens: the transcript, mood, tool calls and latency. */
export function SidePanel({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Session"
      className={cn("flex min-h-0 flex-col gap-3", className)}
    >
      <Transcript className="flex-1" />
      <Mood className="shrink-0" />
      <ToolCalls className="shrink-0" />
      <Metrics className="shrink-0" />
    </aside>
  )
}
