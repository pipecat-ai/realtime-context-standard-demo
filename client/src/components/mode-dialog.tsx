import { ArrowRightIcon } from "lucide-react"
import { useState, type CSSProperties } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { WEAVE_TILE_CSS, weaveTexture } from "@/glass/weave"
import { cn } from "@/lib/utils"
import type { Mode } from "@/stores/session-store"

interface ModeCard {
  mode: Mode
  title: string
  detail: string
  stack: string[]
  /** A still of the stage's ambient light, without its WebGL (index.css). */
  background: string
}

const CARDS: ModeCard[] = [
  {
    mode: "llm",
    title: "LLM mode",
    detail: "GPT-5.6 Luna writes each reply, tagged with how it's said.",
    stack: ["GPT-5.6 Luna", "Cartesia"],
    background: "bg-(image:--mode-llm)",
  },
  {
    mode: "tagger",
    title: "Tagger mode",
    detail:
      "PhoneLLM Mini writes each reply. The Tone tagger adds how it's said.",
    stack: ["PhoneLLM Mini", "Tone tagger", "ElevenLabs v4"],
    background: "bg-(image:--mode-tagger)",
  },
]

/** Each card's button. */
const PICK_LABEL = "Talk to Sam"

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
    // White type over the light, as on the stage.
    <div
      className={cn(
        "on-ambient relative isolate grid overflow-hidden rounded-3xl p-6 sm:row-span-4 sm:grid-rows-subgrid sm:gap-y-0",
        card.background
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 mix-blend-overlay"
        style={grain}
      />
      <h3 className="text-3xl leading-tight font-medium tracking-tight text-shadow-lift-soft">
        {card.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-pretty text-foreground/85">
        {card.detail}
      </p>
      <ul className="mt-6 flex flex-wrap items-end gap-1.5 sm:flex-nowrap">
        {card.stack.map((part) => (
          <li
            key={part}
            className="rounded-full border border-foreground/25 bg-black/15 px-2 py-0.5 font-mono text-2xs whitespace-nowrap text-foreground/90"
          >
            {part}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onPick(card.mode)}
        // Both cards' buttons read "Talk to Sam"; the name says which mode.
        aria-label={`${PICK_LABEL} in ${card.title}`}
        className="mt-5 flex h-12 items-center justify-between rounded-full border border-foreground/35 bg-foreground/12 pr-2 pl-5 text-base font-medium inset-shadow-glass-edge backdrop-blur-md transition-colors outline-none hover:bg-foreground/22 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        {PICK_LABEL}
        <span
          className="flex size-8 items-center justify-center rounded-full border-[1.5px] border-foreground/90"
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
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-dialog bg-background/90 p-3 ring-white/10 sm:max-w-4xl sm:p-4"
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
