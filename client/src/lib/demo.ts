import { useBotAudio } from "@/components/pipecat/bot-audio"

/**
 * Demo mode, `?demo`: a scripted caller talks to Sam (server/demo.py), in
 * tagger mode, so the demo runs with no one at the mic. The bot plays
 * the caller into its pipeline and sends the client the same audio as it
 * goes, which this plays, and gives the timeline in place of the mic's.
 */
export const isDemo = new URLSearchParams(window.location.search).has("demo")

/** What the transcript and timeline call the user: a demo's is its caller. */
export const USER_NAME = isDemo ? "caller" : "you"

const AUDIO_MESSAGE_TYPE = "demo-caller-audio"

/**
 * How far ahead of now the caller's audio is played, which is about how late
 * the bot's own voice is heard, after WebRTC's buffers, so the transcript and
 * Sam's nods keep pace with what's heard.
 */
const LEAD_S = 0.15

interface AudioMessage {
  type: typeof AUDIO_MESSAGE_TYPE
  /** 16-bit mono PCM, base64-encoded. */
  audio: string
  sample_rate: number
}

const isAudioMessage = (data: unknown): data is AudioMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === AUDIO_MESSAGE_TYPE

/** Plays the caller's audio as it arrives, at the bot's volume. */
class DemoCaller {
  private readonly context = new AudioContext()
  private readonly gain = this.context.createGain()
  private readonly stream = this.context.createMediaStreamDestination()
  private next = 0

  constructor() {
    this.gain.connect(this.context.destination)
    this.gain.connect(this.stream)
    this.gain.gain.value = useBotAudio.getState().volume
    useBotAudio.subscribe(({ volume }) => {
      this.gain.gain.value = volume
    })
  }

  /** The caller's voice, for the timeline's lane. */
  get track(): MediaStreamTrack | null {
    return this.stream.stream.getAudioTracks()[0] ?? null
  }

  /** Whether the browser lets it play without a tap. */
  get unlocked(): boolean {
    return this.context.state === "running"
  }

  /** Call in a tap, so the browser lets it play. */
  resume(): void {
    void this.context.resume()
  }

  readonly onServerMessage = (data: unknown): void => {
    if (!isAudioMessage(data)) return
    const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0))
    const samples = new Int16Array(bytes.buffer, 0, bytes.length >> 1)
    if (!samples.length) return
    const buffer = this.context.createBuffer(
      1,
      samples.length,
      data.sample_rate
    )
    buffer.getChannelData(0).set(Float32Array.from(samples, (s) => s / 32768))
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.gain)
    // Back to back within a line; a line after a pause starts LEAD_S out.
    this.next = Math.max(this.next, this.context.currentTime + LEAD_S)
    source.start(this.next)
    this.next += buffer.duration
  }
}

/** The demo's caller, or null outside demo mode. */
export const demoCaller = isDemo ? new DemoCaller() : null
