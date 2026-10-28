import type { ConversationMessagePart } from "@pipecat-ai/client-react"

import { hasTags, taggedTokens, type TaggedToken } from "@/lib/tagged"
import { cn } from "@/lib/utils"
import { useExpressionStore } from "@/stores/expression-store"

/** A breath the tagger chose, as the TTS names it: "short breath", "exhales". */
const BREATH = /breath|inhale|exhale/

/** Words in a <<slow: …>> or ^^…^^ span, the markup in the span's colour. */
function Span({ text, span }: { text: string; span: string }) {
  const body = text.trim()
  const lead = text.slice(0, text.indexOf(body))
  const emphasis = span === "emphasis"
  const [open, close] = emphasis ? ["^^", "^^"] : [`<<${span}: `, ">>"]
  const markup = emphasis ? "text-tag-emphasis" : "text-tag-speed"
  return (
    <>
      {lead}
      <span className={markup}>{open}</span>
      <span className="text-foreground">{body}</span>
      <span className={markup}>{close}</span>
      {text.slice(lead.length + body.length)}
    </>
  )
}

function Token({ token }: { token: TaggedToken }) {
  switch (token.kind) {
    case "delivery":
      // The end of the expression before it, rather than a tag of its own.
      return token.text === "neutral" ? (
        <span title="neutral" className="mx-1.5 text-faint">
          |
        </span>
      ) : (
        <span className="me-1 text-tag-delivery">{`<<${token.text}>>`}</span>
      )
    case "sound":
      return (
        <span
          className={cn(
            "mx-1",
            BREATH.test(token.text) ? "text-tag-breath" : "text-tag-sound"
          )}
        >{`[[${token.text}]]`}</span>
      )
    case "pause":
      return <span className="mx-1 text-tag-pause">{`[[${token.text}]]`}</span>
    case "words":
      return token.span ? (
        <Span text={token.text} span={token.span} />
      ) : (
        token.text
      )
  }
}

/** Shown for a reply voiced as written, rather than repeating its words. */
const NO_TAGS = "[no tags]"

/** The bot's line as it was voiced, in full, with its tags highlighted. */
export function TaggedLine({ parts }: { parts: ConversationMessagePart[] }) {
  const segments = useExpressionStore((state) => state.segments)
  const tokens = taggedTokens(parts, segments)
  if (!tokens.length) return null
  if (!hasTags(tokens)) {
    return <p className="font-mono text-[10px] text-faint">{NO_TAGS}</p>
  }

  return (
    // No ligatures: Azeret Mono would draw the tags' << as one chevron.
    <p className="font-mono text-[10px] leading-relaxed text-muted-foreground [font-variant-ligatures:none]">
      {tokens.map((token, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- rebuilt in order, never reordered
        <Token key={i} token={token} />
      ))}
    </p>
  )
}
