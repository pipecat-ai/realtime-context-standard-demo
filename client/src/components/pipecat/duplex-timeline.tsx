"use client";

import {
  RTVIEvent,
  type BotOutputData,
  type UserInputData,
} from "@pipecat-ai/client-js";
import {
  usePipecatClientMediaTrack,
  usePipecatClientTransportState,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
} from "react";

import {
  DUPLEX_TIMELINE_INITIAL_STATE,
  reduceDuplexTimeline,
  type DuplexTimelineEvent,
  type DuplexTimelineMarker,
} from "@/components/pipecat/duplex-timeline-markers";
import {
  createDuplexTimelineRenderer,
  DUPLEX_TIMELINE_HEIGHT,
  DUPLEX_TIMELINE_LANES,
  type DuplexTimelineRenderer,
} from "@/components/pipecat/duplex-timeline-renderer";
import { cn } from "@/lib/utils";
import { resolveVisualizerColor } from "@/lib/visualizer";

export type { DuplexTimelineMarker };

const DEFAULT_COLORS = {
  agent: "--agent-foreground",
  user: "--client-foreground",
  backchannel: "--muted-foreground",
  interruption: "--inactive-background",
  grid: "--border",
};

/**
 * Label defaults. Segment colors come through the root's custom properties
 * so a label class name can override them.
 */
const LABEL_CLASSES = {
  backchannel:
    "text-[10px] leading-none text-(color:--duplex-timeline-backchannel)",
  interruption:
    "text-[10px] leading-none text-(color:--duplex-timeline-interruption)",
  latency:
    "text-[10px] leading-none data-slow:text-(color:--duplex-timeline-slow-reply)",
  time: "text-[10px] leading-none opacity-50",
};

/** A color prop as CSS: "--token" names become var(--token). */
function cssColor(color: string): string {
  return color.startsWith("--") ? `var(${color})` : color;
}

/**
 * A color prop for the canvas. Tokens resolve on the canvas itself, so an
 * override scoped to the timeline reaches the bars as well as the DOM parts.
 */
function canvasColor(color: string, canvas: HTMLCanvasElement): string {
  if (!color.startsWith("--")) return resolveVisualizerColor(color, canvas);
  return getComputedStyle(canvas).getPropertyValue(color).trim() || "black";
}

export interface DuplexTimelineViewProps {
  /** The bot's audio track; the agent lane stays flat when null. */
  agentTrack?: MediaStreamTrack | null;
  /** The user's audio track; the user lane stays flat when null. */
  userTrack?: MediaStreamTrack | null;
  /** Turn markers in performance.now() time, e.g. from useDuplexTimelineMarkers. */
  markers?: readonly DuplexTimelineMarker[];
  /** Scrolls while true and holds the last frame when false. Starting clears both lanes and restarts the time axis. */
  running?: boolean;
  /** Lights the agent lane label. */
  agentSpeaking?: boolean;
  /** Lights the user lane label. */
  userSpeaking?: boolean;
  agentLabel?: string;
  userLabel?: string;
  /** Agent speech bars. Supports "--css-var" names, "currentColor" and any CSS color. */
  agentColor?: string;
  /** User speech bars; same formats as agentColor. */
  userColor?: string;
  /** Backchannel bars and labels. */
  backchannelColor?: string;
  /** Interruption bars and labels. */
  interruptionColor?: string;
  /** Latency of replies at or above slowReplyMs; defaults to interruptionColor. */
  slowReplyColor?: string;
  /** Centre lines, second ticks and the now edge. */
  gridColor?: string;
  /** Replies at least this slow, in ms, draw their latency in slowReplyColor. */
  slowReplyMs?: number;
  /** Draw backchannels as speech, without labels. Markers still keep them off the handoffs. */
  noBackchannels?: boolean;
  /** Draw interruptions as speech, without labels. */
  noInterruptions?: boolean;
  /** Hide the dashed rules at turn ends and replies. */
  noHandoffs?: boolean;
  /** Hide reply latency brackets. */
  noLatency?: boolean;
  /** Hide the lane labels; the canvas takes their width. */
  noLaneLabels?: boolean;
  /** Hide backchannel and interruption labels; their bars keep their colors. */
  noSegmentLabels?: boolean;
  /** Hide the elapsed-time labels under the lanes. */
  noTimeLabels?: boolean;
  /** Hide the color key above the lanes; DuplexTimelineLegend can place it elsewhere. */
  noLegend?: boolean;
  className?: string;
  /** Classes for the color key. */
  legendClassName?: string;
  /** Classes for each lane label, which carries data-lane and data-state="speaking" | "silent". */
  laneLabelClassName?: string;
  /** Classes for backchannel labels. */
  backchannelLabelClassName?: string;
  /** Classes for interruption labels. */
  interruptionLabelClassName?: string;
  /** Classes for latency labels; slow replies carry data-slow. */
  latencyLabelClassName?: string;
  /** Classes for the elapsed-time labels. */
  timeLabelClassName?: string;
}

/**
 * Scrolling agent and user waveforms. Handoff rules, latency and time labels
 * use the element's text color. Labels over the canvas are DOM spans.
 */
export function DuplexTimelineView({
  agentTrack = null,
  userTrack = null,
  markers,
  running = false,
  agentSpeaking = false,
  userSpeaking = false,
  agentLabel = "agent",
  userLabel = "you",
  agentColor = DEFAULT_COLORS.agent,
  userColor = DEFAULT_COLORS.user,
  backchannelColor = DEFAULT_COLORS.backchannel,
  interruptionColor = DEFAULT_COLORS.interruption,
  slowReplyColor = interruptionColor,
  gridColor = DEFAULT_COLORS.grid,
  slowReplyMs = 1000,
  noBackchannels = false,
  noInterruptions = false,
  noHandoffs = false,
  noLatency = false,
  noLaneLabels = false,
  noSegmentLabels = false,
  noTimeLabels = false,
  noLegend = false,
  className,
  legendClassName,
  laneLabelClassName,
  backchannelLabelClassName,
  interruptionLabelClassName,
  latencyLabelClassName,
  timeLabelClassName,
}: DuplexTimelineViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<DuplexTimelineRenderer | null>(null);

  // The renderer owns the frame loop, audio and label spans; props are
  // pushed into it.
  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!canvas || !labels) return;
    const renderer = createDuplexTimelineRenderer(canvas, labels);
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Resolve colors now and whenever the theme changes, on <html> or with the
  // OS. className is a dependency because it can change what they resolve to.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const apply = () => {
      rendererRef.current?.setPalette({
        agent: canvasColor(agentColor, canvas),
        user: canvasColor(userColor, canvas),
        backchannel: canvasColor(backchannelColor, canvas),
        interruption: canvasColor(interruptionColor, canvas),
        slowReply: canvasColor(slowReplyColor, canvas),
        grid: canvasColor(gridColor, canvas),
        text: canvasColor("currentColor", canvas),
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      scheme.removeEventListener("change", apply);
    };
  }, [
    agentColor,
    userColor,
    backchannelColor,
    interruptionColor,
    slowReplyColor,
    gridColor,
    className,
  ]);

  // Before markers, so the first frame creates label spans with their classes.
  useEffect(() => {
    rendererRef.current?.setOptions({
      slowReplyMs,
      backchannels: !noBackchannels,
      interruptions: !noInterruptions,
      handoffs: !noHandoffs,
      latency: !noLatency,
      segmentLabels: !noSegmentLabels,
      timeLabels: !noTimeLabels,
      labelClassNames: {
        backchannel: cn(LABEL_CLASSES.backchannel, backchannelLabelClassName),
        interruption: cn(
          LABEL_CLASSES.interruption,
          interruptionLabelClassName,
        ),
        latency: cn(LABEL_CLASSES.latency, latencyLabelClassName),
        time: cn(LABEL_CLASSES.time, timeLabelClassName),
      },
    });
  }, [
    slowReplyMs,
    noBackchannels,
    noInterruptions,
    noHandoffs,
    noLatency,
    noSegmentLabels,
    noTimeLabels,
    backchannelLabelClassName,
    interruptionLabelClassName,
    latencyLabelClassName,
    timeLabelClassName,
  ]);

  useEffect(() => {
    rendererRef.current?.setTrack("agent", agentTrack);
  }, [agentTrack]);

  useEffect(() => {
    rendererRef.current?.setTrack("user", userTrack);
  }, [userTrack]);

  useEffect(() => {
    rendererRef.current?.setMarkers(markers ?? []);
  }, [markers]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (running) renderer.reset();
    renderer.setRunning(running);
  }, [running]);

  const { agent, user } = DUPLEX_TIMELINE_LANES;

  return (
    <div
      data-slot="duplex-timeline"
      data-state={running ? "live" : "idle"}
      className={cn(
        "text-muted-foreground flex flex-col gap-4 font-mono text-[11px]",
        className,
      )}
      style={
        {
          "--duplex-timeline-backchannel": cssColor(backchannelColor),
          "--duplex-timeline-interruption": cssColor(interruptionColor),
          "--duplex-timeline-slow-reply": cssColor(slowReplyColor),
        } as React.CSSProperties
      }
    >
      {!noLegend && (
        <DuplexTimelineLegend
          backchannelColor={backchannelColor}
          interruptionColor={interruptionColor}
          noBackchannels={noBackchannels}
          noInterruptions={noInterruptions}
          noHandoffs={noHandoffs}
          className={legendClassName}
        />
      )}
      <div className="flex gap-3">
        {!noLaneLabels && (
          <div
            className="flex shrink-0 flex-col"
            style={{
              paddingTop: agent.top,
              rowGap: user.top - agent.top - agent.height,
            }}
          >
            <LaneLabel
              lane="agent"
              label={agentLabel}
              color={agentColor}
              speaking={agentSpeaking}
              height={agent.height}
              className={laneLabelClassName}
            />
            <LaneLabel
              lane="user"
              label={userLabel}
              color={userColor}
              speaking={userSpeaking}
              height={user.height}
              className={laneLabelClassName}
            />
          </div>
        )}
        <div className="relative min-w-0 flex-1 [mask-image:linear-gradient(to_right,transparent,black_3rem)]">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${agentLabel} and ${userLabel} speech over time`}
            className="block w-full"
            style={{ height: DUPLEX_TIMELINE_HEIGHT }}
          />
          <div
            ref={labelsRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          />
        </div>
      </div>
    </div>
  );
}

/** Lane name, lit while that side speaks. */
function LaneLabel({
  lane,
  label,
  color,
  speaking,
  height,
  className,
}: {
  lane: "agent" | "user";
  label: string;
  color: string;
  speaking: boolean;
  height: number;
  className?: string;
}) {
  return (
    <span
      data-slot="duplex-timeline-lane-label"
      data-lane={lane}
      data-state={speaking ? "speaking" : "silent"}
      className={cn(
        "group/lane data-[state=speaking]:text-foreground flex items-center gap-1.5",
        className,
      )}
      style={{ height }}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full opacity-35 transition-opacity duration-150 group-data-[state=speaking]/lane:opacity-100 motion-reduce:transition-none"
        style={{ backgroundColor: cssColor(color) }}
      />
      {label}
    </span>
  );
}

/** The timeline's colors and no* props, so one options object can feed both. */
export type DuplexTimelineLegendProps = Pick<
  DuplexTimelineViewProps,
  | "backchannelColor"
  | "interruptionColor"
  | "noBackchannels"
  | "noInterruptions"
  | "noHandoffs"
> & { className?: string };

/** Key for the colors and rules the lane labels don't explain. */
export function DuplexTimelineLegend({
  backchannelColor = DEFAULT_COLORS.backchannel,
  interruptionColor = DEFAULT_COLORS.interruption,
  noBackchannels = false,
  noInterruptions = false,
  noHandoffs = false,
  className,
}: DuplexTimelineLegendProps) {
  const swatches = [
    { label: "backchannel", color: backchannelColor, hidden: noBackchannels },
    {
      label: "interruption",
      color: interruptionColor,
      hidden: noInterruptions,
    },
  ].filter((swatch) => !swatch.hidden);
  return (
    <span
      data-slot="duplex-timeline-legend"
      className={cn(
        "text-muted-foreground flex items-center gap-3 font-mono text-[11px]",
        className,
      )}
    >
      {swatches.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-1"
            style={{ backgroundColor: cssColor(color) }}
          />
          {label}
        </span>
      ))}
      {!noHandoffs && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-px border-l border-dashed border-current"
          />
          handoff
        </span>
      )}
    </span>
  );
}

type TurnEventType = Exclude<
  DuplexTimelineEvent["type"],
  "bot-backchannel" | "user-backchannel"
>;

/** Forwards an RTVI turn event, stamped on arrival, with a stable handler. */
function useTurnEvent(
  event: RTVIEvent,
  type: TurnEventType,
  dispatch: Dispatch<DuplexTimelineEvent>,
) {
  const handler = useCallback(
    () => dispatch({ type, now: performance.now() }),
    [dispatch, type],
  );
  useRTVIClientEvent(event, handler);
}

/**
 * Turn markers and speaking state from RTVI turn and backchannel events.
 * Requires PipecatClientProvider and an RTVI 2.2 bot for backchannels.
 */
export function useDuplexTimelineMarkers() {
  const [state, dispatch] = useReducer(
    reduceDuplexTimeline,
    DUPLEX_TIMELINE_INITIAL_STATE,
  );

  useTurnEvent(RTVIEvent.Connected, "connected", dispatch);
  useTurnEvent(RTVIEvent.Disconnected, "disconnected", dispatch);
  useTurnEvent(
    RTVIEvent.UserStartedSpeaking,
    "user-started-speaking",
    dispatch,
  );
  useTurnEvent(
    RTVIEvent.UserStoppedSpeaking,
    "user-stopped-speaking",
    dispatch,
  );
  useTurnEvent(RTVIEvent.BotStartedSpeaking, "bot-started-speaking", dispatch);
  useTurnEvent(RTVIEvent.BotStoppedSpeaking, "bot-stopped-speaking", dispatch);

  const onBotOutput = useCallback((data: BotOutputData) => {
    // Only a backchannel's first event carries its text; the rest report
    // how much has been spoken.
    if (data.text_type !== "backchannel") return;
    if (data.spoken_status && data.spoken_status !== "new") return;
    dispatch({
      type: "bot-backchannel",
      text: data.text.trim(),
      now: performance.now(),
    });
  }, []);
  useRTVIClientEvent(RTVIEvent.BotOutput, onBotOutput);

  const onUserInput = useCallback((data: UserInputData) => {
    if (data.input_type !== "backchannel") return;
    dispatch({
      type: "user-backchannel",
      text: data.text.trim(),
      now: performance.now(),
    });
  }, []);
  useRTVIClientEvent(RTVIEvent.UserInput, onUserInput);

  return {
    markers: state.markers,
    agentSpeaking: state.botSpeaking,
    userSpeaking: state.userSpeaking,
  };
}

export type DuplexTimelineProps = Omit<
  DuplexTimelineViewProps,
  | "agentTrack"
  | "userTrack"
  | "markers"
  | "running"
  | "agentSpeaking"
  | "userSpeaking"
> & {
  /** The user's lane, in place of the local mic's. */
  userTrack?: MediaStreamTrack | null;
};

/** Requires PipecatClientProvider; scrolls while the transport is ready. */
export function DuplexTimeline({
  userTrack: userTrackOverride,
  ...props
}: DuplexTimelineProps) {
  const agentTrack = usePipecatClientMediaTrack("audio", "bot");
  const localTrack = usePipecatClientMediaTrack("audio", "local");
  const userTrack = userTrackOverride ?? localTrack;
  const running = usePipecatClientTransportState() === "ready";
  const { markers, agentSpeaking, userSpeaking } = useDuplexTimelineMarkers();

  return (
    <DuplexTimelineView
      {...props}
      agentTrack={agentTrack}
      userTrack={userTrack}
      markers={markers}
      running={running}
      agentSpeaking={agentSpeaking}
      userSpeaking={userSpeaking}
    />
  );
}
