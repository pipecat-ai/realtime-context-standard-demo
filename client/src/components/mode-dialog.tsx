import { ArrowRightIcon } from "lucide-react"
import { useState, type CSSProperties } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { WEAVE_TILE_CSS, weaveTexture } from "@/glass/weave"
import type { Mode } from "@/stores/session-store"

interface ModeCard {
  mode: Mode
  title: string
  detail: string
  stack: string[]
  /** A still of the stage's ambient light, without its WebGL. */
  background: string
}

const CARDS: ModeCard[] = [
  {
    mode: "llm",
    title: "LLM mode",
    detail: "GPT-5.6 Luna writes each reply, tagged with how it's said.",
    stack: ["GPT-5.6 Luna", "Cartesia"],
    background: [
      "radial-gradient(110% 80% at 88% 8%, #b4f0c8 0%, transparent 55%)",
      "radial-gradient(90% 70% at 0% 100%, #06301f 0%, transparent 65%)",
      "linear-gradient(160deg, #1d7a50, #2f9e68 45%, #12573a)",
    ].join(","),
  },
  {
    mode: "tagger",
    title: "Tagger mode",
    detail:
      "PhoneLLM Mini writes each reply. The Tone tagger adds how it's said.",
    stack: ["PhoneLLM Mini", "Tone tagger", "ElevenLabs v4"],
    background: [
      "radial-gradient(110% 80% at 88% 8%, #ecbdf0 0%, transparent 55%)",
      "radial-gradient(90% 70% at 0% 100%, #3a1260 0%, transparent 65%)",
      "linear-gradient(160deg, #7a33b0, #a94cc4 45%, #5a2380)",
    ].join(","),
  },
]

/** Under both cards: what the modes share. */
const SHARED = "Either way, the Tone reader hears your emotion and sarcasm."

/**
 * One mode: its name, what it does, what runs it and the button that starts
 * it, each on a row the other card's lines up with (the grid's subgrid).
 */
function Card({
  card,
  grain,
  onPick,
}: {
  card: ModeCard
  grain: CSSProperties
  onPick: (mode: Mode) => void
}) {
  return (
    <div
      className="relative isolate grid overflow-hidden rounded-3xl p-6 text-white sm:row-span-4 sm:grid-rows-subgrid sm:gap-y-0"
      style={{ backgroundImage: card.background }}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 mix-blend-overlay"
        style={grain}
      />
      <h3 className="text-3xl leading-tight font-medium tracking-tight text-shadow-[0_1px_1px_oklch(0_0_0/0.3)]">
        {card.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-pretty text-white/85">
        {card.detail}
      </p>
      <ul className="mt-6 flex flex-wrap items-end gap-1.5 sm:flex-nowrap">
        {card.stack.map((part) => (
          <li
            key={part}
            className="rounded-full border border-white/25 bg-black/15 px-2 py-0.5 font-mono text-[0.625rem] whitespace-nowrap text-white/90"
          >
            {part}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onPick(card.mode)}
        className="mt-5 flex h-12 items-center justify-between rounded-full border border-white/35 bg-white/12 pr-2 pl-5 text-base font-medium shadow-[inset_0_1px_0_oklch(1_0_0/0.25)] backdrop-blur-md transition-colors outline-none hover:bg-white/22 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        Talk to Sam
        <span
          className="flex size-8 items-center justify-center rounded-full border-[1.5px] border-white/90"
          aria-hidden
        >
          <ArrowRightIcon className="size-4" />
        </span>
      </button>
    </div>
  )
}

/** On landing: which mode the call runs in, LLM or tagger. */
export function ModeDialog({
  open,
  onPick,
}: {
  open: boolean
  onPick: (mode: Mode) => void
}) {
  // The stage's woven grain, drawn once for both cards.
  const [grain] = useState<CSSProperties>(() => ({
    backgroundImage: `url(${weaveTexture()})`,
    backgroundSize: `${String(WEAVE_TILE_CSS)}px`,
  }))

  return (
    <Dialog open={open} disablePointerDismissal>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[32px] bg-background/90 p-3 ring-white/10 sm:max-w-4xl sm:p-4"
      >
        <div className="px-3 pt-4 pb-6 text-center sm:pt-6 sm:pb-8">
          <p className="readout-label">real-time context standard</p>
          <DialogTitle className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
            Who directs Sam's voice?
          </DialogTitle>
          <DialogDescription className="mt-2">
            Pick a mode for the call.
          </DialogDescription>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 sm:grid-rows-[auto_auto_1fr_auto] sm:gap-x-4 sm:gap-y-0">
          {CARDS.map((card) => (
            <Card key={card.mode} card={card} grain={grain} onPick={onPick} />
          ))}
        </div>
        <p className="px-3 pt-4 pb-1 text-center text-xs text-muted-foreground">
          {SHARED}
        </p>
      </DialogContent>
    </Dialog>
  )
}
