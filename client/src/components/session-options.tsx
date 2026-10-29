import { useId, type ReactNode } from "react"

import { SectionLabel } from "@/components/meters"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { useSessionStore, type TtsChoice } from "@/stores/session-store"

const TTS_LABELS: Record<TtsChoice, string> = {
  elevenlabs: "ElevenLabs",
  cartesia: "Cartesia",
}

/** Who writes the expression tags: the Tone tagger or the LLM. */
const TAGGER_LABELS = { tagger: "PhoneLLM + tagger", llm: "Luna writes tags" }

const BACKCHANNELS_LABEL = "Backchannel detector"
const BACKCHANNELS_DETAIL = "Sam keeps talking through “mm-hmm”"

/** Said beside the heading while a call is up. */
const LOCKED_LABEL = "locked in a call"

/** The kit's pressed fill barely lifts off the page; the chosen option is lit. */
const ITEM =
  "w-full aria-pressed:bg-primary aria-pressed:text-primary-foreground"

const isTts = (value: unknown): value is TtsChoice =>
  value === "elevenlabs" || value === "cartesia"

/** A setting's name over its control, which the name labels. */
function Field({
  label,
  children,
}: {
  label: string
  children: (labelId: string) => ReactNode
}) {
  const labelId = useId()

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-xs text-muted-foreground">
        {label}
      </span>
      {children(labelId)}
    </div>
  )
}

/**
 * The bot's start-time options. It reads them as a session starts, so they're
 * locked while one is up.
 */
export function SessionOptions({ locked }: { locked: boolean }) {
  const tts = useSessionStore((state) => state.tts)
  const useTagger = useSessionStore((state) => state.useTagger)
  const setTts = useSessionStore((state) => state.setTts)
  const setUseTagger = useSessionStore((state) => state.setUseTagger)
  const detectBackchannels = useSessionStore(
    (state) => state.detectBackchannels
  )
  const setDetectBackchannels = useSessionStore(
    (state) => state.setDetectBackchannels
  )

  return (
    <section aria-label="Session" className="flex flex-col gap-4">
      <SectionLabel left="session" right={locked ? LOCKED_LABEL : undefined} />
      <Field label="Voice">
        {(labelId) => (
          <ToggleGroup
            aria-labelledby={labelId}
            variant="outline"
            size="sm"
            disabled={locked}
            value={[tts]}
            onValueChange={([value]) => {
              if (isTts(value)) setTts(value)
            }}
            className="grid w-full grid-cols-2"
          >
            {Object.entries(TTS_LABELS).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className={ITEM}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </Field>
      <Field label="Expression tags">
        {(labelId) => (
          <ToggleGroup
            aria-labelledby={labelId}
            variant="outline"
            size="sm"
            disabled={locked}
            value={[useTagger ? "tagger" : "llm"]}
            onValueChange={([value]) => {
              if (value) setUseTagger(value === "tagger")
            }}
            className="grid w-full grid-cols-2"
          >
            {Object.entries(TAGGER_LABELS).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className={ITEM}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </Field>
      <label className="flex items-center justify-between gap-4">
        {/* The switch dims itself. */}
        <span
          className={cn("flex min-w-0 flex-col gap-1", locked && "opacity-50")}
        >
          <span className="text-sm">{BACKCHANNELS_LABEL}</span>
          <span className="text-xs text-muted-foreground">
            {BACKCHANNELS_DETAIL}
          </span>
        </span>
        <Switch
          checked={detectBackchannels}
          onCheckedChange={setDetectBackchannels}
          disabled={locked}
          className="data-checked:bg-active"
        />
      </label>
    </section>
  )
}
