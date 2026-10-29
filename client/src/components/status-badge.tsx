import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { MoodIcon } from "@/components/mood-icon"
import { useGlassPane, useGlassScene } from "@/glass"
import type { AgentStatus } from "@/hooks/use-agent-status"
import { moodPalette } from "@/lib/mood-palette"
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

/** How much bigger a new face starts, as big as the badge is tall. */
const START_SCALE = 2

/** Seconds a new face shows big, long enough to be read. */
const HOLD = 0.35

/** It fades in big, */
const APPEAR = { duration: 0.12 } as const

/** then falls into place with a little bounce, */
const FALL = {
  type: "spring",
  bounce: 0.5,
  duration: 0.6,
  delay: HOLD,
} as const

/** and its chip fades as it lands. */
const FADE = { delay: HOLD + 0.25, duration: 0.4 } as const

/**
 * Sam's face, too small to read in passing: so a new one starts big, on a
 * chip of the stage's light for its mood, and falls back into the badge. Under
 * reduced motion, just the chip.
 */
function Face({ expression }: { expression: string }) {
  const reduceMotion = useReducedMotion()
  const { glow } = moodPalette(expression)

  return (
    // Holds the face's place in the row; the chip overhangs it a little.
    <span aria-hidden className="relative size-4 shrink-0">
      <AnimatePresence initial={false}>
        <motion.span
          key={expression}
          initial={{
            opacity: 0,
            scale: reduceMotion ? 1 : START_SCALE,
            backgroundColor: glow,
            color: "var(--glow-foreground)",
          }}
          // To the glow, clear, so the fade keeps its hue.
          animate={{
            opacity: 1,
            scale: 1,
            backgroundColor: `${glow}00`,
            color: "var(--foreground)",
          }}
          exit={{ opacity: 0, transition: { duration: 0 } }}
          transition={{
            opacity: APPEAR,
            scale: FALL,
            backgroundColor: FADE,
            color: FADE,
          }}
          className="absolute -inset-0.5 grid place-items-center rounded-full"
        >
          <MoodIcon expression={expression} className="size-4" />
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export interface StatusBadgeProps {
  status: AgentStatus
  /** Sam's expression, shown as a face after the status. */
  expression: string
  /** Shown in place of the status and face, until the next call. */
  error?: string | null
  className?: string
}

/**
 * The agent's status and the face it's making, on a pane of glass. Inside an
 * AmbientBackground, which draws the glass; without WebGL2, a frosted fill.
 */
export function StatusBadge({
  status,
  expression,
  error,
  className,
}: StatusBadgeProps) {
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
      {/* Not announced: the face changes with nearly every line Sam says. */}
      {!error && (
        <>
          <span aria-hidden className="readout-label text-foreground/40">
            •
          </span>
          <Face expression={expression} />
        </>
      )}
    </p>
  )
}
