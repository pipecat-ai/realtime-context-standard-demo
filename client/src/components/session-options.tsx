import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useSessionStore, type TtsChoice } from "@/stores/session-store"

const TTS_LABELS: Record<TtsChoice, string> = {
  elevenlabs: "ElevenLabs",
  cartesia: "Cartesia",
}

/** Who writes the expression tags: the Tone tagger or the LLM. */
const TAGGER_LABELS = { tagger: "PhoneLLM + tagger", llm: "Luna writes tags" }

/** The kit's pressed fill barely lifts off the page; the chosen option is lit. */
const ITEM = "aria-pressed:bg-primary aria-pressed:text-primary-foreground"

const isTts = (value: unknown): value is TtsChoice =>
  value === "elevenlabs" || value === "cartesia"

/** The bot's start-time options; fixed while a session is up. */
export function SessionOptions({ disabled }: { disabled: boolean }) {
  const tts = useSessionStore((state) => state.tts)
  const useTagger = useSessionStore((state) => state.useTagger)
  const setTts = useSessionStore((state) => state.setTts)
  const setUseTagger = useSessionStore((state) => state.setUseTagger)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        aria-label="Text-to-speech"
        variant="outline"
        size="sm"
        disabled={disabled}
        value={[tts]}
        onValueChange={([value]) => {
          if (isTts(value)) setTts(value)
        }}
      >
        {Object.entries(TTS_LABELS).map(([value, label]) => (
          <ToggleGroupItem key={value} value={value} className={ITEM}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ToggleGroup
        aria-label="Expression tags"
        variant="outline"
        size="sm"
        disabled={disabled}
        value={[useTagger ? "tagger" : "llm"]}
        onValueChange={([value]) => {
          if (value) setUseTagger(value === "tagger")
        }}
      >
        {Object.entries(TAGGER_LABELS).map(([value, label]) => (
          <ToggleGroupItem key={value} value={value} className={ITEM}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
