import type { Pose } from "@/avatar-runtime/avatar-runtime.js"

/**
 * Sam's face as the caller talks: she turns to them a little tilted and leaning
 * in, with her eyes on theirs, and nods when the bot hears a pause worth one
 * (server/avatar/listener.py). In the rig's acting units, angles in degrees.
 */
const LISTENING = {
  /** The posture: a tilt, to a different side each turn, a lean in, and brows a touch raised. */
  tilt: 2,
  lean: 1.5,
  brows: 0.8,
  /** Seconds the posture takes to settle as the caller starts, and to let go as Sam answers. */
  enter: 0.4,
  exit: 0.7,
  /** A full nod's dip, and how much of it a double's second nod takes, `beat` seconds later. */
  nod: 5,
  second: 0.6,
  beat: 0.4,
  /** Seconds a nod takes to dip, and to come back. */
  attack: 0.16,
  release: 0.42,
  /** With a full nod, the brows lift, the eyes narrow and the smile warms by these. */
  nodBrows: 1,
  nodEyes: 0.12,
  nodSmile: 1.5,
}

/** What listening adds to the face, and whether it holds the gaze. */
export interface ListeningActing {
  pose: Partial<Pose>
  attend: boolean
}

export interface Listening {
  /** The caller has started a turn (true), or Sam is answering (false). */
  listen(on: boolean, nowMs?: number): void
  /** Nod now: `strength` 0–1, twice when `double`. */
  nod(strength: number, double: boolean, nowMs?: number): void
  actingAt(nowMs: number): ListeningActing
}

const smooth = (value: number) => {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

export function createListening(): Listening {
  let on = false
  let side = 1
  // The posture's weight when it last changed course, and when.
  let from = 0
  let since = -Infinity
  const nods: { at: number; strength: number }[] = []

  const weightAt = (nowMs: number) => {
    const seconds = on ? LISTENING.enter : LISTENING.exit
    return (
      from + ((on ? 1 : 0) - from) * smooth((nowMs - since) / 1000 / seconds)
    )
  }

  return {
    listen(next, nowMs = performance.now()) {
      if (next === on) return
      from = weightAt(nowMs)
      since = nowMs
      on = next
      if (on) side = -side
      // Sam stops nodding as she answers.
      else nods.length = 0
    },
    nod(strength, double, nowMs = performance.now()) {
      nods.push({ at: nowMs, strength })
      if (double) {
        const at = nowMs + LISTENING.beat * 1000
        nods.push({ at, strength: strength * LISTENING.second })
      }
    },
    actingAt(nowMs) {
      const weight = weightAt(nowMs)
      const length = (LISTENING.attack + LISTENING.release) * 1000
      let dip = 0
      for (const { at, strength } of nods) {
        const t = (nowMs - at) / 1000
        if (t < 0 || t > LISTENING.attack + LISTENING.release) continue
        const head =
          t < LISTENING.attack
            ? smooth(t / LISTENING.attack)
            : 1 - smooth((t - LISTENING.attack) / LISTENING.release)
        dip += strength * head
      }
      while (nods[0] && nowMs - nods[0].at > length) nods.shift()
      const brows = -(LISTENING.brows * weight + LISTENING.nodBrows * dip)
      return {
        pose: {
          headAngle: LISTENING.tilt * side * weight,
          headY: LISTENING.lean * weight + LISTENING.nod * dip,
          browLeft: brows,
          browRight: brows,
          eyeLeft: -LISTENING.nodEyes * dip,
          eyeRight: -LISTENING.nodEyes * dip,
          smile: LISTENING.nodSmile * dip,
        },
        attend: weight > 0.5,
      }
    },
  }
}
