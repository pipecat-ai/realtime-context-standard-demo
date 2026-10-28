import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

import { PANE_FROST, PANE_LOOK, type FrostLook, type GlassLook } from "./optics"
import { useGlassPane, useGlassScene } from "./scene"

/** Hover cells for the pointer light; glass-button.css has a rule for each. */
const TRACK_COLUMNS = Array.from({ length: 12 }, (_, i) => `c${String(i)}`)
const TRACK_ROWS = Array.from({ length: 5 }, (_, i) => `r${String(i)}`)

function HoverLight() {
  return (
    <>
      <span className="glass-layer glass-glare" aria-hidden />
      <span className="glass-layer glass-rim" aria-hidden />
      <span className="glass-track" aria-hidden>
        {TRACK_COLUMNS.map((column) => (
          <span key={column}>
            {TRACK_ROWS.map((row) => (
              <span key={row} />
            ))}
          </span>
        ))}
      </span>
    </>
  )
}

export interface GlassButtonProps extends Omit<
  ComponentProps<"button">,
  "ref"
> {
  look?: GlassLook
  /** The glass under a `data-glass-frost` child. */
  frost?: FrostLook
}

/**
 * A button of Figma-style glass, drawn by the enclosing AmbientBackground,
 * with a light that follows the pointer. A pill unless given another
 * radius; mark one round child `data-glass-frost` for a frostier disc.
 */
export function GlassButton({
  look = PANE_LOOK,
  frost = PANE_FROST,
  type = "button",
  className,
  children,
  ...props
}: GlassButtonProps) {
  const scene = useGlassScene()
  const glassRef = useGlassPane(look, frost)

  return (
    <button
      ref={glassRef}
      type={type}
      data-glass={scene ? undefined : "flat"}
      className={cn("glass-button", className)}
      {...props}
    >
      <HoverLight />
      {children}
    </button>
  )
}
