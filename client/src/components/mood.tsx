import { MiniBars, Segments } from "@/components/meters"
import { Panel } from "@/components/panel"
import { cn } from "@/lib/utils"
import { useExpressionStore } from "@/stores/expression-store"

/** The mood's sentiment colour, below each limit. */
const COLORS: [number, string][] = [
  [25, "var(--hostile)"],
  [45, "var(--cold)"],
  [60, "var(--neutral)"],
]
const moodColor = (value: number) =>
  COLORS.find(([limit]) => value < limit)?.[1] ?? "var(--warm)"

/** +8, −14, ±0, with a true minus sign. */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0")

/** Where the mood starts, as server/meter.py starts it: shown until the first reading. */
const START = { value: 50, change: 0, word: "neutral" }

/** The caller's mood over the call: now, the last turn's change, and the trail. */
export function Mood({ className }: { className?: string }) {
  const moods = useExpressionStore((state) => state.moods)
  const { value, change, word } = moods.at(-1) ?? START
  const color = moodColor(value)

  return (
    <Panel title="caller mood" className={className}>
      <div className="flex min-w-0 items-center gap-3 px-4 pb-4 font-mono text-xs">
        <span className="w-20 shrink-0 font-bold uppercase" style={{ color }}>
          {word}
        </span>
        <Segments
          value={value / 100}
          count={20}
          color={color}
          label="caller mood"
        />
        <span className="tabular-nums">{value}</span>
        <span
          className={cn(
            "tabular-nums",
            change > 0 && "text-warm",
            change < 0 && "text-hostile",
            change === 0 && "text-muted-foreground"
          )}
        >
          {signed(change)}
        </span>
        <MiniBars
          values={moods.map((mood) => mood.value)}
          max={100}
          color={color}
          label="caller mood by turn"
          className="ml-auto"
        />
      </div>
    </Panel>
  )
}
