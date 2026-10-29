import type { ConversationMessage } from "@pipecat-ai/client-react"
import { Fragment, type ReactNode } from "react"

import { Readings } from "@/components/readings"
import { TaggedLine } from "@/components/tagged-line"
import { USER_NAME } from "@/lib/demo"
import { partText } from "@/lib/tagged"
import { cn } from "@/lib/utils"
import { useExpressionStore } from "@/stores/expression-store"

const BOT_NAME = "sam"
const BACKCHANNEL_LABEL = "backchannel"

/*
 * PARTS_IN_ORDER: a message's parts are keyed by position. The conversation
 * only appends them, so a position always holds the same part, while their
 * createdAt can repeat: two of the bot's sentences often arrive in the same
 * millisecond.
 */

const shortTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

/**
 * A turn as a chat bubble, the bot's on the left and the user's on the
 * right, with what was read of it set under the bubble as data.
 */
function Bubble({
  message,
  data,
  children,
}: {
  message: ConversationMessage
  /** Under the bubble; left out when the switch hides it. */
  data?: ReactNode
  children: ReactNode
}) {
  const user = message.role === "user"
  const backchannel = message.backchannel === true
  return (
    <div className={cn("flex max-w-5/6 flex-col gap-1", user && "items-end")}>
      <p className="readout-label px-1">
        <span className={user ? "text-client" : "text-agent"}>
          {user ? USER_NAME : BOT_NAME}
        </span>
        {backchannel && ` · ${BACKCHANNEL_LABEL}`}
        {` · ${shortTime(message.createdAt)}`}
      </p>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          backchannel
            ? "rounded-br-md border border-dashed border-faint text-muted-foreground italic"
            : user
              ? "rounded-br-md bg-client/15"
              : "rounded-bl-md bg-secondary"
        )}
      >
        {children}
      </div>
      {data !== undefined && (
        <div className="flex flex-col gap-1 px-1">{data}</div>
      )}
    </div>
  )
}

/** The user's lines, and the Tone reader's reading of each under the bubble. */
export function UserTurn({
  message,
  showData,
}: {
  message: ConversationMessage
  showData: boolean
}) {
  const perception = useExpressionStore((state) => state.perception)
  const lines = message.parts.map(partText)

  return (
    <Bubble
      message={message}
      data={
        showData
          ? lines.map((text, i) => {
              const reading = perception[text.trim()]
              return (
                reading && (
                  // eslint-disable-next-line @eslint-react/no-array-index-key -- see PARTS_IN_ORDER
                  <Readings key={i} perception={reading} />
                )
              )
            })
          : undefined
      }
    >
      {lines.map((text, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- see PARTS_IN_ORDER
        <p key={i}>{text}</p>
      ))}
    </Bubble>
  )
}

/**
 * An acknowledgment the user said while the bot talked, such as "mm-hmm",
 * which the bot talked through and the LLM never read.
 */
export function Backchannel({ message }: { message: ConversationMessage }) {
  return (
    <Bubble message={message}>{message.parts.map(partText).join(" ")}</Bubble>
  )
}

/** What the bot said, spoken words lit, and under the bubble the line as voiced. */
export function BotTurn({
  message,
  showData,
}: {
  message: ConversationMessage
  showData: boolean
}) {
  const words = message.parts.filter(
    (part) => !part.outputType?.startsWith("expression_")
  )

  return (
    <Bubble
      message={message}
      data={showData ? <TaggedLine parts={message.parts} /> : undefined}
    >
      <p>
        {words.map(({ needsSeparator, text }, i) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- see PARTS_IN_ORDER
          <Fragment key={i}>
            {needsSeparator && " "}
            {typeof text === "object" && text !== null && "spoken" in text ? (
              <>
                {text.spoken}
                <span className="text-muted-foreground">{text.unspoken}</span>
              </>
            ) : (
              text
            )}
          </Fragment>
        ))}
      </p>
    </Bubble>
  )
}
