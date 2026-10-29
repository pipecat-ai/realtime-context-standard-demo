/**
 * Meters for readings and latency. The rules they keep: a reading is lit
 * square segments, never a smooth bar, with its number beside it, and the
 * latest bar is at full strength with history a trail. Styles are
 * styles/meters.css.
 */
import { useState, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

const clamp01 = (value: number) => Math.max(0, Math.min(1, value || 0))

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export interface SegmentsProps {
  /** 0–1: the first round(value × count) segments are lit. */
  value: number
  color?: string
  count?: number
  /** Segment size in px. */
  size?: number
  gap?: number
  /** Makes it a labelled role="meter"; without it the meter is decorative. */
  label?: string
  className?: string
}

/**
 * A row of square segments. When the value moves, the segments that change
 * light up or go out one after another, 45ms apart, each popping in the
 * direction it went.
 */
export function Segments({
  value,
  color = "var(--foreground)",
  count = 10,
  size = 6,
  gap = 2,
  label,
  className,
}: SegmentsProps) {
  const filled = Math.round(clamp01(value) * count)
  // The last change, kept across renders so its wave can play out.
  const [wave, setWave] = useState({ from: filled, to: filled, n: 0 })
  if (wave.to !== filled) {
    setWave({ from: wave.to, to: filled, n: wave.n + 1 })
  }
  const { from, to, n } = wave
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const up = to > from

  return (
    <span
      className={cn("readout-seg", className)}
      style={{ gap }}
      {...(label
        ? {
            role: "meter",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": Math.round(clamp01(value) * 100),
          }
        : { "aria-hidden": true })}
    >
      {Array.from({ length: count }, (_, i) => {
        const moved = n > 0 && i >= lo && i < hi
        const order = up ? i - lo : hi - 1 - i
        return (
          <i
            key={moved ? `${i}-${n}` : i}
            className={moved ? "readout-pop" : undefined}
            style={
              {
                width: size,
                height: size,
                background: i < filled ? color : undefined,
                transitionDelay: moved ? `${order * 45}ms` : "0ms",
                animationDelay: moved ? `${order * 45}ms` : undefined,
                "--pop-y": up ? "-3px" : "3px",
              } as CSSProperties
            }
          />
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// MiniBars
// ---------------------------------------------------------------------------

export interface MiniBarsProps {
  values: number[]
  /** Scale top; defaults to the largest value. */
  max?: number
  height?: number
  color?: string
  label?: string
  className?: string
}

/** A tiny bar chart for inside a line: 3px bars 1px apart, the latest lit and the rest a trail. */
export function MiniBars({
  values,
  max,
  height = 16,
  color = "var(--agent)",
  label,
  className,
}: MiniBarsProps) {
  const top = max ?? Math.max(1, ...values)
  return (
    <span
      className={cn("readout-minibars", className)}
      style={{ height }}
      role="img"
      aria-label={label ?? values.join(", ")}
    >
      {values.map((value, i) => (
        <i
          // eslint-disable-next-line @eslint-react/no-array-index-key -- a bar is its slot
          key={i}
          style={{
            height: Math.max(1, Math.round((value / (top || 1)) * height)),
            background: color,
            opacity: i === values.length - 1 ? 1 : "var(--opacity-trail)",
          }}
        />
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// SectionLabel
// ---------------------------------------------------------------------------

/** A group's header row: its name on the left, its scale or unit on the right. */
export function SectionLabel({
  left,
  right,
}: {
  left: ReactNode
  right?: ReactNode
}) {
  return (
    <p className="readout-section-label readout-label">
      <span>{left}</span>
      {right != null && <span>{right}</span>}
    </p>
  )
}
