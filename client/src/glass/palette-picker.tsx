import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import {
  AMBIENT_PALETTES,
  ambientGradient,
  ambientPalette,
  type AmbientPalette,
} from "./palettes"

/** A swatch and the gap after it, in px: how far each option travels out. */
const STEP = 32

/**
 * Below this there's no room on the footer's row for the options, so they
 * spring upward instead.
 */
const SIDEWAYS_QUERY = "(min-width: 40rem)"

/** The options spring out, overshooting a little, the nearest first. */
const SPRING = { type: "spring", bounce: 0.45, duration: 0.5 } as const
const STAGGER = 0.035

/**
 * Round on purpose, like the glass controls. The hairline rim keeps the
 * dark palettes off the black page.
 */
const SWATCH =
  "size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]"

export interface PalettePickerProps {
  value: AmbientPalette["id"]
  onChange: (id: AmbientPalette["id"]) => void
  className?: string
}

/**
 * The background palette as one swatch, ringed. Clicking it springs the
 * other palettes out to its left (upward on phones); picking one, clicking
 * elsewhere or Escape draws them back in.
 */
export function PalettePicker({
  value,
  onChange,
  className,
}: PalettePickerProps) {
  const [open, setOpen] = useState(false)
  const [upward, setUpward] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionsId = useId()
  const reduceMotion = useReducedMotion()
  const current = ambientPalette(value)
  const others = AMBIENT_PALETTES.filter((palette) => palette.id !== value)

  // A click anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (event.target instanceof Node && root?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) close()
      }}
      className={cn("relative flex", className)}
    >
      <motion.button
        ref={triggerRef}
        type="button"
        aria-label={`Background: ${current.name}`}
        title={current.name}
        aria-expanded={open}
        aria-controls={optionsId}
        onClick={() => {
          if (!open) setUpward(!window.matchMedia(SIDEWAYS_QUERY).matches)
          setOpen(!open)
        }}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.9 }}
        className="relative size-5 rounded-full ring-[1.5px] ring-foreground ring-offset-[3px] ring-offset-background outline-none focus-visible:ring-[2px]"
      >
        {/* A new pick pops in. */}
        <AnimatePresence initial={false}>
          <motion.span
            key={current.id}
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0.15 } : SPRING}
            className={cn(SWATCH, "absolute inset-0")}
            style={{ backgroundImage: ambientGradient(current) }}
          />
        </AnimatePresence>
      </motion.button>

      {/* Out of the flow, so opening doesn't move the footer. Nearest the
          swatch first, so Tab reaches them in order. */}
      <div
        id={optionsId}
        role="group"
        aria-label="Backgrounds"
        className={cn(
          "absolute flex gap-3",
          upward
            ? "bottom-full left-0 mb-3 flex-col-reverse"
            : "top-0 right-full mr-3 flex-row-reverse"
        )}
      >
        <AnimatePresence>
          {open &&
            others.map((palette, index) => {
              // Tucked behind the current swatch.
              const offset = (index + 1) * STEP
              const away = {
                x: upward ? 0 : offset,
                y: upward ? offset : 0,
                scale: 0.3,
                opacity: 0,
              }
              return (
                <motion.button
                  key={palette.id}
                  type="button"
                  aria-label={palette.name}
                  title={palette.name}
                  onClick={() => {
                    onChange(palette.id)
                    close()
                  }}
                  initial={reduceMotion ? { opacity: 0 } : away}
                  animate={{
                    x: 0,
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    transition: reduceMotion
                      ? { duration: 0.15 }
                      : { ...SPRING, delay: index * STAGGER },
                  }}
                  exit={
                    reduceMotion
                      ? { opacity: 0, transition: { duration: 0.15 } }
                      : {
                          ...away,
                          transition: {
                            duration: 0.18,
                            ease: "easeIn",
                            delay: (others.length - 1 - index) * 0.02,
                          },
                        }
                  }
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    SWATCH,
                    "ring-offset-[3px] ring-offset-background outline-none focus-visible:ring-[1.5px] focus-visible:ring-foreground/60"
                  )}
                  style={{ backgroundImage: ambientGradient(palette) }}
                />
              )
            })}
        </AnimatePresence>
      </div>
    </div>
  )
}
