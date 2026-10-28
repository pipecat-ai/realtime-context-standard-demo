import type { UserPerceptionSignal } from "@pipecat-ai/client-js"

import { Segments } from "@/components/meters"
import { emotionColor } from "@/lib/sentiment"

/**
 * The Tone reader's reading of a user line, as labelled pairs in the same
 * order on every line: the likeliest emotion in its sentiment colour with
 * its confidence, then the chance the line is sarcastic.
 */
export function Readings({
  perception,
}: {
  perception: UserPerceptionSignal[]
}) {
  const emotion = perception.find((s) => s.name === "emotion")?.labels[0]
  const sarcasm = perception.find((s) => s.name === "sarcasm")?.value

  return (
    <p className="readout-readings">
      {emotion && (
        <span className="readout-reading">
          <b>emotion</b>
          <span style={{ color: emotionColor(emotion.label) }}>
            {emotion.label}
          </span>
          <Segments
            value={emotion.confidence}
            color={emotionColor(emotion.label)}
          />
          <small>{Math.round(emotion.confidence * 100)}%</small>
        </span>
      )}
      {sarcasm !== undefined && (
        <span className="readout-reading">
          <b>sarcasm</b>
          <Segments value={sarcasm} color="var(--sarcasm)" />
          <small>{sarcasm.toFixed(2)}</small>
        </span>
      )}
    </p>
  )
}
