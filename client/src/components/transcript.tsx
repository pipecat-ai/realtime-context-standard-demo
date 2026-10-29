import { RTVIEvent } from "@pipecat-ai/client-js"
import {
  usePipecatConversation,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react"
import { useState } from "react"

import { Panel } from "@/components/panel"
import { Backchannel, BotTurn, UserTurn } from "@/components/transcript-turns"
import { Switch } from "@/components/ui/switch"
import { isDemo } from "@/lib/demo"
import { partText } from "@/lib/tagged"
import { cn } from "@/lib/utils"
import { useExpressionStore } from "@/stores/expression-store"

const EMPTY = isDemo
  ? "nothing said yet. start the call to hear the demo caller_"
  : "nothing said yet. start a call and ask about an order_"
/** The header switch: shows or hides the reader and tagger rows under the bubbles. */
const TONE_LABEL = "show tone"

export function Transcript({ className }: { className?: string }) {
  const { messages } = usePipecatConversation({
    includeExpressionEvents: true,
    includeBackchannel: true,
  })
  const heard = useExpressionStore((state) => state.heard)
  const [showData, setShowData] = useState(true)
  const [userSpeaking, setUserSpeaking] = useState(false)
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, () => setUserSpeaking(true))
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, () =>
    setUserSpeaking(false)
  )

  // Flux can send a partial transcript of noise, such as "two" as the call
  // connects, outside any turn. The conversation marks it final when the
  // user next speaks, as if the bot heard it, so a user line shows only
  // while it's being spoken, or once the bot's final transcript of it comes.
  const turns = messages.flatMap((message) => {
    if (message.role === "assistant" || message.backchannel) return [message]
    if (message.role !== "user") return []
    const parts = message.parts.filter(
      (part) =>
        heard.has(partText(part).trim()) || (userSpeaking && !part.final)
    )
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
      {/* Column-reversed, so the scroll stays pinned to the newest line; older
          lines fade out towards the top. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto mask-t-from-75% px-4 pb-4">
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
                {message.backchannel ? (
                  <Backchannel message={message} />
                ) : message.role === "user" ? (
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
