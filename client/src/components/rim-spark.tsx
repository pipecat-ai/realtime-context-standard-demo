import { useId, useState } from "react"

/** How far the shine's line sits inside the rim, in px: on its edge. */
const INSET = 1

/** The shine's length, percent of the rim, and its stroke width, px. */
const SHINE_LENGTH = 22
const SHINE_WIDTH = 2

/**
 * SVG can't run a gradient along a curved stroke, so the shine is many faint
 * dashes, all ending at the head, each a little shorter than the last. Where
 * more of them overlap it's brighter, so it fades from its head to nothing at
 * its tail (1 - (1 - opacity)^steps ≈ 0.95 at the head), in steps too small
 * to see once softened.
 */
const SHINE_STEPS = 32
const STEP_OPACITY = 0.09

/** Lengths of the shine's dashes, percent of the rim, tail first. */
const SHINE_DASHES = Array.from(
  { length: SHINE_STEPS },
  (_, step) => SHINE_LENGTH * (1 - step / SHINE_STEPS)
)

/** A touch of blur that takes the stair-steps off the strokes. */
const SOFTEN_BLUR = 0.6

/** Room around the rim for the blur to spread into, px. */
const BLUR_ROOM = 4

interface Rim {
  width: number
  height: number
}

const sameRim = (a: Rim | null, b: Rim) =>
  a !== null && a.width === b.width && a.height === b.height

/**
 * A shine that runs a lap of its pill-shaped parent's rim now and then, and
 * a flash of the pill as it gets home (the rim-* animations in index.css);
 * without motion, neither. The rim is measured and drawn, so the shine keeps
 * one speed and length on the straights and around the ends. Its blur is an
 * SVG filter, which Safari draws on SVG content where CSS filters can fail.
 */
export function RimSpark() {
  const [rim, setRim] = useState<Rim | null>(null)
  // useId's punctuation doesn't belong in a url(#…) reference.
  const softenId = `${useId().replace(/[^\w-]/g, "")}-soften`

  return (
    <>
      <svg
        ref={(svg) => {
          if (!svg) return
          const observer = new ResizeObserver(([entry]) => {
            if (!entry) return
            const { width, height } = entry.contentRect
            // The same box keeps the same state, so re-measuring can't loop.
            setRim((current) =>
              sameRim(current, { width, height }) ? current : { width, height }
            )
          })
          observer.observe(svg)
          return () => observer.disconnect()
        }}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible opacity-0 motion-safe:animate-rim-spark-fade"
      >
        {rim && rim.height > 2 * INSET && (
          <>
            <defs>
              <filter
                id={softenId}
                filterUnits="userSpaceOnUse"
                x={-BLUR_ROOM}
                y={-BLUR_ROOM}
                width={rim.width + 2 * BLUR_ROOM}
                height={rim.height + 2 * BLUR_ROOM}
              >
                <feGaussianBlur stdDeviation={SOFTEN_BLUR} />
              </filter>
            </defs>
            <g filter={`url(#${softenId})`}>
              {SHINE_DASHES.map((length) => (
                <rect
                  key={length}
                  x={INSET}
                  y={INSET}
                  width={rim.width - 2 * INSET}
                  height={rim.height - 2 * INSET}
                  rx={rim.height / 2 - INSET}
                  pathLength={100}
                  strokeDasharray={`${String(length)} ${String(100 - length)}`}
                  strokeWidth={SHINE_WIDTH}
                  strokeOpacity={STEP_OPACITY}
                  strokeLinecap="round"
                  className="fill-none stroke-foreground motion-safe:animate-rim-spark"
                />
              ))}
            </g>
          </>
        )}
      </svg>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-foreground opacity-0 motion-safe:animate-rim-flash"
      />
    </>
  )
}
