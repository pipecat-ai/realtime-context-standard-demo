import type {
  BotOutputText,
  ConversationMessagePart,
} from "@pipecat-ai/client-react"

import type { DeliveryChange } from "@/stores/expression-store"

/** Deliveries written as a span over words, not a tag before them. */
const SPANS = ["slow", "fast", "emphasis"]

export type TaggedToken =
  | { kind: "delivery" | "sound" | "pause"; text: string }
  | { kind: "words"; text: string; span?: string }

function isBotOutputText(text: unknown): text is BotOutputText {
  return typeof text === "object" && text !== null && "spoken" in text
}

/** A part's text: a user's transcript, or the bot's spoken and unspoken text. */
export function partText({ text }: ConversationMessagePart): string {
  if (typeof text === "string") return text
  return isBotOutputText(text) ? text.spoken + text.unspoken : ""
}

/**
 * A bot message as the TTS was told to speak it, in expressive
 * conversation's tag syntax: a <<delivery>> where the delivery changes,
 * <<slow: …>> and ^^…^^ spans, and the [[sounds]] and pauses performed.
 * The whole line shows at once; a word's tags fill in as it's spoken, when
 * its delivery is reported.
 */
export function taggedTokens(
  parts: ConversationMessagePart[],
  segments: Record<number, { changes: DeliveryChange[]; spoken: number }>
): TaggedToken[] {
  const tokens: TaggedToken[] = []
  let current = "neutral"

  for (const part of parts) {
    const text = partText(part)
    if (part.outputType === "expression_sound") {
      tokens.push({ kind: "sound", text })
      continue
    }
    if (part.outputType === "expression_pause") {
      tokens.push({ kind: "pause", text: `pause ${text}` })
      continue
    }
    if (part.needsSeparator) tokens.push({ kind: "words", text: " " })

    const segment =
      part.segment_id === undefined ? undefined : segments[part.segment_id]
    if (!segment) {
      tokens.push({ kind: "words", text })
      continue
    }

    const { changes, spoken } = segment
    const before = text.slice(0, changes[0]?.at ?? spoken)
    if (before) tokens.push({ kind: "words", text: before })
    changes.forEach(({ at, delivery }, i) => {
      const words = text.slice(at, changes[i + 1]?.at ?? spoken)
      const base = delivery.filter((d) => !SPANS.includes(d)).join(", ")
      if ((base || "neutral") !== current) {
        current = base || "neutral"
        tokens.push({ kind: "delivery", text: current })
      }
      if (words) {
        const span = delivery.find((d) => SPANS.includes(d))
        tokens.push({ kind: "words", text: words, span })
      }
    })
    const unspoken = text.slice(spoken)
    if (unspoken) tokens.push({ kind: "words", text: unspoken })
  }
  return tokens
}

/** Whether the tokens say anything the plain text doesn't. */
export function hasTags(tokens: TaggedToken[]): boolean {
  return tokens.some((t) => t.kind !== "words" || t.span !== undefined)
}
