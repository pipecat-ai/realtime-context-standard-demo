let context: AudioContext | null = null

/**
 * A short two-note blip for a tool call, quiet under the bot's voice.
 * Synthesised with Web Audio, so there's no audio file to ship.
 */
export function playChime() {
  try {
    context ??= new AudioContext()
    const start = context.currentTime
    for (const [offset, frequency] of [
      [0, 880],
      [0.09, 1320],
    ] as const) {
      const osc = context.createOscillator()
      const gain = context.createGain()
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18)
      osc.connect(gain).connect(context.destination)
      osc.start(start + offset)
      osc.stop(start + offset + 0.2)
    }
  } catch {
    // No audio (blocked or unsupported): the flash still shows the call.
  }
}
