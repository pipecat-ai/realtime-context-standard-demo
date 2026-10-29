import { Panel } from "@/components/panel"
import { MiniBars, Segments } from "@/components/meters"
import { usePipecatMetrics } from "@/hooks/use-pipecat-metrics"

/** Time to first byte per stage, matched on the service class name. */
const STAGES = [
  { label: "stt", processor: /STTService/ },
  { label: "llm", processor: /LLMService/ },
  // Not a loose /TTS/: "STTService" contains "TTS".
  { label: "tts", processor: /TTSService/ },
]

/** A stage's meter is full at one second. */
const BUDGET_S = 1
/** History shown beside each stage. */
const TRAIL = 16

/** Speed as colour: green while quick, amber past half the budget, pink over it. */
function speedColor(seconds: number): string {
  if (seconds <= BUDGET_S / 2) return "var(--active-background)"
  return seconds <= BUDGET_S ? "var(--tool)" : "var(--inactive-background)"
}

/** Each stage's latest ttfb as segments and milliseconds, with its history. */
export function Metrics({ className }: { className?: string }) {
  const { series } = usePipecatMetrics({ maxPoints: TRAIL })

  return (
    <Panel title="latency · ttfb" right="0–1 s" className={className}>
      <dl className="grid grid-cols-[3rem_auto_4rem_1fr] items-center gap-x-3 gap-y-2 px-4 pt-3 pb-4 font-mono text-xs">
        {STAGES.map(({ label, processor }) => {
          const stage = series.find(
            (s) => s.category === "ttfb" && processor.test(s.processor)
          )
          return (
            <div key={label} className="contents">
              <dt className="readout-label">{label}</dt>
              <dd>
                <Segments
                  value={(stage?.latest ?? 0) / BUDGET_S}
                  color={stage && speedColor(stage.latest)}
                  label={`${label} time to first byte`}
                />
              </dd>
              <dd className="text-right tabular-nums">
                {stage ? `${Math.round(stage.latest * 1000)} ms` : "—"}
              </dd>
              <dd className="flex min-w-0 items-center gap-2">
                {stage && (
                  <MiniBars
                    values={stage.points.map((point) => point.value)}
                    color={speedColor(stage.latest)}
                    label={`${label} history`}
                  />
                )}
                <span className="truncate text-faint">
                  {stage?.processor.replace(/Service#\d+$/, "")}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </Panel>
  )
}
