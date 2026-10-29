import { useGlassPane, useGlassScene } from "@/glass"
import type { AgentStatus } from "@/hooks/use-agent-status"
import { cn } from "@/lib/utils"

/**
 * Whose turn it is, in the timeline's colours: the caller's blue while Sam
 * listens, Sam's lavender while it thinks and speaks.
 */
const DOT: Record<AgentStatus, string> = {
  idle: "bg-foreground/40",
  connecting: "bg-foreground motion-safe:animate-pulse",
  listening: "bg-client",
  thinking: "bg-agent motion-safe:animate-pulse",
  speaking: "bg-agent",
}

export interface StatusBadgeProps {
  status: AgentStatus
  /** Shown in place of the status, until the next call. */
  error?: string | null
  className?: string
}

/**
 * The agent's status on a pane of glass. Inside an AmbientBackground, which
 * draws the glass; without WebGL2, a frosted fill.
 */
export function StatusBadge({ status, error, className }: StatusBadgeProps) {
  const scene = useGlassScene()
  const glassRef = useGlassPane()

  return (
    <p
      ref={glassRef}
      role="status"
      aria-live="polite"
      className={cn(
        // As tall as the controls beside it; an error can wrap.
        "flex min-h-9 items-center gap-2 rounded-full px-3.5 py-1.5",
        !scene && "bg-foreground/10 inset-ring inset-ring-foreground/35",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          error ? "bg-inactive" : DOT[status]
        )}
      />
      <span className="readout-label text-foreground">{error ?? status}</span>
    </p>
  )
}
