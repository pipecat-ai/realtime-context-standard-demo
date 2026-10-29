import type { DuplexTimelineMarker } from "@/components/pipecat/duplex-timeline-markers";
import { createVisualizerAnalyser } from "@/lib/visualizer";

export type DuplexTimelineLane = "agent" | "user";
export type DuplexTimelineLabelKind =
  "backchannel" | "interruption" | "latency" | "time";

/** Resolved canvas colors; see DuplexTimelineView for meanings. */
export interface DuplexTimelinePalette {
  agent: string;
  user: string;
  backchannel: string;
  interruption: string;
  slowReply: string;
  grid: string;
  /** Handoff rules and latency brackets. */
  text: string;
}

/** What to draw; see DuplexTimelineView's no* props. */
export interface DuplexTimelineOptions {
  slowReplyMs: number;
  backchannels: boolean;
  interruptions: boolean;
  handoffs: boolean;
  latency: boolean;
  segmentLabels: boolean;
  timeLabels: boolean;
  labelClassNames: Record<DuplexTimelineLabelKind, string>;
}

/** Scroll speed and bar geometry; one bar per slot of time. */
const PX_PER_SECOND = 56;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const SLOT_PX = BAR_WIDTH + BAR_GAP;
const SLOT_MS = (SLOT_PX / PX_PER_SECOND) * 1000;
/** Elapsed whole seconds as m:ss. */
function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A time's distance along the timeline in whole pixels. */
const pixelsAt = (time: number) => Math.round((time / 1000) * PX_PER_SECOND);
/** Slots kept per lane: more than the widest screen shows. */
const SLOT_CAPACITY = 1024;
/** How far back level history reaches; older markers can't be drawn. */
export const DUPLEX_TIMELINE_HISTORY_MS = SLOT_CAPACITY * SLOT_MS;

/** Vertical layout, CSS px. */
const LABEL_ROW = 13;
const LABEL_ROWS = 2;
const LANE_HEIGHT = 40;
const LANE_GAP = 16;
const AXIS_HEIGHT = 14;
const TOP = LABEL_ROW * LABEL_ROWS + 4;
export const DUPLEX_TIMELINE_LANES: Record<
  DuplexTimelineLane,
  { top: number; height: number }
> = {
  agent: { top: TOP, height: LANE_HEIGHT },
  user: { top: TOP + LANE_HEIGHT + LANE_GAP, height: LANE_HEIGHT },
};
const LANES_BOTTOM = DUPLEX_TIMELINE_LANES.user.top + LANE_HEIGHT;
export const DUPLEX_TIMELINE_HEIGHT = LANES_BOTTOM + AXIS_HEIGHT;

interface Segment {
  start: number;
  end: number;
  kind: "backchannel" | "interruption";
}

/** Names a segment, from its start. */
interface SegmentLabel {
  id: number;
  kind: "backchannel" | "interruption";
  text: string;
  start: number;
}

/** Minimum level that draws a bar. */
const AUDIBLE_LEVEL = 0.02;
/** Minimum level that counts as speech when locating a burst. */
const SPEECH_LEVEL = 0.18;
/** Search window for an acknowledgment's audio before its message. */
const ACKNOWLEDGMENT_SEARCH_MS = 3000;
/** Search window for the user's onset before a turn is announced. */
const ONSET_SEARCH_MS = 2500;
/** Silent slots allowed inside one burst. */
const BURST_GAP_SLOTS = 3;
/** Redraw interval under prefers-reduced-motion; levels still sample per frame. */
const REDUCED_MOTION_FRAME_MS = 500;

/** A track's level, 0–1. */
class LevelMeter {
  private readonly analyser: AnalyserNode;
  private readonly samples: Float32Array<ArrayBuffer>;
  readonly dispose: () => void;

  constructor(track: MediaStreamTrack) {
    const { analyser, dispose } = createVisualizerAnalyser(track);
    this.analyser = analyser;
    this.samples = new Float32Array(analyser.fftSize);
    this.dispose = dispose;
    // Starts suspended outside a user gesture; the connect click allows resume.
    if (analyser.context instanceof AudioContext) {
      void analyser.context.resume();
    }
  }

  /** RMS mapped from -55 dBFS (0) to -10 dBFS (1). */
  read(): number {
    this.analyser.getFloatTimeDomainData(this.samples);
    let squares = 0;
    for (const sample of this.samples) squares += sample * sample;
    const rms = Math.sqrt(squares / this.samples.length);
    const db = 20 * Math.log10(rms + 1e-8);
    return Math.min(1, Math.max(0, (db + 55) / 45));
  }
}

/** Per-slot peak levels for a lane, in a ring buffer. */
class LevelHistory {
  private readonly slots = new Float32Array(SLOT_CAPACITY);
  private last = -1;

  record(slot: number, level: number) {
    if (this.last < 0 || slot - this.last > SLOT_CAPACITY) {
      this.slots.fill(0);
    } else {
      for (let skipped = this.last + 1; skipped < slot; skipped++) {
        this.slots[skipped % SLOT_CAPACITY] = 0;
      }
    }
    if (slot !== this.last) this.slots[slot % SLOT_CAPACITY] = 0;
    const index = slot % SLOT_CAPACITY;
    this.slots[index] = Math.max(this.slots[index] ?? 0, level);
    this.last = Math.max(this.last, slot);
  }

  level(slot: number): number {
    if (slot > this.last || this.last - slot >= SLOT_CAPACITY) return 0;
    return this.slots[slot % SLOT_CAPACITY] ?? 0;
  }

  clear() {
    this.slots.fill(0);
    this.last = -1;
  }
}

interface LabelSpec {
  key: string;
  kind: DuplexTimelineLabelKind;
  text: string;
  /** Sets data-slow, for latency at or above slowReplyMs. */
  slow?: boolean;
}

/**
 * Labels as DOM spans over the canvas, so they take class names. A span
 * lives while its key is shown each frame; its text and classes are fixed.
 */
class LabelLayer {
  private readonly root: HTMLElement;
  private readonly labels = new Map<
    string,
    { span: HTMLSpanElement; width: number }
  >();
  private readonly shown = new Set<string>();
  classNames: Record<DuplexTimelineLabelKind, string> = {
    backchannel: "",
    interruption: "",
    latency: "",
    time: "",
  };

  constructor(root: HTMLElement) {
    this.root = root;
  }

  private get({ key, kind, text, slow = false }: LabelSpec) {
    let label = this.labels.get(key);
    if (!label) {
      const span = document.createElement("span");
      span.dataset.slot = `duplex-timeline-${kind}-label`;
      span.toggleAttribute("data-slow", slow);
      span.className = this.classNames[kind];
      span.style.cssText = "position:absolute;top:0;left:0;white-space:nowrap";
      span.textContent = text;
      this.root.append(span);
      label = { span, width: span.getBoundingClientRect().width };
      this.labels.set(key, label);
    }
    return label;
  }

  /** A label's width, measured when its span is created. */
  measure(spec: LabelSpec): number {
    return this.get(spec).width;
  }

  /** Places a label's top-left at x, y, raised by `lift` of its height. */
  show(spec: LabelSpec, x: number, y: number, lift = 0) {
    const { span } = this.get(spec);
    span.style.transform = `translate(${String(x)}px, ${String(y)}px) translateY(${String(-lift * 100)}%)`;
    this.shown.add(spec.key);
  }

  /** Starts a frame. */
  begin() {
    this.shown.clear();
  }

  /** Ends a frame, removing labels it didn't show. */
  end() {
    for (const [key, { span }] of this.labels) {
      if (this.shown.has(key)) continue;
      span.remove();
      this.labels.delete(key);
    }
  }

  clear() {
    for (const { span } of this.labels.values()) span.remove();
    this.labels.clear();
  }
}

export interface DuplexTimelineRenderer {
  setTrack(lane: DuplexTimelineLane, track: MediaStreamTrack | null): void;
  setMarkers(markers: readonly DuplexTimelineMarker[]): void;
  setPalette(palette: DuplexTimelinePalette): void;
  setOptions(options: DuplexTimelineOptions): void;
  /** Scrolls while running; holds the last frame when stopped. */
  setRunning(running: boolean): void;
  /** Clears both lanes' level history. */
  reset(): void;
  dispose(): void;
}

/**
 * Two scrolling waveforms, agent over user, colored by what the audio was
 * (speech, backchannel, interruption), with handoff rules and reply latency.
 * Owns its frame loop and the label spans in `labelRoot`; the caller feeds
 * tracks, markers, colors and options.
 */
export function createDuplexTimelineRenderer(
  canvas: HTMLCanvasElement,
  labelRoot: HTMLElement,
): DuplexTimelineRenderer {
  const context2d = canvas.getContext("2d");
  if (!context2d) throw new Error("Canvas 2D is unavailable");
  const ctx = context2d;

  let palette: DuplexTimelinePalette = {
    agent: "black",
    user: "black",
    backchannel: "gray",
    interruption: "black",
    slowReply: "black",
    grid: "gray",
    text: "gray",
  };
  let markers: readonly DuplexTimelineMarker[] = [];
  let options: Omit<DuplexTimelineOptions, "labelClassNames"> = {
    slowReplyMs: 1000,
    backchannels: true,
    interruptions: true,
    handoffs: true,
    latency: true,
    segmentLabels: true,
    timeLabels: true,
  };
  const labels = new LabelLayer(labelRoot);
  const meters: Record<DuplexTimelineLane, LevelMeter | null> = {
    agent: null,
    user: null,
  };
  const history: Record<DuplexTimelineLane, LevelHistory> = {
    agent: new LevelHistory(),
    user: new LevelHistory(),
  };
  /** Per-lane alpha masks, opaque at the centre line. Color independent. */
  const masks = new Map<DuplexTimelineLane, CanvasGradient>();

  let running = false;
  let frozenAt = performance.now();
  /** Where the time axis counts from; reset() restarts it. */
  let startedAt = frozenAt;
  let frame = 0;
  let lastDraw = -Infinity;
  let width = 0;

  const reducedMotion =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const dpr = window.devicePixelRatio || 1;
    width = entry.contentRect.width;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(DUPLEX_TIMELINE_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    masks.clear();
    redraw();
  });
  resize.observe(canvas);

  /** Repaints a held frame; a running loop picks changes up itself. */
  function redraw() {
    if (!running) draw(frozenAt);
  }

  function tick(now: number) {
    const slot = Math.floor(now / SLOT_MS);
    for (const lane of ["agent", "user"] as const) {
      history[lane].record(slot, meters[lane]?.read() ?? 0);
    }
    if (!reducedMotion?.matches || now - lastDraw >= REDUCED_MOTION_FRAME_MS) {
      draw(now);
      lastDraw = now;
    }
    frame = requestAnimationFrame(tick);
  }

  /**
   * x of a time, with now at the right edge. Times and the scroll snap to
   * pixels separately, so bars, rules and labels all step on the same frame.
   */
  function xAt(time: number, now: number) {
    return width - pixelsAt(now) + pixelsAt(time);
  }

  function draw(now: number) {
    ctx.clearRect(0, 0, width, DUPLEX_TIMELINE_HEIGHT);
    labels.begin();
    if (width > 0) {
      const visible = markers.filter(
        (marker) => xAt(markerEnd(marker, now), now) > -200,
      );
      const spans = segments(visible, now);
      drawLane("agent", palette.agent, spans.lanes.agent, now);
      drawLane("user", palette.user, spans.lanes.user, now);
      drawGrid(now);
      for (const marker of visible) drawHandoff(marker, now);
      if (options.segmentLabels) drawSegmentLabels(spans.labels, now);
    }
    labels.end();
  }

  function markerEnd(marker: DuplexTimelineMarker, now: number) {
    if (marker.kind === "bot-backchannel") return marker.end ?? now;
    if (marker.kind === "interruption") return marker.cutAt ?? now;
    if (marker.kind === "possible-interruption") return marker.cutAt;
    return marker.at;
  }

  const slotOf = (time: number) => Math.floor(time / SLOT_MS);
  const audible = (lane: DuplexTimelineLane, slot: number) =>
    history[lane].level(slot) > AUDIBLE_LEVEL;

  /**
   * The speech burst at or before `from` (back to `limit`), widened to its
   * quiet edges so a segment covers every bar it drew.
   */
  function burstAt(lane: DuplexTimelineLane, from: number, limit: number) {
    let start: number | null = null;
    let end: number | null = null;
    let quiet = 0;
    for (let slot = slotOf(from); slot >= slotOf(limit); slot--) {
      const speaking = history[lane].level(slot) >= SPEECH_LEVEL;
      if (end === null) {
        if (speaking) end = start = slot;
      } else if (speaking) {
        start = slot;
        quiet = 0;
      } else if (++quiet > BURST_GAP_SLOTS) {
        break;
      }
    }
    if (start === null || end === null) return null;
    return widen(lane, start, end);
  }

  /** Extends a slot range while its edges still draw bars. */
  function widen(
    lane: DuplexTimelineLane,
    start: number,
    end: number,
  ): [number, number] {
    while (audible(lane, start - 1)) start--;
    while (audible(lane, end + 1)) end++;
    return [start * SLOT_MS, (end + 1) * SLOT_MS];
  }

  /** A user acknowledgment: the last burst before its message. */
  function acknowledgmentSpan(
    marker: DuplexTimelineMarker & { kind: "user-backchannel" },
  ): [number, number] {
    return (
      burstAt("user", marker.at, marker.at - ACKNOWLEDGMENT_SEARCH_MS) ?? [
        marker.at - 600,
        marker.at,
      ]
    );
  }

  /** A bot backchannel: the agent audio after its message. */
  function botBackchannelSpan(
    marker: DuplexTimelineMarker & { kind: "bot-backchannel" },
    now: number,
  ): [number, number] {
    const end = marker.end ?? now;
    for (let slot = slotOf(marker.at); slot <= slotOf(end + 400); slot++) {
      if (audible("agent", slot)) {
        const [start] = widen("agent", slot, slot);
        const [, last] = widen("agent", slotOf(end), slotOf(end));
        return [start, Math.max(last, end)];
      }
    }
    return [marker.at, end];
  }

  /**
   * An interruption's overlap: from the user's onset (before the turn was
   * announced) to the bot's cut-off. Null if the audio didn't overlap.
   */
  function overlapSpans(
    marker: DuplexTimelineMarker & {
      kind: "interruption" | "possible-interruption";
    },
    now: number,
  ): Record<DuplexTimelineLane, [number, number]> | null {
    const cutAt = marker.cutAt ?? now;
    const burst = burstAt("user", marker.at, marker.at - ONSET_SEARCH_MS);
    if (!burst || burst[0] >= cutAt) return null;
    const [, agentEnd] = widen("agent", slotOf(cutAt), slotOf(cutAt));
    return {
      user: [burst[0], cutAt],
      agent: [burst[0], audible("agent", slotOf(cutAt)) ? agentEnd : cutAt],
    };
  }

  /** Non-speech stretches per lane (backchannels and interruptions) and their labels. */
  function segments(visible: readonly DuplexTimelineMarker[], now: number) {
    const lanes: Record<DuplexTimelineLane, Segment[]> = {
      agent: [],
      user: [],
    };
    const named: SegmentLabel[] = [];
    for (const marker of visible) {
      if (
        marker.kind === "bot-backchannel" ||
        marker.kind === "user-backchannel"
      ) {
        if (!options.backchannels) continue;
        const [start, end] =
          marker.kind === "bot-backchannel"
            ? botBackchannelSpan(marker, now)
            : acknowledgmentSpan(marker);
        lanes[marker.kind === "bot-backchannel" ? "agent" : "user"].push({
          start,
          end,
          kind: "backchannel",
        });
        named.push({
          id: marker.id,
          kind: "backchannel",
          // "Mm-hmm." → "mm-hmm"
          text: marker.text.replace(/[.!?,]+$/, "").toLowerCase(),
          start,
        });
      } else if (
        marker.kind === "interruption" ||
        marker.kind === "possible-interruption"
      ) {
        if (!options.interruptions) continue;
        const overlap = overlapSpans(marker, now);
        if (!overlap) continue;
        for (const lane of ["agent", "user"] as const) {
          const [start, end] = overlap[lane];
          lanes[lane].push({ start, end, kind: "interruption" });
        }
        named.push({
          id: marker.id,
          kind: "interruption",
          text: "interruption",
          start: overlap.user[0],
        });
      }
    }
    return { lanes, labels: named };
  }

  /**
   * Ticks every second since the start, labelled with the elapsed time every
   * five, so each label scrolls with its tick. Then the now edge.
   */
  function drawGrid(now: number) {
    ctx.fillStyle = palette.grid;
    const visibleMs = (width / PX_PER_SECOND) * 1000;
    const first = Math.max(0, Math.ceil((now - startedAt - visibleMs) / 1000));
    for (let second = first; startedAt + second * 1000 <= now; second++) {
      const x = Math.round(xAt(startedAt + second * 1000, now));
      const major = second % 5 === 0;
      ctx.fillRect(x, LANES_BOTTOM + 3, 1, major ? 4 : 2);
      if (options.timeLabels && major) {
        const label = formatElapsed(second);
        labels.show(
          { key: `time:${label}`, kind: "time", text: label },
          x + 3,
          DUPLEX_TIMELINE_HEIGHT,
          1,
        );
      }
    }
    ctx.fillRect(width - 1, TOP - 2, 1, LANES_BOTTOM - TOP + 4);
  }

  /** Fades a lane's bars toward their tips. */
  function laneMask(lane: DuplexTimelineLane) {
    let mask = masks.get(lane);
    if (!mask) {
      const { top, height } = DUPLEX_TIMELINE_LANES[lane];
      mask = ctx.createLinearGradient(0, top, 0, top + height);
      mask.addColorStop(0, "rgba(0, 0, 0, 0.5)");
      mask.addColorStop(0.5, "rgba(0, 0, 0, 1)");
      mask.addColorStop(1, "rgba(0, 0, 0, 0.5)");
      masks.set(lane, mask);
    }
    return mask;
  }

  /** Mirrored bars: lane color for speech, then backchannel or interruption. */
  function drawLane(
    lane: DuplexTimelineLane,
    color: string,
    spans: readonly Segment[],
    now: number,
  ) {
    const box = DUPLEX_TIMELINE_LANES[lane];
    const centre = Math.round(box.top + box.height / 2);
    ctx.fillStyle = palette.grid;
    ctx.fillRect(0, centre, width, 1);

    const colors: Record<Segment["kind"] | "speech", string> = {
      speech: color,
      backchannel: palette.backchannel,
      interruption: palette.interruption,
    };
    const newest = Math.floor(now / SLOT_MS);
    const count = Math.ceil(width / SLOT_PX) + 1;
    for (let slot = newest; slot > newest - count; slot--) {
      const level = history[lane].level(slot);
      if (level <= AUDIBLE_LEVEL) continue;
      const middle = (slot + 0.5) * SLOT_MS;
      const segment = spans.find(
        (span) => middle >= span.start && middle <= span.end,
      );
      ctx.fillStyle = colors[segment?.kind ?? "speech"];
      const x = Math.round(xAt((slot + 1) * SLOT_MS, now)) - BAR_WIDTH;
      const half = Math.max(1, Math.round(level * (box.height / 2 - 1)));
      ctx.fillRect(x, centre - half, BAR_WIDTH, half * 2 + 1);
    }

    // Masking keeps any token color (oklch included) without parsing it.
    // destination-in clears everything outside its shape, so clip to the lane.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, box.top, width, box.height);
    ctx.clip();
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = laneMask(lane);
    ctx.fillRect(0, box.top, width, box.height);
    ctx.restore();
  }

  function dashedRule(x: number) {
    ctx.strokeStyle = palette.text;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, TOP - 2);
    ctx.lineTo(Math.round(x) + 0.5, LANES_BOTTOM + 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /** Handoff rules, with the reply latency between them. */
  function drawHandoff(marker: DuplexTimelineMarker, now: number) {
    if (marker.kind !== "turn-end" && marker.kind !== "reply") return;
    const x = xAt(marker.at, now);
    if (options.handoffs) dashedRule(x);
    if (marker.kind === "reply" && options.latency) {
      drawLatency(marker.id, xAt(marker.from, now), x, marker.at - marker.from);
    }
  }

  /** A bracket between the lanes, labelled with the gap. */
  function drawLatency(id: number, from: number, to: number, ms: number) {
    const middle = Math.round(
      DUPLEX_TIMELINE_LANES.agent.top + LANE_HEIGHT + LANE_GAP / 2,
    );
    const y = middle + 0.5;
    const slow = ms >= options.slowReplyMs;
    const label: LabelSpec = {
      key: `latency:${String(id)}`,
      kind: "latency",
      text:
        ms < 1000
          ? `${String(Math.round(ms))}ms`
          : `${(ms / 1000).toFixed(1)}s`,
      slow,
    };
    const textWidth = labels.measure(label);
    // Too narrow for the text: print it after the reply rule.
    const inside = to - from > textWidth + 8;
    const x = inside ? (from + to) / 2 - textWidth / 2 : to + 4;

    // The line breaks around the text, so no background fill is needed.
    ctx.strokeStyle = slow ? palette.slowReply : palette.text;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(Math.round(from) + 0.5, y);
    ctx.lineTo(Math.round(inside ? x - 3 : to) + 0.5, y);
    if (inside) {
      ctx.moveTo(Math.round(x + textWidth + 3) + 0.5, y);
      ctx.lineTo(Math.round(to) + 0.5, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    labels.show(label, Math.round(x), middle, 0.5);
  }

  /** Labels above the lanes; a colliding label drops to the second row. */
  function drawSegmentLabels(named: SegmentLabel[], now: number) {
    const rowEnds = Array<number>(LABEL_ROWS).fill(-Infinity);
    for (const { id, kind, text, start } of named.sort(
      (a, b) => a.start - b.start,
    )) {
      const x = Math.round(xAt(start, now));
      const row = rowEnds.findIndex((end) => x > end + 8);
      if (row < 0) continue;
      const label: LabelSpec = { key: `${kind}:${String(id)}`, kind, text };
      rowEnds[row] = x + labels.measure(label);
      labels.show(label, x, row * LABEL_ROW + 2);
    }
  }

  return {
    setTrack(lane, track) {
      meters[lane]?.dispose();
      meters[lane] = track ? new LevelMeter(track) : null;
    },
    setMarkers(next) {
      markers = next;
      redraw();
    },
    setPalette(next) {
      palette = next;
      redraw();
    },
    setOptions({ labelClassNames, ...next }) {
      options = next;
      // Spans keep the classes and data-slow they were created with.
      labels.clear();
      labels.classNames = labelClassNames;
      redraw();
    },
    setRunning(next) {
      if (next === running) return;
      running = next;
      if (running) {
        lastDraw = -Infinity;
        frame = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(frame);
        frozenAt = performance.now();
        draw(frozenAt);
      }
    },
    reset() {
      history.agent.clear();
      history.user.clear();
      frozenAt = startedAt = performance.now();
      redraw();
    },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      labels.clear();
      meters.agent?.dispose();
      meters.user?.dispose();
      meters.agent = null;
      meters.user = null;
    },
  };
}
