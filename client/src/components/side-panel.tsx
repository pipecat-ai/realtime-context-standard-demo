import {
  GaugeIcon,
  MessageSquareTextIcon,
  SmileIcon,
  WrenchIcon,
} from "lucide-react"
import { useState } from "react"

import { Metrics } from "@/components/metrics"
import { Mood } from "@/components/mood"
import { ToolCalls } from "@/components/tool-calls"
import { Transcript } from "@/components/transcript"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/** The panels, in the tab bar's order. */
const PANELS = [
  { id: "transcript", label: "Transcript", Icon: MessageSquareTextIcon },
  { id: "mood", label: "Mood", Icon: SmileIcon },
  { id: "tools", label: "Tools", Icon: WrenchIcon },
  { id: "latency", label: "Latency", Icon: GaugeIcon },
] as const

type PanelId = (typeof PANELS)[number]["id"]

const isPanel = (value: unknown): value is PanelId =>
  PANELS.some((panel) => panel.id === value)

/** Below lg, which panel shows: one at a time, the transcript first. */
function PanelTabs({
  shown,
  onShow,
  className,
}: {
  shown: PanelId
  onShow: (panel: PanelId) => void
  className?: string
}) {
  return (
    <ToggleGroup
      aria-label="Panel"
      spacing={1}
      value={[shown]}
      onValueChange={([value]) => {
        if (isPanel(value)) onShow(value)
      }}
      className={cn(
        "grid w-full shrink-0 grid-cols-4 rounded-none border-t p-1",
        className
      )}
    >
      {PANELS.map(({ id, label, Icon }) => (
        <ToggleGroupItem
          key={id}
          value={id}
          className="h-12 flex-col gap-1 text-xs text-muted-foreground aria-pressed:bg-secondary aria-pressed:text-foreground"
        >
          <Icon aria-hidden />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Beside the stage, a rule between each panel and the next. */
const DIVIDED = "lg:border-b"

/**
 * The session as it happens: the transcript, mood, tool calls and latency,
 * stacked beside the stage, or below lg one at a time, from a tab bar. All
 * stay mounted, so a hidden one keeps counting, chiming and charting. One
 * flush column, ruled off from the stage (above it below lg).
 */
export function SidePanel({ className }: { className?: string }) {
  const [shown, setShown] = useState<PanelId>("transcript")
  const hiddenBelowLg = (panel: PanelId) => panel !== shown && "max-lg:hidden"

  return (
    <aside
      aria-label="Session"
      className={cn(
        "flex min-h-0 flex-col border-t bg-card lg:border-t-0 lg:border-l",
        className
      )}
    >
      <Transcript
        className={cn("min-h-0 flex-1", DIVIDED, hiddenBelowLg("transcript"))}
      />
      <Mood className={cn("shrink-0", DIVIDED, hiddenBelowLg("mood"))} />
      <ToolCalls className={cn("shrink-0", DIVIDED, hiddenBelowLg("tools"))} />
      <Metrics className={cn("shrink-0", hiddenBelowLg("latency"))} />
      <PanelTabs
        shown={shown}
        onShow={setShown}
        className="mt-auto lg:hidden"
      />
    </aside>
  )
}
