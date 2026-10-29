import { useId, useState } from "react"

/** How far the spark's line sits inside the rim, in px: on its edge. */
const INSET = 1

interface SparkLayer {
  /** Percent of the rim. */
  length: number
  opacity: number
  /** Stroke width, px. */
  width: number
}

/** The spark's length, percent of the rim, and its width at tail and head. */
const SPARK_LENGTH = 22
const TAIL_WIDTH = 1
const HEAD_WIDTH = 2.25

/**
 * SVG can't run a gradient along a curved stroke, so the spark is many faint
 * dashes, all ending at the head, each a little shorter and wider than the
 * last. Where more of them overlap it's brighter, so it ramps from a faint
 * tail to a bright head (1 - (1 - opacity)^steps ≈ 0.95), in steps too small
 * to see once softened.
 */
const SPARK_STEPS = 24
const STEP_OPACITY = 0.12

const SPARK_LAYERS: SparkLayer[] = Array.from(
  { length: SPARK_STEPS },
  (_, step) => {
    const along = step / (SPARK_STEPS - 1)
    return {
      length: SPARK_LENGTH * (1 - step / SPARK_STEPS),
      opacity: STEP_OPACITY,
      width: TAIL_WIDTH + (HEAD_WIDTH - TAIL_WIDTH) * along,
    }
  }
)

/** The glow under the spark: as long as its tail, wider, and blurred. */
const GLOW: SparkLayer = { length: 16, opacity: 0.55, width: 6 }
const GLOW_BLUR = 3

/** A touch of blur that takes the stair-steps off the spark's thin strokes. */
const SOFTEN_BLUR = 0.6

/** Room around the rim for the blurs to spread into, px. */
const BLUR_ROOM = 12

interface Rim {
  width: number
  height: number
}

const sameRim = (a: Rim | null, b: Rim) =>
  a !== null && a.width === b.width && a.height === b.height

/** One layer of the spark: a dash of the rim, run round by rim-spark. */
function RimDash({ rim, length, opacity, width }: SparkLayer & { rim: Rim }) {
  return (
    <rect
      x={INSET}
      y={INSET}
      width={rim.width - 2 * INSET}
      height={rim.height - 2 * INSET}
      rx={rim.height / 2 - INSET}
      pathLength={100}
      strokeDasharray={`${String(length)} ${String(100 - length)}`}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinecap="round"
      className="fill-none stroke-foreground motion-safe:animate-rim-spark"
    />
  )
}

/** A blur over the rim and the room around it. */
function RimBlur({ id, rim, blur }: { id: string; rim: Rim; blur: number }) {
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      x={-BLUR_ROOM}
      y={-BLUR_ROOM}
      width={rim.width + 2 * BLUR_ROOM}
      height={rim.height + 2 * BLUR_ROOM}
    >
      <feGaussianBlur stdDeviation={blur} />
    </filter>
  )
}

/**
 * A spark that runs a lap of its pill-shaped parent's rim now and then, and
 * a flash of the pill as it gets home (the rim-* animations in index.css);
 * without motion, neither. The rim is measured and drawn, so the spark keeps
 * one speed and length on the straights and around the ends. Its blurs are
 * SVG filters, which Safari draws on SVG content where CSS filters can fail.
 */
export function RimSpark() {
  const [rim, setRim] = useState<Rim | null>(null)
  // useId's punctuation doesn't belong in a url(#…) reference.
  const id = useId().replace(/[^\w-]/g, "")
  const glowId = `${id}-glow`
  const softenId = `${id}-soften`

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
              <RimBlur id={glowId} rim={rim} blur={GLOW_BLUR} />
              <RimBlur id={softenId} rim={rim} blur={SOFTEN_BLUR} />
            </defs>
            <g filter={`url(#${glowId})`}>
              <RimDash rim={rim} {...GLOW} />
            </g>
            <g filter={`url(#${softenId})`}>
              {SPARK_LAYERS.map((layer) => (
                <RimDash key={layer.length} rim={rim} {...layer} />
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
