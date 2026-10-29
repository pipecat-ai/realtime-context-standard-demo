import { useId } from "react"

import { Button } from "@/components/ui/button"
import { isDemo } from "@/lib/demo"
import { cn } from "@/lib/utils"

/** What the notice says: only Tagger mode's PhoneLLM Mini sleeps. */
const WAKING = "PhoneLLM Mini is waking up. It can take a few minutes."
const SWITCH = "Use LLM mode"
const SWITCH_DETAIL = "Ends this call and starts one in LLM mode."

export interface WakingNoticeProps {
  /** Ends the call and starts one in LLM mode. */
  onSwitch: () => void
  className?: string
}

/**
 * While Sam's LLM wakes: what's happening, and a way out to LLM mode, whose
 * model never sleeps (but not in a demo, which is scripted for Tagger mode).
 * Over Sam, so frosted in CSS: the ambient glass is drawn behind the avatar.
 */
export function WakingNotice({ onSwitch, className }: WakingNoticeProps) {
  const detailId = useId()

  return (
    <div
      className={cn(
        "flex max-w-md items-center gap-3 rounded-3xl bg-black/45 py-1.5 pl-4 inset-ring inset-ring-foreground/15 backdrop-blur-md",
        isDemo ? "pr-4" : "pr-1.5",
        className
      )}
    >
      <p className="py-1 text-xs leading-snug text-pretty sm:text-sm">
        {WAKING}
      </p>
      {!isDemo && (
        <>
          <Button
            variant="outline"
            onClick={onSwitch}
            aria-describedby={detailId}
            className="h-11 shrink-0 border-foreground/35 bg-foreground/12 px-4 text-sm inset-shadow-glass-edge hover:bg-foreground/22 dark:border-foreground/35 dark:bg-foreground/12 dark:hover:bg-foreground/22"
          >
            {SWITCH}
          </Button>
          <span id={detailId} className="sr-only">
            {SWITCH_DETAIL}
          </span>
        </>
      )}
    </div>
  )
}
