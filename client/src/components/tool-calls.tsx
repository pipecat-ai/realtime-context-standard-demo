import { RTVIEvent } from "@pipecat-ai/client-js"
import {
  usePipecatConversation,
  useRTVIClientEvent,
  type FunctionCallData,
} from "@pipecat-ai/client-react"

import { Panel } from "@/components/panel"
import { Metric } from "@/components/pipecat/metric"
import { playChime } from "@/lib/chime"
import { cn } from "@/lib/utils"

/** The tools in server/tools.py, with their counter labels. */
const TOOLS = [
  { name: "get_order", label: "look up" },
  { name: "update_order", label: "change" },
  { name: "cancel_order", label: "cancel" },
  { name: "end_call", label: "hang up" },
]

const twoDigits = (count: number) => String(count).padStart(2, "0")

/** `order_number=51077, shipping_speed=express` from a call's arguments. */
function formatArguments(args: FunctionCallData["args"]): string {
  return Object.entries(args ?? {})
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ")
}

/** What came back, in a word or two: the order numbers, or why not. */
function formatResult({ status, cancelled, result }: FunctionCallData): string {
  if (cancelled) return "cancelled"
  if (status !== "completed") return "…"
  if (typeof result !== "object" || result === null) return "ok"
  const { found, success, order, orders } = result as {
    found?: boolean
    success?: boolean
    order?: { order_number: string }
    orders?: { order_number: string }[]
  }
  if (found === false) return "not found"
  if (orders) return orders.map((o) => `#${o.order_number}`).join(", ")
  if (success === false)
    return order ? `#${order.order_number} locked` : "failed"
  return order ? `#${order.order_number}` : "ok"
}

/**
 * The bot's tool calls, as in the Sarvam demo: a counter per tool that
 * flashes and chimes with each call, and the latest call with its arguments
 * and result.
 */
export function ToolCalls({ className }: { className?: string }) {
  const { messages } = usePipecatConversation()
  const calls = messages.flatMap(({ functionCall }) =>
    functionCall ? [functionCall] : []
  )
  const last = calls.at(-1)

  useRTVIClientEvent(RTVIEvent.LLMFunctionCallStarted, playChime)

  return (
    <Panel title="tool calls" right={calls.length} className={className}>
      <div className="grid grid-cols-4 px-1">
        {TOOLS.map(({ name, label }) => {
          const count = calls.filter((c) => c.function_name === name).length
          return (
            <Metric
              // Keyed on the count, so each call remounts the cell and
              // replays its flash.
              key={`${name}-${String(count)}`}
              label={label}
              value={count}
              format={twoDigits}
              className={cn(
                "px-3 py-3 not-first:border-l",
                count > 0 && "animate-tool-flash motion-reduce:animate-none"
              )}
            />
          )
        })}
      </div>
      <p className="border-t px-4 py-2 font-mono text-xs leading-5">
        <span className="text-muted-foreground">last call · </span>
        {last ? (
          <span className="break-words">
            <span className="text-tool">{last.function_name}</span>
            <span className="text-muted-foreground">
              ({formatArguments(last.args)}) →{" "}
            </span>
            {formatResult(last)}
          </span>
        ) : (
          <span className="text-faint">none yet</span>
        )}
      </p>
    </Panel>
  )
}
