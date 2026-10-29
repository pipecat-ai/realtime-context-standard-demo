import { PhoneIcon, PlayIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { RimSpark } from "@/components/rim-spark"
import { GlassButton } from "@/glass"
import type { AgentStatus } from "@/hooks/use-agent-status"
import { cn } from "@/lib/utils"

/** Seconds as mm:ss. */
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`

/** Time on the call; mounted when the call connects, so it starts at 00:00. */
function CallTimer() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const interval = setInterval(() => {
      setSeconds(Math.floor((performance.now() - start) / 1000))
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return <span className="tabular-nums">{clock(seconds)}</span>
}

export interface CallButtonProps {
  status: AgentStatus
  /** No session is up, so clicking starts one. */
  connectable: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
}

/** Starts and ends the call: Start or End, the time on the call, and a play or stop disc. */
export function CallButton({
  status,
  connectable,
  disabled,
  onClick,
  className,
}: CallButtonProps) {
  const connecting = status === "connecting"
  const label = connectable
    ? "Start call"
    : connecting
      ? "Cancel call"
      : "End call"

  return (
    <GlassButton
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-14 items-center pr-3.25 pl-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-60 sm:h-16 sm:pr-3.75 sm:pl-5",
        className
      )}
    >
      {/* Draws the eye to it while there's no call. */}
      {connectable && !disabled && <RimSpark />}
      <PhoneIcon
        className={cn(
          "size-5 fill-current text-active",
          connecting && "motion-safe:animate-pulse"
        )}
        aria-hidden
      />
      <span className="ml-2.5 text-xl leading-none font-medium tracking-tight text-shadow-lift">
        {connectable ? "Start" : "End"}
      </span>
      <span className="ml-3 text-sm leading-none font-medium text-foreground/85 tabular-nums">
        {!connectable && !connecting ? (
          <CallTimer />
        ) : connecting ? (
          "calling…"
        ) : (
          "00:00"
        )}
      </span>
      <span className="ml-3.5 h-6 w-px bg-foreground/35" aria-hidden />
      <span
        data-glass-frost
        className="ml-3.5 flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground/90"
        aria-hidden
      >
        {connectable ? (
          <PlayIcon className="ml-0.5 size-3 fill-current" />
        ) : (
          <span className="size-2.5 rounded-xs bg-foreground" />
        )}
      </span>
    </GlassButton>
  )
}
