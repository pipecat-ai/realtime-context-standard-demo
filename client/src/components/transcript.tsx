import { RTVIEvent } from "@pipecat-ai/client-js"
import {
  usePipecatConversation,
  useRTVIClientEvent,
  type ConversationMessage,
} from "@pipecat-ai/client-react"
import { Fragment, useState, type ReactNode } from "react"

import { Panel } from "@/components/panel"
import { Readings } from "@/components/readings"
import { TaggedLine } from "@/components/tagged-line"
import { Switch } from "@/components/ui/switch"
import { partText } from "@/lib/tagged"
import { cn } from "@/lib/utils"
import { useExpressionStore } from "@/stores/expression-store"

const EMPTY = "nothing said yet. start a call and ask about an order_"
const BOT_NAME = "sam"
/** The header switch: shows or hides the reader and tagger rows under the bubbles. */
const TONE_LABEL = "show tone"

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
  return (
    <div className={cn("flex max-w-5/6 flex-col gap-1", user && "items-end")}>
      <p className="readout-label px-1">
        <span className={user ? "text-client" : "text-agent"}>
          {user ? "you" : BOT_NAME}
        </span>
        {` · ${shortTime(message.createdAt)}`}
      </p>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          user ? "rounded-br-md bg-client/15" : "rounded-bl-md bg-secondary"
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
function UserTurn({
  message,
  showData,
}: {
  message: ConversationMessage
  showData: boolean
}) {
  const perception = useExpressionStore((state) => state.perception)
  const lines = message.parts.map((part) => ({
    key: part.createdAt,
    text: partText(part),
  }))

  return (
    <Bubble
      message={message}
      data={
        showData
          ? lines.map(({ key, text }) => {
              const reading = perception[text.trim()]
              return reading && <Readings key={key} perception={reading} />
            })
          : undefined
      }
    >
      {lines.map(({ key, text }) => (
        <p key={key}>{text}</p>
      ))}
    </Bubble>
  )
}

/** What the bot said, spoken words lit, and under the bubble the line as voiced. */
function BotTurn({
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
        {words.map(({ createdAt, needsSeparator, text }) => (
          <Fragment key={createdAt}>
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

export function Transcript({ className }: { className?: string }) {
  const { messages } = usePipecatConversation({ includeExpressionEvents: true })
  const [showData, setShowData] = useState(true)
  const [userSpeaking, setUserSpeaking] = useState(false)
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, () => setUserSpeaking(true))
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, () =>
    setUserSpeaking(false)
  )

  // Flux can send a partial transcript of noise or echo, such as "two" as
  // the call connects, without starting a turn. Nothing finalizes it, so an
  // unfinished user line shows only while the user is mid-turn.
  const turns = messages.flatMap((message) => {
    if (message.role === "assistant") return [message]
    if (message.role !== "user") return []
    const parts = message.parts.filter((part) => part.final || userSpeaking)
    return parts.length ? [{ ...message, parts }] : []
  })

  return (
    <Panel
      title="transcript"
      right={
        <label className="flex cursor-pointer items-center gap-2">
          {TONE_LABEL}
          <Switch
            size="sm"
            checked={showData}
            onCheckedChange={setShowData}
            className="data-checked:bg-active"
          />
        </label>
      }
      className={className}
    >
      {/* Column-reversed, so the scroll stays pinned to the newest line. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 pb-4">
        {turns.length ? (
          <ol aria-live="polite" className="flex flex-col gap-3">
            {turns.map((message) => (
              <li
                key={message.createdAt}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "user" ? (
                  <UserTurn message={message} showData={showData} />
                ) : (
                  <BotTurn message={message} showData={showData} />
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="font-mono text-xs text-faint">{EMPTY}</p>
        )}
      </div>
    </Panel>
  )
}
