import { SettingsIcon } from "lucide-react"

import { SessionOptions } from "@/components/session-options"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface SettingsButtonProps {
  /** A call is up, so the session's options are fixed until it ends. */
  locked: boolean
  className?: string
}

/** A cog that opens the session's options. */
export function SettingsButton({ locked, className }: SettingsButtonProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Settings"
            // The trigger's data-slot replaces the button's, which the kit
            // rounds into a pill, so it's rounded here.
            className={cn(
              "rounded-full *:transition-transform *:duration-300 data-popup-open:*:rotate-90 motion-reduce:*:transition-none",
              className
            )}
          >
            <SettingsIcon />
          </Button>
        }
      />
      {/* At the stage's right edge, so it opens leftward. */}
      <PopoverContent align="end" className="w-84 gap-0">
        <div className="p-1">
          <SessionOptions locked={locked} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
