// avatar-runtime 905cc2a74abfa185: plays a creator export (README.md); the vendored lipsync's licence is NOTICE.md.
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/core/geom.ts
function round(v, digits = 2) {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
}
function fmt(v, digits = 2) {
  if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`);
  return String(round(v, digits));
}
var clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
var TOKEN = /[MmLlHhVvCcSsQqTtZzAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
var ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 };
function parsePath(d) {
  const tokens = d.match(TOKEN) ?? [];
  const out = [];
  let i = 0;
  let cmd = "";
  let cur = [0, 0];
  let start = [0, 0];
  let lastC = null;
  let lastQ = null;
  const isCmd = (t) => /^[A-Za-z]$/.test(t);
  const num2 = () => {
    const t = tokens[i++];
    if (t === void 0 || isCmd(t)) throw new Error(`path: expected a number in "${d.slice(0, 60)}\u2026"`);
    return Number(t);
  };
  const cubic = (p1, p2, p) => {
    out.push({ c: "C", p1, p2, p });
    lastC = p2;
    lastQ = null;
    cur = p;
  };
  const quad = (q, p) => {
    const p1 = [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])];
    const p2 = [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])];
    out.push({ c: "C", p1, p2, p });
    lastQ = q;
    lastC = null;
    cur = p;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (isCmd(t)) {
      cmd = t;
      i++;
      if (cmd === "A" || cmd === "a") throw new Error("path: arcs are not supported; convert them to cubics first");
      if (cmd === "Z" || cmd === "z") {
        out.push({ c: "Z" });
        cur = start;
        lastC = lastQ = null;
        continue;
      }
    } else if (!cmd || cmd === "Z" || cmd === "z") {
      throw new Error(`path: a number without a command in "${d.slice(0, 60)}\u2026"`);
    }
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const arity = ARITY[up];
    if (i + arity > tokens.length) throw new Error(`path: "${cmd}" needs ${arity} numbers`);
    const pt = () => {
      const x = num2(), y = num2();
      return rel ? [cur[0] + x, cur[1] + y] : [x, y];
    };
    switch (up) {
      case "M": {
        const p = pt();
        out.push({ c: "M", p });
        cur = start = p;
        lastC = lastQ = null;
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        const p = pt();
        out.push({ c: "L", p });
        cur = p;
        lastC = lastQ = null;
        break;
      }
      case "H": {
        const x = num2();
        const p = [rel ? cur[0] + x : x, cur[1]];
        out.push({ c: "L", p });
        cur = p;
        lastC = lastQ = null;
        break;
      }
      case "V": {
        const y = num2();
        const p = [cur[0], rel ? cur[1] + y : y];
        out.push({ c: "L", p });
        cur = p;
        lastC = lastQ = null;
        break;
      }
      case "C": {
        const p1 = pt(), p2 = pt(), p = pt();
        cubic(p1, p2, p);
        break;
      }
      case "S": {
        const prev = lastC;
        const p1 = prev ? [2 * cur[0] - prev[0], 2 * cur[1] - prev[1]] : [cur[0], cur[1]];
        const p2 = pt(), p = pt();
        cubic(p1, p2, p);
        break;
      }
      case "Q": {
        const q = pt(), p = pt();
        quad(q, p);
        break;
      }
      case "T": {
        const prev = lastQ;
        const q = prev ? [2 * cur[0] - prev[0], 2 * cur[1] - prev[1]] : [cur[0], cur[1]];
        const p = pt();
        quad(q, p);
        break;
      }
    }
  }
  return out;
}
function formatPath(cmds, digits = 2) {
  const f = (p) => `${fmt(p[0], digits)} ${fmt(p[1], digits)}`;
  return cmds.map((k) => k.c === "Z" ? "Z" : k.c === "C" ? `C ${f(k.p1)} ${f(k.p2)} ${f(k.p)}` : `${k.c} ${f(k.p)}`).join(" ");
}
function mapCmds(cmds, f) {
  return cmds.map((k) => k.c === "Z" ? k : k.c === "C" ? { c: "C", p1: f(k.p1), p2: f(k.p2), p: f(k.p) } : { c: k.c, p: f(k.p) });
}
var mapPath = (d, f) => formatPath(mapCmds(parsePath(d), f));
function pathPoints(d) {
  const pts = [];
  for (const k of parsePath(d)) {
    if (k.c === "C") pts.push(k.p1, k.p2, k.p);
    else if (k.c !== "Z") pts.push(k.p);
  }
  return pts;
}
function pathBounds(d) {
  return pointsBounds(pathPoints(d));
}
function pointsBounds(pts) {
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
function unionBox(a, b) {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
var dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
var IDENTITY = [1, 0, 0, 1, 0, 0];
function multiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}
var chain = (...ms) => ms.reduce((acc, m) => multiply(m, acc), IDENTITY);
function invert(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error("affine: not invertible");
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
var applyAffine = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
var applyLinear = (m, v) => [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]];
var translation = (dx, dy) => [1, 0, 0, 1, dx, dy];
function rotation(deg, about = [0, 0]) {
  const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const [x, y] = about;
  return [cos, sin, -sin, cos, x - cos * x + sin * y, y - sin * x - cos * y];
}
var scaling = (sx, sy = sx, about = [0, 0]) => [sx, 0, 0, sy, about[0] * (1 - sx), about[1] * (1 - sy)];
var affineToSvg = (m) => `matrix(${m.map((v) => fmt(v, 4)).join(" ")})`;
var TRANSFORM_ITEM = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
function parseTransform(value) {
  if (value.replace(TRANSFORM_ITEM, "").replace(/[\s,]/g, "") !== "") return null;
  let m = IDENTITY;
  for (const [, name, args] of value.matchAll(TRANSFORM_ITEM)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (!v.every(Number.isFinite)) return null;
    const [a = 0, b, c] = v;
    let item = null;
    if (name === "matrix" && v.length === 6) item = v;
    else if (name === "translate" && (v.length === 1 || v.length === 2)) item = translation(a, b ?? 0);
    else if (name === "scale" && (v.length === 1 || v.length === 2)) item = [a, 0, 0, b ?? a, 0, 0];
    else if (name === "rotate" && (v.length === 1 || v.length === 3)) item = rotation(a, [b ?? 0, c ?? 0]);
    else if (name === "skewX" && v.length === 1) item = [1, 0, Math.tan(a * Math.PI / 180), 1, 0, 0];
    else if (name === "skewY" && v.length === 1) item = [1, Math.tan(a * Math.PI / 180), 0, 1, 0, 0];
    if (!item) return null;
    m = multiply(m, item);
  }
  return m;
}

// src/core/face/pose.ts
var POSE_REST = Object.freeze({
  headAngle: 0,
  headX: 0,
  headY: 0,
  chest: 0,
  browLeft: 0,
  browRight: 0,
  browAngleLeft: 0,
  browAngleRight: 0,
  eyeLeft: 1,
  eyeRight: 1,
  eyeSmile: 0,
  gazeX: 0,
  gazeY: 0,
  smile: 1,
  smirk: 0,
  cheek: 0,
  restOpen: 0
});
var POSE_KEYS = Object.freeze(Object.keys(POSE_REST));
var KEYS = new Set(POSE_KEYS);
var isPoseKey = (k) => KEYS.has(k);
function poseOf(fields) {
  const pose = { ...POSE_REST };
  for (const [k, v] of Object.entries(fields ?? {})) if (isPoseKey(k) && typeof v === "number" && Number.isFinite(v)) pose[k] = v;
  return pose;
}
var HEAD_KEYS = /* @__PURE__ */ new Set(["headAngle", "headX", "headY", "chest"]);
var PoseSpring = class {
  constructor(initial = POSE_REST) {
    __publicField(this, "pose");
    __publicField(this, "velocity", { ...POSE_REST });
    __publicField(this, "target");
    __publicField(this, "anticipation");
    __publicField(this, "anticipationRemaining", 0);
    __publicField(this, "emphasis", 1);
    __publicField(this, "sinceRetarget", Infinity);
    this.pose = { ...initial };
    this.target = { ...this.pose };
    this.anticipation = { ...this.pose };
    for (const key of POSE_KEYS) this.velocity[key] = 0;
  }
  /** Spring towards `target`. `emphasis` (0–1.5) scales the head's anticipation; 0 (reduced motion) has none and no overshoot. */
  setTarget(target, emphasis = 1) {
    this.target = { ...target };
    this.emphasis = clamp(emphasis, 0, 1.5);
    this.anticipationRemaining = this.emphasis > 0 && this.sinceRetarget >= 0.15 ? 0.065 : 0;
    this.sinceRetarget = 0;
    this.anticipation = { ...this.target };
    for (const key of HEAD_KEYS) {
      this.anticipation[key] = this.pose[key] - (this.target[key] - this.pose[key]) * 0.28 * this.emphasis;
    }
  }
  /** Advance `seconds` (held to 0–0.1) and return the pose. */
  step(seconds) {
    let dt = clamp(seconds, 0, 0.1);
    if (dt === 0) return { ...this.pose };
    this.sinceRetarget += dt;
    while (dt > 1e-12) {
      const anticipating = this.anticipationRemaining > 1e-12;
      const interval = anticipating ? Math.min(dt, this.anticipationRemaining) : dt;
      for (const key of POSE_KEYS) {
        const isHead = HEAD_KEYS.has(key);
        const target = anticipating && isHead ? this.anticipation[key] : this.target[key];
        const offset = this.pose[key] - target;
        const omega = isHead ? 24 : 25;
        const damping = isHead && this.emphasis > 0 ? 0.78 : 1;
        const velocity = this.velocity[key];
        if (damping === 1) {
          const impulse = velocity + omega * offset;
          const decay = Math.exp(-omega * interval);
          this.pose[key] = target + (offset + impulse * interval) * decay;
          this.velocity[key] = (velocity - omega * impulse * interval) * decay;
        } else {
          const attenuation = omega * damping;
          const frequency = omega * Math.sqrt(1 - damping * damping);
          const sine = Math.sin(frequency * interval);
          const cosine = Math.cos(frequency * interval);
          const decay = Math.exp(-attenuation * interval);
          const quadrature = (velocity + attenuation * offset) / frequency;
          this.pose[key] = target + decay * (offset * cosine + quadrature * sine);
          this.velocity[key] = decay * (velocity * cosine - (attenuation * quadrature + frequency * offset) * sine);
        }
      }
      dt -= interval;
      if (anticipating) this.anticipationRemaining -= interval;
    }
    return { ...this.pose };
  }
};

// src/core/motion/engine.ts
var smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
var pulse = (t, start, duration) => {
  const x = (t - start) / duration;
  return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2;
};
var smoother = (x) => {
  const t = clamp(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var clothSettle = (age) => age <= 0 || age >= 1.4 ? 0 : Math.sin(age * 10.5) * Math.exp(-age * 3) * smooth(age / 0.08) * (1 - smooth((age - 1.1) / 0.3));
var NEUTRAL_IDLE = Object.freeze({
  cycle: 14.4,
  breathing: 1,
  sway: 1,
  tempo: 1,
  looks: [
    { at: 1.35, hold: 1.05, x: -7, y: 0, tilt: -1 },
    { at: 6.2, hold: 1.45, x: 8, y: -2, tilt: 1.4 },
    { at: 10.9, hold: 0.7, x: -3, y: 2, chin: 1.8 }
  ],
  gestures: [{ at: 9.2, duration: 1.1, y: 2.2, angle: -1.4 }]
});
function lookEnvelope(time, cue, head = false) {
  const delay = head ? 0.18 : 0;
  const entrance = head ? 0.42 : 0.14;
  const release = head ? 0.62 : 0.3;
  const start = cue.at + delay;
  return smoother((time - start) / entrance) * (1 - smoother((time - start - entrance - cue.hold) / release));
}
function sampleMotion(seconds, amount = 1, profile = NEUTRAL_IDLE) {
  const strength = clamp(amount, 0, 2);
  const time = Number.isFinite(seconds) ? seconds : 0;
  const localTime = (time % profile.cycle + profile.cycle) % profile.cycle;
  const cycle = (time % 13.7 + 13.7) % 13.7;
  const blink = Math.max(
    pulse(cycle, 3.1, 0.17),
    pulse(cycle, 8.2, 0.19),
    pulse(cycle, 8.48, 0.14)
  );
  let glanceX = 0;
  let glanceY = 0;
  let headAngle = 0;
  let headX = 0;
  let headY = 0;
  let chest = 0;
  let scarfFollowThrough = 0;
  for (const cue of profile.looks) {
    const eyes = lookEnvelope(localTime, cue);
    const head = lookEnvelope(localTime, cue, true);
    glanceX += cue.x * eyes;
    glanceY += cue.y * eyes;
    headAngle += (cue.x * 0.22 + (cue.tilt ?? 0)) * head;
    headX += cue.x * 0.4 * head;
    headY += (cue.y * 0.22 + (cue.chin ?? 0)) * head;
    const release = cue.at + 0.18 + 0.42 + cue.hold + 0.25;
    scarfFollowThrough += (cue.x * 0.035 + (cue.tilt ?? 0) * 0.08) * (clothSettle(localTime - release) + clothSettle(localTime + profile.cycle - release));
  }
  for (const cue of profile.gestures) {
    const weight = pulse(localTime, cue.at, cue.duration);
    headAngle += (cue.angle ?? 0) * weight;
    headY += (cue.y ?? 0) * weight;
    chest += (cue.chest ?? 0) * weight;
    const impulse = (cue.angle ?? 0) * 0.1 - (cue.y ?? 0) * 0.07;
    const release = cue.at + cue.duration * 0.5 + 0.08;
    scarfFollowThrough += impulse * (clothSettle(localTime - release) + clothSettle(localTime + profile.cycle - release));
  }
  return {
    breath: Math.sin(time * 1.65 * profile.tempo) * profile.breathing * strength,
    sway: Math.sin(time * 0.67 * profile.tempo) * profile.sway * strength,
    blink: strength === 0 ? 0 : blink,
    glanceX: glanceX * strength,
    glanceY: glanceY * strength,
    hair: (Math.sin(time * 1.65 * profile.tempo - 0.7) * 0.75 + Math.sin(time * 0.84 - 0.3) * 0.35 + headAngle * -0.1) * strength,
    rearHair: (Math.sin(time * 1.27 * profile.tempo - 0.92) * 0.75 + Math.sin(time * 0.81 - 0.45) * 0.28 + headAngle * -0.09) * strength,
    scarf: (Math.sin(time * 1.19 * profile.tempo - 1.4) * 0.95 + Math.sin(time * 0.7 + 0.55) * 0.35 + headAngle * -0.12) * strength,
    scarfBounce: (Math.sin(time * 2.73 * profile.tempo - 0.4) * 0.28 + Math.sin(time * 1.83 - 1.8) * 0.2 + scarfFollowThrough) * strength,
    headAngle: headAngle * strength,
    headX: headX * strength,
    headY: headY * strength,
    chest: chest * strength
  };
}
var MOTION_KEYS = Object.keys(sampleMotion(0));
var GONE = 1e-12;
var MotionMixer = class {
  constructor(id, profile = NEUTRAL_IDLE) {
    __publicField(this, "shares", /* @__PURE__ */ new Map());
    __publicField(this, "target");
    this.target = id;
    this.shares.set(id, { profile, weight: 1, velocity: 0 });
  }
  /** Cross-fade to an expression's profile. */
  setTarget(id, profile) {
    this.target = id;
    const share = this.shares.get(id);
    if (share) share.profile = profile;
    else this.shares.set(id, { profile, weight: 0, velocity: 0 });
  }
  /** The mixed idle frame at `seconds`, after stepping the weights `dt` (held to 0–0.1). */
  sample(seconds, dt, amount = 1) {
    const interval = clamp(dt, 0, 0.1);
    const omega = 15;
    const decay = Math.exp(-omega * interval);
    if (interval > 0) {
      for (const [id, share] of this.shares) {
        const target = id === this.target ? 1 : 0;
        const offset = share.weight - target;
        const impulse = share.velocity + omega * offset;
        share.weight = target + (offset + impulse * interval) * decay;
        share.velocity = (share.velocity - omega * impulse * interval) * decay;
        if (Math.abs(share.weight - target) < GONE && Math.abs(share.velocity) < GONE) {
          if (target === 0) this.shares.delete(id);
          else [share.weight, share.velocity] = [1, 0];
        }
      }
    }
    const only = this.shares.size === 1 ? this.shares.get(this.target) : void 0;
    if (only && only.weight === 1 && only.velocity === 0) return sampleMotion(seconds, amount, only.profile);
    const result = sampleMotion(seconds, 0);
    for (const share of this.shares.values()) {
      const frame = sampleMotion(seconds, amount, share.profile);
      for (const key of MOTION_KEYS) result[key] += frame[key] * share.weight;
    }
    return result;
  }
};

// src/core/motion/reaction.ts
var REACTION_CANCEL_SECONDS = 0.25;
var BODY_KEYS = ["headAngle", "headX", "headY", "chest"];
var SECONDARY_KEYS = ["hair", "rearHair", "scarf", "scarfBounce"];
var REACTION_MOTION_KEYS = [...BODY_KEYS, ...SECONDARY_KEYS];
var emptyMotion = () => ({
  headAngle: 0,
  headX: 0,
  headY: 0,
  chest: 0,
  hair: 0,
  rearHair: 0,
  scarf: 0,
  scarfBounce: 0
});
var zeroPose = () => Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));
var smooth2 = (value) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var pulseAt = (p, age) => {
  const t = (age - p.at) / p.for;
  return t > 0 && t < 1 ? p.amount * Math.sin(Math.PI * t) ** 2 : 0;
};
var pulses = (list, age) => {
  let sum = 0;
  for (const p of list ?? []) sum += pulseAt(p, age);
  return sum;
};
function spring(value, velocity, target, dt) {
  const omega = 25;
  const offset = value - target;
  const impulse = velocity + omega * offset;
  const decay = Math.exp(-omega * dt);
  return [target + (offset + impulse * dt) * decay, (velocity - omega * impulse * dt) * decay];
}
function targets(def, held, age, quiet) {
  const pose = { ...held };
  const motion = emptyMotion();
  if (!quiet) {
    for (const [k, list] of Object.entries(def.tracks.pose ?? {})) if (k in pose) pose[k] += pulses(list, age);
    for (const k of REACTION_MOTION_KEYS) motion[k] = pulses(def.tracks.motion?.[k], age);
  }
  return { pose, motion };
}
var ReactionDriver = class {
  /** `reactionOf` finds a reaction by id (the animation library's); a trigger for an id it does not know is left unread. */
  constructor(reactionOf2) {
    __publicField(this, "reactionOf", reactionOf2);
    __publicField(this, "active", null);
    __publicField(this, "lastTrigger");
    __publicField(this, "pose", zeroPose());
    __publicField(this, "poseVelocity", zeroPose());
    __publicField(this, "motion", emptyMotion());
    __publicField(this, "motionVelocity", emptyMotion());
    __publicField(this, "startleMix", 0);
    __publicField(this, "startleVelocity", 0);
    __publicField(this, "eyeOpening", 1);
    __publicField(this, "startle", 0);
  }
  /** The reaction under way (its id), or null. */
  get playing() {
    return this.active?.def.id ?? null;
  }
  ownership(nowMs2) {
    const cue = this.active;
    if (!cue) return 0;
    if (cue.cancelStarted !== null) {
      return cue.cancelWeight * (1 - smooth2((nowMs2 - cue.cancelStarted) / (REACTION_CANCEL_SECONDS * 1e3)));
    }
    const { enter, release, duration } = cue.def;
    const age = Math.max(0, (nowMs2 - cue.started) / 1e3);
    return (cue.entryWeight + (1 - cue.entryWeight) * smooth2(age / enter)) * (1 - smooth2((age - release) / (duration - release)));
  }
  step({ basePose, baseMotion, trigger, nowMs: nowMs2, dt, amount, reducedMotion }) {
    if (this.active && (this.active.cancelStarted === null ? nowMs2 - this.active.started >= this.active.def.duration * 1e3 : nowMs2 - this.active.cancelStarted >= REACTION_CANCEL_SECONDS * 1e3)) this.active = null;
    const oldWeight = this.ownership(nowMs2);
    const def = trigger && Number.isFinite(trigger.trigger) && (this.lastTrigger === void 0 || trigger.trigger > this.lastTrigger) ? this.reactionOf(trigger.id) : void 0;
    if (def && trigger) {
      this.lastTrigger = trigger.trigger;
      if (oldWeight === 0) {
        this.pose = { ...basePose };
        this.poseVelocity = zeroPose();
        this.motion = emptyMotion();
        this.motionVelocity = emptyMotion();
        this.startleMix = def.startle ? 1 : 0;
        this.startleVelocity = 0;
        this.eyeOpening = (basePose.eyeLeft + basePose.eyeRight) / 2;
        this.startle = 0;
      }
      this.active = { def, held: poseOf(def.pose), started: nowMs2, entryWeight: oldWeight, cancelStarted: null, cancelWeight: 0 };
    } else if (!trigger && this.active && this.active.cancelStarted === null) {
      this.active.cancelStarted = nowMs2;
      this.active.cancelWeight = oldWeight;
    }
    const cue = this.active;
    if (!cue) return { pose: basePose, motion: baseMotion, reaction: null };
    const age = Math.max(0, (nowMs2 - cue.started) / 1e3);
    const weight = this.ownership(nowMs2);
    const cancelled = cue.cancelStarted !== null && nowMs2 - cue.cancelStarted >= REACTION_CANCEL_SECONDS * 1e3;
    if (cancelled || cue.cancelStarted === null && age >= cue.def.duration) {
      this.active = null;
      return { pose: basePose, motion: baseMotion, reaction: null };
    }
    const strength = reducedMotion ? 0 : clamp(amount, 0, 1.5);
    const quiet = strength === 0;
    const target = targets(cue.def, cue.held, age, quiet);
    for (const key of BODY_KEYS) target.pose[key] = basePose[key] + (target.pose[key] - basePose[key]) * Math.min(strength, 1);
    const seconds = clamp(dt, 0, 0.1);
    [this.startleMix, this.startleVelocity] = spring(this.startleMix, this.startleVelocity, cue.def.startle ? 1 : 0, seconds);
    for (const key of POSE_KEYS) [this.pose[key], this.poseVelocity[key]] = spring(this.pose[key], this.poseVelocity[key], target.pose[key], seconds);
    for (const key of REACTION_MOTION_KEYS) {
      [this.motion[key], this.motionVelocity[key]] = spring(this.motion[key], this.motionVelocity[key], target.motion[key] * strength, seconds);
    }
    const pose = { ...basePose };
    for (const key of POSE_KEYS) pose[key] += (this.pose[key] - pose[key]) * weight;
    const motion = { ...baseMotion, glanceX: baseMotion.glanceX * (1 - weight), glanceY: baseMotion.glanceY * (1 - weight) };
    for (const key of BODY_KEYS) motion[key] = baseMotion[key] * (1 - weight) + (quiet ? 0 : this.motion[key] * weight);
    for (const key of SECONDARY_KEYS) motion[key] += quiet ? 0 : this.motion[key] * weight;
    if (quiet) for (const key of BODY_KEYS) pose[key] = basePose[key];
    const startling = clamp(this.startleMix) * weight;
    const opening = (pose.eyeLeft + pose.eyeRight) / 2;
    if (quiet || dt > 0.25) this.startle = 0;
    else if (seconds > 0) this.startle = Math.max(0, (opening - this.eyeOpening) / seconds) * startling * strength;
    this.eyeOpening = opening;
    return { pose, motion, reaction: { id: cue.def.id, age, weight, startle: this.startle } };
  }
};

// src/core/motion/animation.ts
var NEUTRAL_EXPRESSION = Object.freeze({
  id: "neutral",
  name: "Neutral",
  gloss: "Calm and attentive: the character as drawn, breathing, glancing about now and then.",
  icon: "meh",
  pose: {},
  idle: NEUTRAL_IDLE,
  source: { kind: "builtin" }
});
var BUILTIN_ANIMATION = Object.freeze({ expressions: [NEUTRAL_EXPRESSION], reactions: [] });
var ANIMATION_ID = /^[a-z][a-z0-9-]*$/;
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var num = (v) => typeof v === "number" && Number.isFinite(v);
var Bad = class extends Error {
};
function bad(message) {
  throw new Bad(message);
}
function text(o, key) {
  const v = o[key];
  if (typeof v !== "string" || !v.trim()) bad(`${key} must be a non-empty string`);
  return v.trim();
}
function number(o, key, test = () => true, what = "a number") {
  const v = o[key];
  if (!num(v) || !test(v)) bad(`${key} must be ${what}`);
  return v;
}
function optionalNumber(o, key) {
  if (o[key] === void 0) return void 0;
  return number(o, key);
}
function poseFields(v, where) {
  if (v === void 0) return {};
  if (!isObj(v)) bad(`${where} must be an object`);
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (!isPoseKey(k)) bad(`${where}: "${k}" is not a pose field`);
    if (!num(x)) bad(`${where}.${k} must be a number`);
    out[k] = x;
  }
  return out;
}
function idleProfile(v) {
  if (!isObj(v)) bad("idle must be an object");
  const o = v;
  const looks = o.looks ?? [];
  const gestures = o.gestures ?? [];
  if (!Array.isArray(looks)) bad("idle.looks must be a list");
  if (!Array.isArray(gestures)) bad("idle.gestures must be a list");
  return {
    cycle: number(o, "cycle", (x) => x > 0, "above 0"),
    breathing: number(o, "breathing"),
    sway: number(o, "sway"),
    tempo: number(o, "tempo", (x) => x > 0, "above 0"),
    looks: looks.map((l, i) => {
      if (!isObj(l)) return bad(`idle.looks[${i}] must be an object`);
      const tilt = optionalNumber(l, "tilt");
      const chin = optionalNumber(l, "chin");
      return {
        at: number(l, "at"),
        hold: number(l, "hold", (x) => x >= 0, "0 or more"),
        x: number(l, "x"),
        y: number(l, "y"),
        ...tilt !== void 0 ? { tilt } : {},
        ...chin !== void 0 ? { chin } : {}
      };
    }),
    gestures: gestures.map((g, i) => {
      if (!isObj(g)) return bad(`idle.gestures[${i}] must be an object`);
      const angle = optionalNumber(g, "angle");
      const y = optionalNumber(g, "y");
      const chest = optionalNumber(g, "chest");
      return {
        at: number(g, "at"),
        duration: number(g, "duration", (x) => x > 0, "above 0"),
        ...angle !== void 0 ? { angle } : {},
        ...y !== void 0 ? { y } : {},
        ...chest !== void 0 ? { chest } : {}
      };
    })
  };
}
function source(v, builtin) {
  if (v === void 0) return builtin ? { kind: "builtin" } : void 0;
  if (!isObj(v)) return bad("source must be an object");
  if (v.kind === "builtin") return { kind: "builtin" };
  if (v.kind !== "prompt") return bad(`source.kind must be "builtin" or "prompt"`);
  const out = { kind: "prompt", prompt: text(v, "prompt") };
  if (typeof v.model === "string") out.model = v.model;
  if (typeof v.createdAt === "string") out.createdAt = v.createdAt;
  return out;
}
function header(o) {
  const id = text(o, "id");
  if (!ANIMATION_ID.test(id)) bad(`id "${id}" must be lower-case words joined by hyphens`);
  return { id, name: text(o, "name"), gloss: text(o, "gloss"), icon: text(o, "icon") };
}
function effectNames(v) {
  if (v === void 0) return void 0;
  if (!Array.isArray(v)) return bad("effects must be a list of effect ids");
  const out = [];
  for (const x of v) {
    if (typeof x !== "string" || !ANIMATION_ID.test(x)) bad(`effects: ${JSON.stringify(x)} is not an effect id`);
    if (!out.includes(x)) out.push(x);
  }
  return out.length ? out : void 0;
}
function expressionDef(v, builtin = false) {
  if (!isObj(v)) return bad("an expression must be an object");
  const def = { ...header(v), pose: poseFields(v.pose, "pose"), idle: idleProfile(v.idle) };
  const effects = effectNames(v.effects);
  if (effects) def.effects = effects;
  const src = source(v.source, builtin);
  if (src) def.source = src;
  return def;
}
function pulseList(v, where) {
  if (!Array.isArray(v)) return bad(`${where} must be a list of pulses`);
  return v.map((p, i) => {
    if (!isObj(p)) return bad(`${where}[${i}] must be a pulse`);
    return { at: number(p, "at", (x) => x >= 0, "0 or more"), for: number(p, "for", (x) => x > 0, "above 0"), amount: number(p, "amount") };
  });
}
var MOTION_KEYS2 = new Set(REACTION_MOTION_KEYS);
function reactionDef(v, builtin = false) {
  if (!isObj(v)) return bad("a reaction must be an object");
  const duration = number(v, "duration", (x) => x > 0, "above 0");
  const enter = number(v, "enter", (x) => x > 0 && x <= duration, "above 0 and at most the duration");
  const release = number(v, "release", (x) => x >= 0 && x < duration, "0 or more and below the duration");
  const tracks = {};
  const t = v.tracks ?? {};
  if (!isObj(t)) bad("tracks must be an object");
  for (const [k, list] of Object.entries(isObj(t.pose) ? t.pose : t.pose === void 0 ? {} : bad("tracks.pose must be an object"))) {
    if (!isPoseKey(k)) bad(`tracks.pose: "${k}" is not a pose field`);
    (tracks.pose ?? (tracks.pose = {}))[k] = pulseList(list, `tracks.pose.${k}`);
  }
  for (const [k, list] of Object.entries(isObj(t.motion) ? t.motion : t.motion === void 0 ? {} : bad("tracks.motion must be an object"))) {
    if (!MOTION_KEYS2.has(k)) bad(`tracks.motion: "${k}" is not a motion channel (${REACTION_MOTION_KEYS.join(", ")})`);
    (tracks.motion ?? (tracks.motion = {}))[k] = pulseList(list, `tracks.motion.${k}`);
  }
  if (v.startle !== void 0 && typeof v.startle !== "boolean") bad("startle must be true or false");
  const def = { ...header(v), duration, enter, release, pose: poseFields(v.pose, "pose"), tracks };
  if (v.startle === true) def.startle = true;
  const effects = effectNames(v.effects);
  if (effects) def.effects = effects;
  const src = source(v.source, builtin);
  if (src) def.source = src;
  return def;
}
var HEX = /^#[0-9a-f]{6}$/;
function hex(o, key) {
  const v = o[key];
  if (typeof v !== "string" || !HEX.test(v)) bad(`${key} must be a colour, #rrggbb in lower case`);
  return v;
}
function vec(o, key) {
  const v = o[key];
  if (!Array.isArray(v) || v.length !== 2 || !v.every(num)) bad(`${key} must be [x, y]`);
  return [v[0], v[1]];
}
function pathData(o, key) {
  const d = text(o, key);
  let ok = false;
  try {
    ok = !/[Aa]/.test(d) && parsePath(d).length > 0;
  } catch {
    ok = false;
  }
  if (!ok) bad(`${key} must be path data without arcs`);
  return d;
}
function optional(o, key, read) {
  return o[key] === void 0 ? void 0 : read();
}
function paint(o, key) {
  if (o[key] === void 0) return void 0;
  return o[key] === "particle" ? "particle" : hex(o, key);
}
var between = (lo, hi) => (x) => x >= lo && x <= hi;
function glyphDef(v, named = false) {
  if (!isObj(v)) return bad("a glyph must be an object");
  const g = { paths: [], wake: number(v, "wake", (x) => x >= 0, "0 or more") };
  if (named || v.id !== void 0) {
    g.id = text(v, "id");
    if (!ANIMATION_ID.test(g.id)) bad(`glyph id "${g.id}" must be lower-case words joined by hyphens`);
  }
  if (!Array.isArray(v.paths) || !v.paths.length) bad("paths must be a list of one or more paths");
  g.paths = v.paths.map((p, i) => {
    if (!isObj(p)) return bad(`paths[${i}] must be an object`);
    const out = { d: pathData(p, "d") };
    const fill = paint(p, "fill"), stroke = paint(p, "stroke");
    if (!fill && !stroke) bad(`paths[${i}] must have a fill or a stroke`);
    if (fill) out.fill = fill;
    if (stroke) out.stroke = stroke;
    const width = optional(p, "width", () => number(p, "width", (x) => x > 0, "above 0"));
    if (width !== void 0) out.width = width;
    return out;
  });
  for (const key of ["draw", "fade"]) {
    if (v[key] === void 0) continue;
    if (typeof v[key] !== "boolean") bad(`${key} must be true or false`);
    g[key] = v[key];
  }
  return g;
}
function particle(v, i, glyphs) {
  if (!isObj(v)) return bad(`particles[${i}] must be an object`);
  let glyph;
  if (typeof v.glyph === "string") {
    if (!glyphs.has(v.glyph)) bad(`particles[${i}]: no glyph "${v.glyph}"`);
    glyph = v.glyph;
  } else glyph = glyphDef(v.glyph);
  const p = { glyph, color: hex(v, "color"), at: vec(v, "at"), velocity: vec(v, "velocity") };
  const gravity = optional(v, "gravity", () => number(v, "gravity"));
  const spin = optional(v, "spin", () => number(v, "spin"));
  const delay = optional(v, "delay", () => number(v, "delay", (x) => x >= 0 && x < 1, "0 or more and below 1"));
  const size = optional(v, "size", () => number(v, "size", (x) => x > 0, "above 0"));
  if (gravity !== void 0) p.gravity = gravity;
  if (spin !== void 0) p.spin = spin;
  if (delay !== void 0) p.delay = delay;
  if (size !== void 0) p.size = size;
  return p;
}
function burstDef(v, glyphs) {
  if (!isObj(v)) return bad("burst must be an object");
  if (!Array.isArray(v.particles) || !v.particles.length) bad("burst.particles must be a list of one or more particles");
  return {
    duration: number(v, "duration", (x) => x > 0, "above 0"),
    particles: v.particles.map((p, i) => particle(p, i, glyphs))
  };
}
function shadeFill(v) {
  if (!isObj(v)) return bad("shade.fill must be an object");
  const opacity = (o) => optional(o, "opacity", () => number(o, "opacity", between(0, 1), "0\u20131"));
  if (v.color !== void 0) {
    const out = { color: hex(v, "color") };
    const o = opacity(v);
    if (o !== void 0) out.opacity = o;
    return out;
  }
  if (!Array.isArray(v.stops) || !v.stops.length) bad("shade.fill needs a color, or from, to and stops");
  let last = 0;
  const stops = v.stops.map((s, i) => {
    if (!isObj(s)) return bad(`stops[${i}] must be an object`);
    const at = number(s, "at", (x) => x >= last && x <= 1, "0\u20131, in order");
    last = at;
    const out = { at, color: hex(s, "color") };
    const o = opacity(s);
    if (o !== void 0) out.opacity = o;
    return out;
  });
  return { from: vec(v, "from"), to: vec(v, "to"), stops };
}
function shadeDef(v) {
  if (!isObj(v)) return bad("shade must be an object");
  const s = {
    enter: number(v, "enter", (x) => x > 0, "above 0"),
    exit: number(v, "exit", (x) => x > 0, "above 0"),
    over: text(v, "over")
  };
  if (v.fill !== void 0) s.fill = shadeFill(v.fill);
  if (v.lines !== void 0) {
    if (!Array.isArray(v.lines)) bad("shade.lines must be a list");
    s.lines = v.lines.map((l, i) => {
      if (!isObj(l)) return bad(`lines[${i}] must be an object`);
      const out = { d: pathData(l, "d"), color: hex(l, "color"), width: number(l, "width", (x) => x > 0, "above 0") };
      const o = optional(l, "opacity", () => number(l, "opacity", between(0, 1), "0\u20131"));
      if (o !== void 0) out.opacity = o;
      return out;
    });
  }
  if (!s.fill && !s.lines?.length) bad("a shade needs a fill or lines");
  return s;
}
function effectDef(v, glyphs = /* @__PURE__ */ new Set()) {
  if (!isObj(v)) return bad("an effect must be an object");
  const id = text(v, "id");
  if (!ANIMATION_ID.test(id)) bad(`id "${id}" must be lower-case words joined by hyphens`);
  if (v.burst === void 0 === (v.shade === void 0)) bad("an effect is a burst or a shade (one of the two)");
  const def = { id, name: text(v, "name"), gloss: text(v, "gloss") };
  if (v.burst !== void 0) def.burst = burstDef(v.burst, glyphs);
  else def.shade = shadeDef(v.shade);
  return def;
}
function entriesOf(v, format, key) {
  if (Array.isArray(v)) return v;
  if (isObj(v) && v.format === format && Array.isArray(v[key])) return v[key];
  return v === void 0 ? [] : [v];
}
function loadAnimation(sources) {
  const problems = [];
  const expressions = [];
  const reactions = [];
  const seenE = /* @__PURE__ */ new Set();
  const seenR = /* @__PURE__ */ new Set();
  const name = (v, i) => isObj(v) && typeof v.id === "string" ? v.id : String(i + 1);
  const take = (list, seen, what, read, label) => {
    try {
      const def = read();
      if (seen.has(def.id)) problems.push(`${what} ${def.id}: another ${what} has this id`);
      else {
        seen.add(def.id);
        list.push(def);
      }
    } catch (e) {
      if (!(e instanceof Bad)) throw e;
      problems.push(`${what} ${label}: ${e.message}`);
    }
  };
  const bundle = isObj(sources.expressions) && sources.expressions.format === "creator-animation" ? sources.expressions : null;
  if (bundle && bundle.version !== 1) problems.push(`animation.json version ${String(bundle.version)} is not 1`);
  const builtins = bundle ? Array.isArray(bundle.expressions) ? bundle.expressions : [] : entriesOf(sources.expressions, "creator-expressions", "expressions");
  builtins.forEach((v, i) => take(expressions, seenE, "expression", () => expressionDef(v, !bundle), name(v, i)));
  (sources.customExpressions ?? []).forEach((v, i) => {
    if (isObj(v) && v.format !== void 0 && v.format !== "creator-expression") problems.push(`expression ${name(v, i)}: format must be "creator-expression"`);
    else take(expressions, seenE, "expression", () => expressionDef(v), name(v, i));
  });
  const reactionEntries = bundle ? Array.isArray(bundle.reactions) ? bundle.reactions : [] : entriesOf(sources.reactions, "creator-reactions", "reactions");
  reactionEntries.forEach((v, i) => {
    if (isObj(v) && v.format !== void 0 && v.format !== "creator-reaction") problems.push(`reaction ${name(v, i)}: format must be "creator-reaction"`);
    else take(reactions, seenR, "reaction", () => reactionDef(v, false), name(v, i));
  });
  if (!seenE.has(NEUTRAL_EXPRESSION.id)) expressions.unshift({ ...NEUTRAL_EXPRESSION, idle: { ...NEUTRAL_IDLE } });
  const glyphs = [];
  const effects = [];
  const fx = bundle ? { glyphs: bundle.glyphs, effects: bundle.effects } : sources.effects;
  if (isObj(fx)) {
    if (fx.format !== void 0 && fx.format !== "creator-effects") problems.push(`effects: format must be "creator-effects"`);
    else {
      if (fx.format !== void 0 && fx.version !== 1) problems.push(`effects.json version ${String(fx.version)} is not 1`);
      const list = (v, what) => {
        if (v === void 0) return [];
        if (Array.isArray(v)) return v;
        problems.push(`${what}s must be a list`);
        return [];
      };
      const seenG = /* @__PURE__ */ new Set();
      list(fx.glyphs, "glyph").forEach((v, i) => take(glyphs, seenG, "glyph", () => glyphDef(v, true), name(v, i)));
      const seenFx = /* @__PURE__ */ new Set();
      list(fx.effects, "effect").forEach((v, i) => take(effects, seenFx, "effect", () => effectDef(v, seenG), name(v, i)));
    }
  } else if (fx !== void 0) problems.push("effects: must be an object with glyphs and effects");
  const known = new Set(effects.map((e) => e.id));
  for (const [what, list] of [["expression", expressions], ["reaction", reactions]]) {
    for (const def of list) {
      if (!def.effects) continue;
      for (const id of def.effects) if (!known.has(id)) problems.push(`${what} ${def.id}: no effect "${id}"`);
      const kept = def.effects.filter((id) => known.has(id));
      if (kept.length) def.effects = kept;
      else delete def.effects;
    }
  }
  const library = { expressions, reactions };
  if (effects.length) library.effects = effects;
  if (glyphs.length) library.glyphs = glyphs;
  return { library, problems };
}
function expressionOf(library, id) {
  const all = library.expressions;
  return all.find((e) => e.id === id) ?? all.find((e) => e.id === NEUTRAL_EXPRESSION.id) ?? NEUTRAL_EXPRESSION;
}
var reactionOf = (library, id) => library.reactions.find((r) => r.id === id);
var effectOf = (library, id) => library.effects?.find((e) => e.id === id);
var glyphOf = (library, id) => library.glyphs?.find((g) => g.id === id);

// src/runtime/load.ts
var isObj2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function checkAvatarFiles(rig, face) {
  const again = "export the character again from the creator";
  if (!isObj2(rig) || rig.format !== "creator-rig") throw new Error("rig.json is not a creator rig (format creator-rig).");
  if (rig.version !== 2) throw new Error(`rig.json is version ${String(rig.version)}; this runtime plays version 2: ${again}.`);
  if (!Array.isArray(rig.layers) || !rig.layers.every((l) => isObj2(l) && typeof l.key === "string")) {
    throw new Error("rig.json's layers have no keys.");
  }
  if (!isObj2(face) || face.format !== "creator-face") throw new Error("face.json is not a creator face (format creator-face).");
  if (face.version !== 2) throw new Error(`face.json is version ${String(face.version)}; this runtime plays version 2: ${again}.`);
  if (!isObj2(face.rig) || !Array.isArray(face.rig.eyes)) throw new Error("face.json has no rig.");
}
function readAnimationJson(json) {
  const again = "export the character again from the creator";
  if (!isObj2(json) || json.format !== "creator-animation") throw new Error("animation.json is not a creator animation (format creator-animation).");
  if (json.version !== 1) throw new Error(`animation.json is version ${String(json.version)}; this runtime plays version 1: ${again}.`);
  return loadAnimation({ expressions: json });
}
function folderUrl(base) {
  const page = typeof location !== "undefined" ? location.href : void 0;
  const url = new URL(String(base), page);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}
async function loadAvatar(base, options = {}) {
  const get = options.fetch ?? fetch;
  const folder = folderUrl(base);
  const read = async (name, optional2 = false) => {
    const url = new URL(name, folder).href;
    const res = await get(url, options.init);
    if (optional2 && (!res.ok || /text\/html/i.test(res.headers?.get?.("content-type") ?? ""))) return null;
    if (!res.ok) throw new Error(`${name} could not be loaded from ${url} (${res.status}).`);
    return res.text();
  };
  const [svg, rigText, faceText, animationText] = await Promise.all([
    read("character.svg"),
    read("rig.json"),
    read("face.json"),
    read("animation.json", true)
  ]);
  const parse = (name, text2) => {
    try {
      return JSON.parse(text2 ?? "");
    } catch {
      throw new Error(`${name} is not JSON.`);
    }
  };
  const rig = parse("rig.json", rigText);
  const face = parse("face.json", faceText);
  checkAvatarFiles(rig, face);
  const loaded = { base: folder.href, svg: svg ?? "", rig, face };
  if (animationText !== null) {
    const { library, problems } = readAnimationJson(parse("animation.json", animationText));
    if (problems.length) console.warn(`animation.json: ${problems.length} entries left out: ${problems.join("; ")}`);
    loaded.animation = library;
  }
  return loaded;
}

// src/runtime/ids.ts
var mounts = 0;
function mountPrefix() {
  mounts += 1;
  return `cra${mounts.toString(36)}${Math.random().toString(36).slice(2, 6)}-`;
}
var idPart = (key) => key.replace(/[^A-Za-z0-9_-]/g, "-");
function scopedIds(ids, prefix) {
  const out = /* @__PURE__ */ new Map();
  for (const id of ids) if (id) out.set(id, prefix + id);
  return out;
}
var URL_REF = /url\(\s*(["']?)#([^"')\s]+)\1\s*\)/g;
function rewriteUrls(value, ids) {
  if (!value.includes("url(")) return value;
  return value.replace(URL_REF, (whole, quote, id) => {
    const to = ids.get(id);
    return to === void 0 ? whole : `url(${quote}#${to}${quote})`;
  });
}
function rewriteHref(value, ids) {
  const v = value.trim();
  if (!v.startsWith("#")) return value;
  const to = ids.get(v.slice(1));
  return to === void 0 ? value : `#${to}`;
}
var ID_LISTS = /* @__PURE__ */ new Set(["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]);
function rewriteAttribute(name, value, ids) {
  if (name === "id") return ids.get(value) ?? value;
  if (name === "href" || name === "xlink:href") return rewriteHref(value, ids);
  if (ID_LISTS.has(name)) return value.split(/\s+/).map((v) => ids.get(v) ?? v).join(" ");
  return rewriteUrls(value, ids);
}
function clipRef(attribute, style) {
  const from = (v) => v ? /url\(\s*["']?#([^"')\s]+)["']?\s*\)/.exec(v)?.[1] ?? null : null;
  return from(attribute) ?? from(style ? /clip-path\s*:\s*([^;]+)/.exec(style)?.[1] ?? null : null);
}

// src/core/face/brows.ts
var LIFT_PER_SCALE = 2.1 / 2.15;
var EPSILON = 1e-9;
var rest = () => [1, 0, 0, 1, 0, 0];
function browPose(spec, lift, angle, actingScale) {
  const scale = Number.isFinite(actingScale) && actingScale > 0 ? actingScale : 0;
  const dy = (Number.isFinite(lift) ? lift : 0) * scale * LIFT_PER_SCALE;
  const turn = Number.isFinite(angle) ? angle : 0;
  if (Math.abs(dy) <= EPSILON && Math.abs(turn) <= EPSILON) return rest();
  let inverse;
  try {
    inverse = invert(spec.frame);
  } catch {
    return rest();
  }
  const centre = applyAffine(spec.frame, spec.centre);
  return chain(spec.frame, rotation(turn, centre), translation(0, dy), inverse);
}
function browOf(spec, pose) {
  return spec.side === "right" ? { lift: pose.browRight, angle: pose.browAngleRight } : { lift: pose.browLeft, angle: pose.browAngleLeft };
}
var isRestAffine = (m) => Math.abs(m[0] - 1) <= EPSILON && Math.abs(m[1]) <= EPSILON && Math.abs(m[2]) <= EPSILON && Math.abs(m[3] - 1) <= EPSILON && Math.abs(m[4]) <= 1e-6 && Math.abs(m[5]) <= 1e-6;

// src/core/face/eyes.ts
var MIN_OPEN = 0.015;
var MAX_OPEN = 2;
var SMILE_LIFT_PER_SCALE = 1 / 2.15;
var MASS_GLANCE = 0.3;
var EPSILON2 = 1e-6;
var ARC_RISE = 0.14;
var ARC_OPEN = 0.3;
var ARC_SHUT = 0.05;
var ARC_SMILE = 4;
var finite = (v) => Number.isFinite(v) ? v : 0;
function inverseOf(m) {
  try {
    return invert(m);
  } catch {
    return null;
  }
}
function restPose(spec) {
  const pose = { rest: true, squash: [...IDENTITY], gaze: [0, 0], lid: null, lift: [0, 0] };
  if (spec.shine) pose.shineGaze = [0, 0];
  return pose;
}
function squashOf(spec, inverse, open) {
  const line = (applyAffine(spec.frame, spec.corners[0])[1] + applyAffine(spec.frame, spec.corners[1])[1]) / 2;
  return chain(spec.frame, scaling(1, open, [0, line]), inverse);
}
var smooth3 = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
function eyeArc(open, smile) {
  return smooth3((ARC_OPEN - open) / (ARC_OPEN - ARC_SHUT)) * smooth3(smile / ARC_SMILE);
}
function arcBend(spec, inverse, arc) {
  const [a, b] = spec.corners.map((c) => applyAffine(spec.frame, c));
  const middle = (a[0] + b[0]) / 2;
  const half = Math.abs(b[0] - a[0]) / 2 || 1;
  const rise = ARC_RISE * Math.hypot(b[0] - a[0], b[1] - a[1]) * arc;
  const up = applyLinear(inverse, [0, -1]);
  return (p) => {
    const u = clamp((applyAffine(spec.frame, p)[0] - middle) / half, -1, 1);
    const k = rise * (1 - u * u);
    return [p[0] + up[0] * k, p[1] + up[1] * k];
  };
}
function eyePose(spec, eyes, actingScale) {
  const raw = spec.side === "right" ? eyes.openRight : eyes.openLeft;
  const open = Number.isFinite(raw) ? clamp(raw, MIN_OPEN, MAX_OPEN) : 1;
  const gazeX = finite(eyes.gazeX);
  const gazeY = finite(eyes.gazeY);
  const smile = finite(eyes.smile);
  const unsquashed = Math.abs(open - 1) <= EPSILON2;
  const lift = [0, -smile * (Number.isFinite(actingScale) && actingScale > 0 ? actingScale : 0) * SMILE_LIFT_PER_SCALE + 0];
  if (unsquashed && Math.abs(gazeX) <= EPSILON2 && Math.abs(gazeY) <= EPSILON2 && Math.abs(lift[1]) <= EPSILON2) return restPose(spec);
  const inverse = inverseOf(spec.frame);
  if (!inverse) return restPose(spec);
  const squash = unsquashed ? [...IDENTITY] : squashOf(spec, inverse, open);
  const canvas = [gazeX / 11 * spec.travel[0], gazeY / 6 * spec.travel[1]];
  const share = spec.kind === "mass" ? MASS_GLANCE : 1;
  const local = (frameInverse) => {
    const [x, y] = applyLinear(frameInverse, canvas);
    return [x * share, y * share];
  };
  const round2 = spec.kind === "round" && open < 1 - EPSILON2 && !!spec.lid.d;
  const arc = round2 ? eyeArc(open, smile) : 0;
  const bend = arc > 0 ? arcBend(spec, inverse, arc) : null;
  const lid = round2 ? { d: mapPath(spec.lid.d, (p) => bend ? bend(applyAffine(squash, p)) : applyAffine(squash, p)), width: spec.lid.width * (1 - open) } : null;
  const pose = { rest: false, squash, gaze: local(inverse), lid, lift };
  if (arc > 0) pose.fade = 1 - smooth3(2 * arc);
  if (spec.shine) {
    const shineInverse = inverseOf(spec.shine.frame);
    pose.shineGaze = shineInverse ? local(shineInverse) : [0, 0];
  }
  return pose;
}

// src/core/face/mouths/interior.ts
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function mouthCurvePoint(curve, t) {
  const a = mix(curve[0], curve[1], t), b = mix(curve[1], curve[2], t);
  const c = mix(curve[2], curve[3], t);
  return mix(mix(a, b, t), mix(b, c, t), t);
}
function split(curve, t) {
  const a = mix(curve[0], curve[1], t), b = mix(curve[1], curve[2], t);
  const c = mix(curve[2], curve[3], t), d = mix(a, b, t), e = mix(b, c, t);
  const middle = mix(d, e, t);
  return [[curve[0], a, d, middle], [middle, e, c, curve[3]]];
}
function span(curve, from, to) {
  return split(split(curve, to)[0], from / to)[1];
}
var between2 = (upper, lower, fractions) => upper.map((point, index) => mix(point, lower[index], fractions[index]));
function band(upper, lower) {
  return [
    ["M", ...upper[0]],
    ["C", ...upper[1], ...upper[2], ...upper[3]],
    ["L", ...lower[3]],
    ["C", ...lower[2], ...lower[1], ...lower[0]],
    ["Z"]
  ];
}
var fade = (value, low, high) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};
function lipCommands(contour) {
  const [start, top, bottom] = contour.commands;
  if (start?.[0] !== "M" || top?.[0] !== "C" || bottom?.[0] !== "C") return null;
  return { start, top, bottom };
}
function mouthShadowDrop(contour, shadowTop, clearance) {
  const lips = lipCommands(contour);
  if (!lips) return 0;
  const { start, top, bottom } = lips;
  const curve = [[top[5], top[6]], [bottom[1], bottom[2]], [bottom[3], bottom[4]], [start[1], start[2]]];
  const [y0, y1, y2, y3] = curve.map((point) => point[1]);
  const a = -y0 + 3 * y1 - 3 * y2 + y3;
  const b = 2 * (y0 - 2 * y1 + y2);
  const c = y1 - y0;
  const discriminant = b * b - 4 * a * c;
  const roots = Math.abs(a) < 1e-8 ? Math.abs(b) < 1e-8 ? [] : [-c / b] : discriminant < 0 ? [] : [(-b + Math.sqrt(discriminant)) / (2 * a), (-b - Math.sqrt(discriminant)) / (2 * a)];
  const maximum = Math.max(y0, y3, ...roots.filter((t) => t > 0 && t < 1).map((t) => mouthCurvePoint(curve, t)[1]));
  return Math.max(0, maximum + clearance - shadowTop);
}
function mouthInteriorGeometry(contour, spread = 0, lipWidth = 0) {
  if (contour.opening <= 1e-4) return null;
  const lips = lipCommands(contour);
  if (!lips) throw new Error("the mouth's interior needs the shared two-cubic lip contour");
  const { start, top, bottom } = lips;
  const upper = [[start[1], start[2]], [top[1], top[2]], [top[3], top[4]], [top[5], top[6]]];
  const lower = [upper[0], [bottom[3], bottom[4]], [bottom[1], bottom[2]], upper[3]];
  const width = upper[3][0] - upper[0][0];
  const height = mouthCurvePoint(lower, 0.5)[1] - mouthCurvePoint(upper, 0.5)[1];
  if (width <= 0 || height <= 0) return null;
  const ratio = height / width;
  const visibleHeight = Math.max(0, height - lipWidth);
  const spreadBand = (lipWidth * 0.5 + visibleHeight * 0.44) / height;
  const toothFraction = Math.min(0.48, Math.max(Math.min(0.25 + clamp(spread) * 0.13, 0.085 / ratio), spreadBand * clamp(spread)));
  const teethFloor = between2(upper, lower, Array(4).fill(toothFraction));
  const tongueUpperLip = span(upper, 0.19, 0.81), tongueFloor = span(lower, 0.19, 0.81);
  const tongueRoof = between2(tongueUpperLip, tongueFloor, [1, 0.52, 0.52, 1]);
  return {
    upper,
    lower,
    teethFloor,
    tongueRoof,
    tongueFloor,
    width,
    height,
    teeth: band(upper, teethFloor),
    tongue: band(tongueRoof, tongueFloor),
    teethOpacity: fade(ratio, 0.012, 0.075),
    tongueOpacity: fade(ratio, 0.06, 0.2)
  };
}
function commandsPath(commands2, deform = (p) => p) {
  return commands2.map(([command, ...values]) => {
    const out = [];
    for (let i = 0; i < values.length; i += 2) {
      const [x, y] = deform([values[i], values[i + 1]]);
      out.push(fmt(x), fmt(y));
    }
    return [command, ...out].join(" ");
  }).join(" ");
}
function mouthInside(contour, a, lipWidth, deform = (p) => p) {
  const round2 = clamp(a.rounding);
  const spread = clamp((a.width - 0.5) * 2) * (1 - round2);
  const geometry = mouthInteriorGeometry(contour, spread, lipWidth);
  if (!geometry) return null;
  const top = deform(mouthCurvePoint(geometry.tongueRoof, 0.5));
  const bottom = deform(mouthCurvePoint(geometry.tongueFloor, 0.5));
  return {
    teeth: { d: commandsPath(geometry.teeth, deform), opacity: geometry.teethOpacity * (1 - round2) ** 2 },
    tongue: {
      d: commandsPath(geometry.tongue, deform),
      opacity: geometry.tongueOpacity * (1 - round2 * 0.9) * (1 - spread * 0.75),
      axis: [[top[0], top[1]], [bottom[0], bottom[1]]]
    }
  };
}

// src/core/face/mouths/mouthRig.ts
function mouthRigOpening(openness, amplitude, preset = "full") {
  const x = clamp(openness);
  if (preset === "full") return amplitude * x;
  const high = clamp((x - 0.35) / 0.65);
  const bend = high * high * (3 - 2 * high);
  return amplitude * x * (1 - 0.28 * bend);
}
function mouthRigWidth(width, rounding, preset = "full") {
  const x = clamp(width);
  if (preset === "full" || x <= 0.5) return x;
  const contained = 0.5 + 0.1 * Math.tanh((x - 0.5) / 0.1);
  return contained + (x - contained) * clamp(rounding);
}

// src/core/face/mouths/speechMouth.ts
var smooth4 = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
var mix2 = (from, to, weight) => from + (to - from) * weight;
// realtime-context-standard-demo: `hold` (0–1, SpeechSample.talking) keeps that much of the speaking shape however far
// the lips close, so a closure within a phrase doesn't spring the corners back to rest.
function speechMouth(base, a, scale, hold = 0) {
  if (a.openness === 0 && !(hold > 0)) return base;
  const active = Math.max(smooth4(a.openness / 0.12), clamp(hold));
  const round2 = smooth4((a.rounding - 0.04) / 0.76);
  const spread = clamp((a.width - 0.5) * 2) * (1 - round2);
  const opening = base.opening * (1 + spread * 0.35);
  const cornerCenter = base.middleY + opening * (0.18 + 0.14 * round2 - 0.1 * spread);
  const relax = active * (0.6 + 0.36 * round2);
  const roundedWidth = (7.5 + a.openness * 15 + a.width * 2) * scale;
  const handle = mix2(0.68 + spread * 0.2, 1, round2);
  return {
    ...base,
    halfWidth: mix2(base.halfWidth, roundedWidth, round2 * active),
    leftY: mix2(base.leftY, cornerCenter, relax),
    rightY: mix2(base.rightY, cornerCenter, relax),
    top: mix2(base.top, base.middleY - opening * (0.18 + 0.3 * round2 - 0.04 * spread), active),
    bottom: mix2(base.bottom, base.middleY + opening * (1.02 + 0.1 * round2 + 0.06 * spread), active),
    leftHandle: mix2(base.leftHandle, handle, active),
    rightHandle: mix2(base.rightHandle, handle, active)
  };
}

// src/core/face/mouths/line.ts
var NEMO_HALF_WIDTH = 70;
function sanitizeArticulation(a) {
  return {
    openness: clamp(a.openness),
    width: clamp(Number.isFinite(a.width) ? a.width : 0.5),
    rounding: clamp(a.rounding),
    energy: clamp(a.energy)
  };
}
var articulationAtRest = (a, tolerance = 1e-3) => Math.abs(a.openness) < tolerance && Math.abs(a.width - 0.5) < tolerance && Math.abs(a.rounding) < tolerance;
var mouthTermsAtRest = (p, corners = true, tolerance = 1e-3) => !(p.restOpen > tolerance) && (!corners || Math.abs(p.smile - 1) < tolerance && Math.abs(p.smirk) < tolerance);
var finiteOr = (v, rest3) => Number.isFinite(v) ? v : rest3;
var mouthTerms = (p) => ({
  smile: finiteOr(p.smile, POSE_REST.smile),
  smirk: finiteOr(p.smirk, POSE_REST.smirk),
  restOpen: finiteOr(p.restOpen, POSE_REST.restOpen)
});
function lineMouth(rest3, open, articulation, preset = "full", pose = POSE_REST, owner = 1) {
  const a = sanitizeArticulation(articulation);
  const p = mouthTerms(pose);
  const ownership = clamp(owner);
  const k = rest3.halfWidth / NEMO_HALF_WIDTH;
  const actingScale = 2.15 * k;
  const visualWidth = mouthRigWidth(a.width, a.rounding, preset);
  const rawOpening = mouthRigOpening(a.openness, open, preset) + Math.max(0, p.restOpen) * actingScale * (1 - ownership);
  const restingSmile = p.smile - 1;
  const smile = restingSmile - Math.max(0, restingSmile) * ownership * 0.45;
  const middle = rest3.middleY + smile * 0.52 * k - a.rounding * 4.3 * k;
  const base = {
    opening: rawOpening,
    halfWidth: rest3.halfWidth + (visualWidth - 0.5) * 38 * k - a.rounding * 30 * k + a.openness * 14 * k,
    leftY: rest3.leftY - smile * 1.4 * k + p.smirk * 0.82 * k,
    rightY: rest3.rightY - smile * 1.4 * k - p.smirk * 1.34 * k,
    middleY: middle,
    top: middle - rawOpening * 0.12,
    bottom: middle + rawOpening,
    leftHandle: rest3.leftHandle,
    rightHandle: rest3.rightHandle
  };
  const { opening, halfWidth, leftY, rightY, middleY, top, bottom, leftHandle, rightHandle } = speechMouth(base, a, actingScale);
  const cx = rest3.cx;
  const leftControl = cx - halfWidth * leftHandle;
  const rightControl = cx + halfWidth * rightHandle;
  const commands2 = [
    ["M", cx - halfWidth, leftY],
    ["C", leftControl, top, rightControl, top, cx + halfWidth, rightY],
    ["C", rightControl, bottom, leftControl, bottom, cx - halfWidth, leftY],
    ["Z"]
  ];
  return { commands: commands2, opening, halfWidth, leftY, rightY, middleY, top, bottom };
}
var smooth5 = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
function lineJaw(rest3, openness, preset = "full") {
  const k = rest3.halfWidth / NEMO_HALF_WIDTH;
  const y0 = rest3.middleY - 43 * k;
  const span2 = 169 * k;
  const jaw = mouthRigOpening(openness, 17 * k, preset);
  if (jaw === 0) return (p) => p;
  return ([x, y]) => [x, y + smooth5((y - y0) / span2) * jaw];
}
function lineMouthPose(spec, articulation, owner, pose = POSE_REST) {
  const a = sanitizeArticulation(articulation);
  if (!(owner >= 1e-3) && articulationAtRest(a) && mouthTermsAtRest(pose)) return { open: false, hide: [] };
  const { rest: rest3 } = spec;
  const mouth = lineMouth(rest3, spec.params.open, a, "full", pose, owner);
  const jaw = lineJaw(rest3, a.openness);
  const d = commandsPath(mouth.commands, jaw);
  const interior = { cavity: d };
  const inside = mouthInside(mouth, a, spec.lipWidth, jaw);
  if (inside && spec.params.teeth) interior.teeth = inside.teeth;
  if (inside && spec.params.tongue) interior.tongue = inside.tongue;
  const moved = (from, to) => {
    const [x, y] = jaw(to);
    return translation(x - from[0], y - from[1]);
  };
  const transforms = {
    "corner-l": moved([rest3.cx - rest3.halfWidth, rest3.leftY], [rest3.cx - mouth.halfWidth, mouth.leftY]),
    "corner-r": moved([rest3.cx + rest3.halfWidth, rest3.rightY], [rest3.cx + mouth.halfWidth, mouth.rightY])
  };
  if (spec.lipShadow) {
    const { top, clearance } = spec.lipShadow;
    const drop = mouthShadowDrop(mouth, top, clearance);
    transforms["lip-shadow"] = translation(0, jaw([rest3.cx, top + drop])[1] - top);
  }
  return { open: true, hide: [...spec.hideWhileOpen], interior, line: { d, width: spec.lipWidth }, transforms };
}

// src/core/face/mouths/jaw.ts
var REST_OPEN_PER_UNIT = 2.15 / 86;
function lowerJawTransform(hingeY, drop, foreshorten, o) {
  const sy = 1 - foreshorten * o;
  return [1, 0, 0, sy, 0, hingeY * (1 - sy) + drop * o];
}
function jawMouthPose(spec, articulation, owner, pose = POSE_REST) {
  const a = sanitizeArticulation(articulation);
  if (!(owner >= 1e-3) && articulationAtRest(a) && mouthTermsAtRest(pose, false)) return { open: false, hide: [] };
  const o = mouthRigOpening(a.openness, 1, "full") + Math.max(0, mouthTerms(pose).restOpen) * REST_OPEN_PER_UNIT * (1 - clamp(owner));
  const hingeY = spec.hinge?.[1] ?? spec.rest.middleY;
  return {
    open: true,
    hide: [...spec.hideWhileOpen],
    transforms: { "lower-jaw": lowerJawTransform(hingeY, spec.params.drop, spec.params.foreshorten, o) }
  };
}

// src/core/face/mouths/lips.ts
var COCO_HALF_WIDTH = 52;
var smooth6 = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
var LAB_LIPS = { lift: 1, flatten: 0, spread: 1, stretch: 7, taper: 1, gasp: 0, oh: 1 };
var DRAWN_LIPS = { lift: 0.55, flatten: 0.6, spread: 0.4, stretch: -6, taper: 0.6, gasp: 1, oh: 0.8 };
function shockedO(rest3, size) {
  const k = rest3.halfWidth / COCO_HALF_WIDTH;
  const scale = 1.45 * k;
  const centre = rest3.middleY - 6 * k + 6 * scale;
  const opening = 44 * scale * size;
  return {
    opening,
    halfWidth: 17 * scale * size,
    leftY: centre,
    rightY: centre,
    middleY: centre,
    top: centre - opening * (2 / 3),
    bottom: centre + opening * (2 / 3),
    leftHandle: 1,
    rightHandle: 1
  };
}
function blendShape(from, to, weight) {
  if (!(weight > 0)) return from;
  const out = { ...from };
  for (const key of Object.keys(from)) out[key] += (to[key] - from[key]) * weight;
  return out;
}
function lipsMouth(rest3, open, articulation, preset = "lip-aware", pose = POSE_REST, owner = 1, tune = LAB_LIPS, hold = 0) {
  const a = sanitizeArticulation(articulation);
  const p = mouthTerms(pose);
  const ownership = clamp(owner);
  const k = rest3.halfWidth / COCO_HALF_WIDTH;
  const visualWidth = mouthRigWidth(a.width, a.rounding, preset);
  const smile = (p.smile - 1) * (1 - ownership * 0.35);
  const lifted = (rise) => rise > 0 ? rise * tune.lift : rise;
  const held = Math.max(0, p.restOpen) * 1.4 * k * (1 - ownership);
  const rawOpening = mouthRigOpening(a.openness, open, preset) + held;
  const middle = rest3.middleY + lifted(smile) * 0.25 * k;
  const widen = visualWidth > 0.5 ? tune.spread : 1;
  const base = {
    opening: rawOpening,
    halfWidth: rest3.halfWidth + (visualWidth - 0.5) * 28 * k * widen - a.rounding * 19 * k + a.openness * tune.stretch * k,
    leftY: rest3.leftY - lifted(smile * 0.8 * k - p.smirk * 0.6 * k),
    rightY: rest3.rightY - lifted(smile * 0.8 * k + p.smirk * 0.95 * k),
    middleY: middle,
    top: middle - rawOpening * 0.12,
    bottom: middle + rawOpening,
    leftHandle: rest3.leftHandle,
    rightHandle: rest3.rightHandle
  };
  const spoken = speechMouth(base, a, 1.45 * k, hold);
  const keep = tune.taper + (1 - tune.taper) * smooth6((a.rounding - 0.04) / 0.76);
  const tapered = {
    ...spoken,
    leftHandle: rest3.leftHandle + (spoken.leftHandle - rest3.leftHandle) * keep,
    rightHandle: rest3.rightHandle + (spoken.rightHandle - rest3.rightHandle) * keep
  };
  const hw = rest3.halfWidth;
  const gasp = tune.gasp * smooth6((held - 0.15 * hw) / (0.25 * hw)) * (1 - smooth6(Math.max(0, Math.abs(p.smile - 1) - 1) / 5));
  const shape = blendShape(tapered, shockedO(rest3, tune.oh), gasp);
  const { halfWidth: w, leftY, rightY, top, bottom, leftHandle: lh, rightHandle: rh } = shape;
  const flatten = tune.flatten * smooth6(shape.opening / (0.25 * hw));
  const topLeft = top - flatten * Math.max(0, top - leftY), topRight = top - flatten * Math.max(0, top - rightY);
  const cx = rest3.cx;
  const commands2 = [
    ["M", cx - w, leftY],
    ["C", cx - w * lh, topLeft, cx + w * rh, topRight, cx + w, rightY],
    ["C", cx + w * rh, bottom, cx - w * lh, bottom, cx - w, leftY],
    ["Z"]
  ];
  return { ...shape, gasp, commands: commands2 };
}
function lipsJaw(rest3, openness, preset = "lip-aware") {
  const k = rest3.halfWidth / COCO_HALF_WIDTH;
  const y0 = rest3.middleY - 20 * k;
  const span2 = 100 * k;
  const jaw = mouthRigOpening(openness, 11 * k, preset);
  if (jaw === 0) return (p) => p;
  return ([x, y]) => [x, y + smooth6((y - y0) / span2) * jaw];
}
function lipThickness(rest3, mouth) {
  const stretch = clamp(Math.sqrt(rest3.halfWidth / mouth.halfWidth), 0.68, 1.12);
  return stretch * (1 - 0.72 * smooth6(mouth.opening / rest3.halfWidth));
}
var restCurve = (rest3) => [
  [rest3.cx - rest3.halfWidth, rest3.leftY],
  [rest3.cx - rest3.halfWidth * rest3.leftHandle, rest3.middleY],
  [rest3.cx + rest3.halfWidth * rest3.rightHandle, rest3.middleY],
  [rest3.cx + rest3.halfWidth, rest3.rightY]
];
function contourCurves(mouth) {
  const [start, top, bottom] = mouth.commands;
  if (start?.[0] !== "M" || top?.[0] !== "C" || bottom?.[0] !== "C") throw new Error("the lips need the shared two-cubic lip contour");
  const upper = [[start[1], start[2]], [top[1], top[2]], [top[3], top[4]], [top[5], top[6]]];
  const lower = [upper[0], [bottom[3], bottom[4]], [bottom[1], bottom[2]], upper[3]];
  return { upper, lower };
}
function derivative(c, t) {
  const u = 1 - t;
  const d = (i) => 3 * (u * u * (c[1][i] - c[0][i]) + 2 * u * t * (c[2][i] - c[1][i]) + t * t * (c[3][i] - c[2][i]));
  return [d(0), d(1)];
}
function secondDerivative(c, t) {
  const u = 1 - t;
  const d = (i) => 6 * (u * (c[2][i] - 2 * c[1][i] + c[0][i]) + t * (c[3][i] - 2 * c[2][i] + c[1][i]));
  return [d(0), d(1)];
}
function frameAt(c, t) {
  let [dx, dy] = derivative(c, t);
  let length = Math.hypot(dx, dy);
  if (length < 1e-12) {
    [dx, dy] = [c[3][0] - c[0][0], c[3][1] - c[0][1]];
    length = Math.hypot(dx, dy) || 1;
  }
  const tangent = [dx / length, dy / length];
  return { tangent, normal: [tangent[1], -tangent[0]] };
}
var NEAREST_SAMPLES = 32;
function nearestT(c, p) {
  const distance2 = (t2) => {
    const [x, y] = mouthCurvePoint(c, t2);
    return (x - p[0]) ** 2 + (y - p[1]) ** 2;
  };
  let best = 0;
  let bestD = distance2(0);
  for (let i = 1; i <= NEAREST_SAMPLES; i++) {
    const d = distance2(i / NEAREST_SAMPLES);
    if (d < bestD) [best, bestD] = [i / NEAREST_SAMPLES, d];
  }
  const lo = Math.max(0, best - 1 / NEAREST_SAMPLES), hi = Math.min(1, best + 1 / NEAREST_SAMPLES);
  let t = best;
  for (let i = 0; i < 8; i++) {
    const [x, y] = mouthCurvePoint(c, t);
    const [dx, dy] = derivative(c, t);
    const [ddx, ddy] = secondDerivative(c, t);
    const f = (x - p[0]) * dx + (y - p[1]) * dy;
    const df = dx * dx + dy * dy + (x - p[0]) * ddx + (y - p[1]) * ddy;
    if (!(Math.abs(df) > 1e-12)) break;
    const next = Math.min(hi, Math.max(lo, t - f / df));
    const d = distance2(next);
    if (!(d <= bestD)) break;
    const done = Math.abs(next - t) < 1e-12;
    [t, bestD] = [next, d];
    if (done) break;
  }
  return t;
}
function seat(rest3, p) {
  const t = nearestT(rest3, p);
  const b0 = mouthCurvePoint(rest3, t);
  const { tangent, normal } = frameAt(rest3, t);
  const dx = p[0] - b0[0], dy = p[1] - b0[1];
  return { t, d: dx * normal[0] + dy * normal[1], s: dx * tangent[0] + dy * tangent[1] };
}
function carry(moving, { t, d, s }, thickness) {
  const c = mouthCurvePoint(moving, t);
  const { tangent, normal } = frameAt(moving, t);
  return [c[0] + normal[0] * d * thickness + tangent[0] * s, c[1] + normal[1] * d * thickness + tangent[1] * s];
}
function lipCarrier(rest3, moving, thickness, jaw = (p) => p, corners = null) {
  return (p) => {
    const at = seat(rest3, p);
    const carried = carry(moving, at, thickness);
    const [x, y] = jaw(corners ? corners(p, at.t, carried) : carried);
    return [x, y];
  };
}
function highlightCarrier(rest3, upper, lower, thickness, jaw, corners = null) {
  return (p) => {
    const at = seat(rest3, p);
    const carried = carry(at.d >= 0 ? upper : lower, at, thickness);
    const [x, y] = jaw(corners ? corners(p, at.t, carried) : carried);
    return [x, y];
  };
}
// realtime-context-standard-demo: the drawing at each corner of the mouth (a smile's curl) carried whole, so it rides
// the corner as the mouth opens rather than folding into the opening and back out at every syllable. Not in the
// creator's export: client/scripts/use-avatar.sh applies it to each new one. The piece reaches `reach` along the rest
// seam, easing into the lips' carry, and turns with the expression's corners and `turn` of the way speech turns them.
// Rounding lips tuck it in: from `tuckFrom` to `tuckTo` it gives way to the carry, which folds the corners into the
// sides of an O. The opening is carried with it, so the lips' inner edges stay on the cavity's.
var CORNER_PIECE = { reach: 0.16, turn: 0.5, tuckFrom: 0.5, tuckTo: 0.95 };
var turnBetween = (from, to) => {
  const d = (to - from) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d;
};
/** The direction of the lips at a corner (t 0 or 1): between the upper and lower edges' as they leave it. */
function cornerAngle({ upper, lower }, t) {
  const u = derivative(upper, t), l = derivative(lower, t);
  const nu = Math.hypot(u[0], u[1]) || 1, nl = Math.hypot(l[0], l[1]) || 1;
  return Math.atan2(u[1] / nu + l[1] / nl, u[0] / nu + l[0] / nl);
}
/** `open` is the contour drawn, `shut` the same mouth with speech's openness and hold taken out. */
function cornerPieces(rest3, open, shut, rounding) {
  const { reach, turn, tuckFrom, tuckTo } = CORNER_PIECE;
  const hold = 1 - smooth6((rounding - tuckFrom) / (tuckTo - tuckFrom));
  const ends = [0, 1].map((t) => {
    const from = mouthCurvePoint(rest3, t);
    const to = mouthCurvePoint(open.upper, t);
    const closed = cornerAngle(shut, t);
    const angle = turnBetween(cornerAngle({ upper: rest3, lower: rest3 }, t), closed) + turn * turnBetween(closed, cornerAngle(open, t));
    return { from, to, cos: Math.cos(angle), sin: Math.sin(angle) };
  });
  return (p, t, carried) => {
    const end = t < 0.5 ? 0 : 1;
    const w = hold * (1 - smooth6((end ? 1 - t : t) / reach));
    if (!(w > 0)) return carried;
    const { from, to, cos, sin } = ends[end];
    const dx = p[0] - from[0], dy = p[1] - from[1];
    const held = [to[0] + dx * cos - dy * sin, to[1] + dx * sin + dy * cos];
    return [carried[0] + (held[0] - carried[0]) * w, carried[1] + (held[1] - carried[1]) * w];
  };
}
/** The opening under corner pieces: the contour carried as the seam is, so the lips' inner edges stay on it. */
function cornerCavity(seam, upper, lower, corners, jaw, pieces = 48) {
  const along = (curve) => Array.from({ length: pieces + 1 }, (_, i) => {
    const t = i / pieces;
    return jaw(corners(mouthCurvePoint(seam, t), t, mouthCurvePoint(curve, t)));
  });
  const points = [...along(upper), ...along(lower).reverse().slice(1, -1)];
  return `M ${points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(" L ")} Z`;
}
function lipsMouthPose(spec, articulation, owner, pose = POSE_REST, tune = DRAWN_LIPS, talking = 0) {
  const a = sanitizeArticulation(articulation);
  if (!(owner >= 1e-3) && !(talking >= 1e-3) && articulationAtRest(a) && mouthTermsAtRest(pose)) return { open: false, hide: [] };
  const { rest: rest3 } = spec;
  const mouth = lipsMouth(rest3, spec.params.open, a, "lip-aware", pose, owner, tune, talking);
  const jaw = lipsJaw(rest3, a.openness);
  const seam = restCurve(rest3);
  const { upper, lower } = contourCurves(mouth);
  const shut = contourCurves(lipsMouth(rest3, spec.params.open, { ...a, openness: 0 }, "lip-aware", pose, owner, tune));
  const corners = cornerPieces(seam, { upper, lower }, shut, a.rounding);
  const interior = { cavity: cornerCavity(seam, upper, lower, corners, jaw) };
  const inside = mouthInside(mouth, a, spec.lipWidth, jaw);
  if (inside && spec.params.teeth && mouth.gasp < 1) {
    interior.teeth = mouth.gasp > 0 ? { ...inside.teeth, opacity: inside.teeth.opacity * (1 - mouth.gasp) } : inside.teeth;
  }
  if (inside && spec.params.tongue) interior.tongue = inside.tongue;
  const thickness = lipThickness(rest3, mouth);
  const upperLip = lipCarrier(seam, upper, thickness, jaw, corners);
  const deform = {
    "upper-lip": upperLip,
    seam: upperLip,
    "lower-lip": lipCarrier(seam, lower, thickness, jaw, corners),
    "lip-highlight": highlightCarrier(seam, upper, lower, thickness, jaw, corners)
  };
  const moved = (from, to) => {
    const [x, y] = jaw(to);
    return translation(x - from[0], y - from[1]);
  };
  const transforms = {
    "corner-l": moved([rest3.cx - rest3.halfWidth, rest3.leftY], [rest3.cx - mouth.halfWidth, mouth.leftY]),
    "corner-r": moved([rest3.cx + rest3.halfWidth, rest3.rightY], [rest3.cx + mouth.halfWidth, mouth.rightY])
  };
  if (spec.lipShadow) {
    const { top, clearance } = spec.lipShadow;
    const drop = mouthShadowDrop(mouth, top, clearance);
    transforms["lip-shadow"] = translation(0, jaw([rest3.cx, top + drop])[1] - top);
  }
  const opacity = {
    "lip-highlight": 1 - smooth6(mouth.opening / (0.27 * rest3.halfWidth)),
    "lip-shadow": 1 - smooth6(mouth.opening / (14 / COCO_HALF_WIDTH * rest3.halfWidth))
  };
  return { open: true, hide: [...spec.hideWhileOpen], interior, transforms, deform, opacity };
}

// src/core/face/mouths/index.ts
var ENGINES = {
  // Nemo's opening of 86 on a mouth 140 wide; drop and foreshorten belong to the jaw type.
  line: { pose: lineMouthPose, defaults: { open: 86 / 140, drop: 0, foreshorten: 0 } },
  // Coco's opening of 64 (lip-aware) on a mouth 104 wide.
  lips: { pose: (spec, a, owner, pose, talking) => lipsMouthPose(spec, a, owner, pose, DRAWN_LIPS, talking), defaults: { open: 64 / 104, drop: 0, foreshorten: 0 } },
  // The lower jaw drops 0.4 of the mouth's width and loses a tenth of its height at full openness.
  jaw: { pose: jawMouthPose, defaults: { open: 0, drop: 0.4, foreshorten: 0.1 } }
};
var MOUTH_ENGINES = Object.keys(ENGINES);
var engineOf = (type) => {
  const engine = ENGINES[type];
  if (!engine) throw new Error(`mouth type "${type}" has no engine yet (engines: ${MOUTH_ENGINES.join(", ")})`);
  return engine;
};
// realtime-context-standard-demo: `talking` is SpeechSample.talking, which the lips hold their speaking shape on.
function mouthPose(spec, articulation, owner, pose = POSE_REST, talking = 0) {
  return engineOf(spec.type).pose(spec, articulation, owner, pose, talking);
}

// src/core/face/speech/lipsync/feed.ts
var SCHEDULING_LEAD_SEC = 0.2;
var REST_POSE = {
  openness: 0.15,
  width: 0.35,
  rounding: 0.35,
  energy: 0,
  pitch: 0,
  confidence: 0
};
var REST_HOLD_SEC = 0.25;
var REST_EASE_SEC = 0.3;
var PREROLL_SEC = 0.2;
var PRUNE_HORIZON_SEC = 30;
var RATE_WINDOW_MS = 5e3;
var MIN_EVENT_ACTIVE_SEC = 0.25;
var CUT_GRACE_SEC = 0.15;
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpPose(a, k, t) {
  return {
    openness: lerp(a.openness, k.openness, t),
    width: lerp(a.width, k.width, t),
    rounding: lerp(a.rounding, k.rounding, t),
    energy: lerp(a.energy, k.energy, t),
    pitch: lerp(a.pitch, k.pitch, t),
    confidence: lerp(a.confidence, k.confidence, t),
    live: true,
    relTime: null
  };
}
var LipsyncFeed = class {
  constructor() {
    /** User-adjustable A/V trim in ms (positive delays the mouth). */
    __publicField(this, "offsetTrimMs", 0);
    __publicField(this, "lastBatch", null);
    __publicField(this, "eventLog", []);
    __publicField(this, "anchorMs", null);
    __publicField(this, "ctx", null);
    __publicField(this, "kfs", []);
    __publicField(this, "evs", []);
    __publicField(this, "cursor", 0);
    __publicField(this, "maxProgress", -Infinity);
    __publicField(this, "cutCtx", null);
    __publicField(this, "cutProgress", Infinity);
    __publicField(this, "msgTimes", []);
    __publicField(this, "kfTimes", []);
    __publicField(this, "totalMessages", 0);
    __publicField(this, "totalKeyframes", 0);
    __publicField(this, "totalEvents", 0);
    __publicField(this, "resyncs", 0);
    __publicField(this, "lastLeadMs", null);
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
  }
  now() {
    return performance.now();
  }
  /**
   * Adds a batch that arrived at `now` (defaults to the current time; a
   * replay passes the recorded arrival time).
   */
  ingest(batch, now = this.now()) {
    const first = batch.keyframes[0]?.offset ?? batch.events[0]?.offset;
    if (first === void 0) return;
    const exact = batch.windowStart !== void 0 && batch.lead !== void 0;
    const progress = exact ? batch.windowStart : first;
    const impliedAnchor = exact ? now + batch.lead * 1e3 - batch.windowStart * 1e3 : now + SCHEDULING_LEAD_SEC * 1e3 - first * 1e3;
    const restarted = progress < this.maxProgress - 1e-3;
    if (batch.ctx === this.cutCtx && !restarted && progress >= this.cutProgress) {
      return;
    }
    let anchor = this.anchorMs;
    if (batch.ctx !== this.ctx || anchor === null || restarted) {
      this.ctx = batch.ctx;
      this.cutCtx = null;
      anchor = impliedAnchor;
      this.kfs = [];
      this.evs = [];
      this.cursor = 0;
      this.maxProgress = -Infinity;
    } else if (impliedAnchor < anchor - 1) {
      if (anchor - impliedAnchor > 120) this.resyncs++;
      anchor = impliedAnchor;
    }
    this.anchorMs = anchor;
    this.maxProgress = Math.max(this.maxProgress, progress);
    this.lastLeadMs = anchor + progress * 1e3 - now;
    this.kfs.push(...batch.keyframes);
    for (const e of batch.events) {
      this.evs.push(e);
      this.eventLog.push({
        ...e,
        ctx: batch.ctx,
        seq: this.totalEvents,
        wallMs: anchor + e.offset * 1e3
      });
      this.totalEvents += 1;
    }
    if (this.eventLog.length > 200) this.eventLog.splice(0, this.eventLog.length - 200);
    this.totalMessages += 1;
    this.totalKeyframes += batch.keyframes.length;
    this.msgTimes.push(now);
    for (let i = 0; i < batch.keyframes.length; i++) this.kfTimes.push(now);
    this.trimRates(now);
    this.prune();
    this.lastBatch = batch;
    this.notify();
  }
  /**
   * Stops the utterance at the playhead, e.g. on barge-in, when the server
   * has discarded the rest of the audio and its batches: keyframes and events
   * beyond a short grace window are dropped, so the pose holds briefly and
   * eases to rest as it does after an utterance's last keyframe, and batches
   * of this utterance still in flight are ignored when they arrive. The grace
   * covers the client's own audio latency, so a cut at a natural turn end
   * (the bot-stopped-speaking event fires as the last audio leaves the
   * server) loses nothing.
   */
  cut(nowMs2 = this.now()) {
    const rel = this.relTime(nowMs2);
    if (rel === null) return;
    const keep = rel + CUT_GRACE_SEC;
    this.kfs = this.kfs.filter((k) => k.offset <= keep);
    this.evs = this.evs.filter((e) => e.offset <= keep);
    this.cursor = Math.min(this.cursor, Math.max(0, this.kfs.length - 1));
    this.cutCtx = this.ctx;
    this.cutProgress = keep;
    this.notify();
  }
  /** Utterance-relative playhead time for a wall-clock timestamp. */
  relTime(nowMs2) {
    if (this.anchorMs === null) return null;
    return (nowMs2 - this.anchorMs - this.offsetTrimMs) / 1e3;
  }
  sample(nowMs2) {
    const rest3 = { ...REST_POSE, live: false, relTime: null };
    const rel = this.relTime(nowMs2);
    if (rel === null) return rest3;
    rest3.relTime = rel;
    if (this.kfs.length === 0) return rest3;
    while (this.cursor + 1 < this.kfs.length && this.kfs[this.cursor + 1].offset <= rel) {
      this.cursor += 1;
    }
    while (this.cursor > 0 && this.kfs[this.cursor].offset > rel) {
      this.cursor -= 1;
    }
    const first = this.kfs[0];
    if (rel < first.offset) {
      const until = first.offset - rel;
      if (until > PREROLL_SEC) return rest3;
      return { ...lerpPose(rest3, first, 1 - until / PREROLL_SEC), relTime: rel };
    }
    const k0 = this.kfs[this.cursor];
    const k1 = this.kfs[this.cursor + 1];
    if (k1 !== void 0) {
      const span2 = k1.offset - k0.offset;
      const t = span2 > 0 ? Math.min(1, (rel - k0.offset) / span2) : 1;
      const k0Pose2 = { ...k0, live: true, relTime: rel };
      return { ...lerpPose(k0Pose2, k1, t), relTime: rel };
    }
    const over = rel - k0.offset;
    if (over <= REST_HOLD_SEC) return { ...k0, live: true, relTime: rel };
    const fade2 = 1 - Math.exp(-(over - REST_HOLD_SEC) / REST_EASE_SEC);
    const k0Pose = { ...k0, live: over < 2, relTime: rel };
    const restKf = { ...REST_POSE, offset: 0 };
    return { ...lerpPose(k0Pose, restKf, fade2), relTime: rel };
  }
  /** Events whose span covers the playhead (for badges/flashes). */
  activeEvents(nowMs2) {
    const rel = this.relTime(nowMs2);
    if (rel === null) return [];
    return this.evs.filter(
      (e) => rel >= e.offset && rel <= e.offset + Math.max(e.duration, MIN_EVENT_ACTIVE_SEC)
    );
  }
  activeEventKinds(nowMs2) {
    return new Set(this.activeEvents(nowMs2).map((e) => e.kind));
  }
  statsSnapshot(nowMs2) {
    this.trimRates(nowMs2);
    const windowSec = RATE_WINDOW_MS / 1e3;
    return {
      msgsPerSec: this.msgTimes.length / windowSec,
      kfsPerSec: this.kfTimes.length / windowSec,
      totalMessages: this.totalMessages,
      totalKeyframes: this.totalKeyframes,
      totalEvents: this.totalEvents,
      ctx: this.ctx,
      queueLength: this.kfs.length,
      lastLeadMs: this.lastLeadMs,
      resyncs: this.resyncs
    };
  }
  /** Notified whenever a batch is ingested (event log, stats, inspector). */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  reset() {
    this.anchorMs = null;
    this.ctx = null;
    this.kfs = [];
    this.evs = [];
    this.cursor = 0;
    this.maxProgress = -Infinity;
    this.cutCtx = null;
    this.lastLeadMs = null;
    this.lastBatch = null;
    this.notify();
  }
  /** Like reset(), but also forgets the event log and counters: a fresh feed. */
  clear() {
    this.eventLog = [];
    this.msgTimes = [];
    this.kfTimes = [];
    this.totalMessages = 0;
    this.totalKeyframes = 0;
    this.totalEvents = 0;
    this.resyncs = 0;
    this.reset();
  }
  prune() {
    const rel = this.relTime(this.now());
    if (rel === null) return;
    const horizon = rel - PRUNE_HORIZON_SEC;
    let drop = 0;
    while (drop < this.kfs.length - 1 && this.kfs[drop + 1].offset < horizon) drop += 1;
    if (drop > 0) {
      this.kfs.splice(0, drop);
      this.cursor = Math.max(0, this.cursor - drop);
    }
    this.evs = this.evs.filter((e) => e.offset + e.duration >= horizon);
  }
  trimRates(nowMs2) {
    const cutoff = nowMs2 - RATE_WINDOW_MS;
    while (this.msgTimes.length > 0 && this.msgTimes[0] < cutoff) this.msgTimes.shift();
    while (this.kfTimes.length > 0 && this.kfTimes[0] < cutoff) this.kfTimes.shift();
  }
  notify() {
    for (const listener of this.listeners) listener();
  }
};

// src/core/face/speech/lipsync/protocol.ts
var LIPSYNC_MESSAGE_TYPE = "bot-tts-lipsync";

// src/core/face/speech/wire.ts
var REST_ARTICULATION = Object.freeze({ openness: 0, width: 0.5, rounding: 0, energy: 0 });
var REST_SAMPLE = Object.freeze({
  openness: 0.15,
  width: 0.35,
  rounding: 0.35,
  energy: 0,
  pitch: 0,
  confidence: 0,
  live: false,
  speaking: false,
  relTime: null,
  events: []
});
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var finite2 = (value) => typeof value === "number" && Number.isFinite(value);
var unit = (value) => finite2(value) && value >= 0 && value <= 1;
var positive = (value) => finite2(value) && value >= 0;
var eventKinds = /* @__PURE__ */ new Set(["closure", "nasal", "silence"]);
function parseLipsyncData(value) {
  if (!isObject(value) || value.type !== LIPSYNC_MESSAGE_TYPE) return null;
  const version = value.version ?? 1;
  if (version !== 1 && version !== 2) return null;
  const t0 = value.t0 ?? 0;
  const kf = value.kf ?? [];
  const ev = value.ev ?? [];
  if (!finite2(t0) || !Array.isArray(kf) || !Array.isArray(ev)) return null;
  if (kf.length + ev.length > 1e5) return null;
  if (value.ctx != null && typeof value.ctx !== "string") return null;
  if (value.ws !== void 0 && !finite2(value.ws)) return null;
  if (value.lead !== void 0 && !finite2(value.lead)) return null;
  const keyframes = [];
  const events = [];
  for (const row of kf) {
    if (!Array.isArray(row) || row.length !== 7 || !positive(row[0]) || !row.slice(1).every(unit)) return null;
    const [offset, openness, width, rounding, energy, pitch, confidence] = row;
    keyframes.push({
      offset: offset + t0,
      openness,
      width,
      rounding,
      energy,
      pitch,
      confidence
    });
  }
  for (const row of ev) {
    if (!Array.isArray(row) || row.length !== 4 || !positive(row[0]) || !eventKinds.has(row[1]) || !positive(row[2]) || !unit(row[3])) return null;
    events.push({ offset: row[0] + t0, kind: row[1], duration: row[2], confidence: row[3] });
  }
  const windowed = finite2(value.ws) && finite2(value.lead);
  const first = keyframes[0]?.offset ?? events[0]?.offset ?? t0;
  return {
    ctx: typeof value.ctx === "string" ? value.ctx : "",
    t0,
    ws: windowed ? value.ws : first - t0,
    lead: windowed ? value.lead : SCHEDULING_LEAD_SEC,
    keyframes,
    events
  };
}
function parseRecording(value) {
  if (!isObject(value) || value.format !== "nemo-avatar-lipsync" || value.version !== 1) {
    throw new Error("Expected a nemo-avatar-lipsync version 1 recording.");
  }
  if (!positive(value.duration) || value.duration === 0 || value.duration > 600 || !positive(value.sampleRate) || value.sampleRate === 0 || !Array.isArray(value.batches) || !value.batches.length || value.batches.length > 1e4) {
    throw new Error("Recording duration, sample rate, or batches are invalid (maximum ten minutes).");
  }
  const batches = value.batches.map((raw, index) => {
    const batch = parseLipsyncData(raw);
    if (!batch) throw new Error(`Invalid Pipecat articulation batch ${index + 1}.`);
    return batch;
  });
  const keyframes = batches.flatMap((batch) => batch.keyframes).sort((a, b) => a.offset - b.offset);
  const events = batches.flatMap((batch) => batch.events).sort((a, b) => a.offset - b.offset);
  const duration = value.duration;
  if (!keyframes.length || keyframes.length + events.length > 1e5) {
    throw new Error("Recording contains no keyframes or too many articulation samples.");
  }
  if (keyframes.some((frame) => frame.offset < 0 || frame.offset > duration + 1) || events.some((event) => event.offset < 0 || event.offset > duration + 1)) {
    throw new Error("Articulation offsets are outside the recorded audio timeline.");
  }
  const uniqueFrames = keyframes.filter((frame, index) => keyframes[index + 1]?.offset !== frame.offset);
  const uniqueEvents = events.filter((event, index) => !events.slice(Math.max(0, index - 4), index).some((previous) => previous.offset === event.offset && previous.kind === event.kind && previous.duration === event.duration));
  return {
    format: "nemo-avatar-lipsync",
    version: 1,
    duration,
    sampleRate: value.sampleRate,
    batches,
    keyframes: uniqueFrames,
    events: uniqueEvents
  };
}

// src/core/face/speech/sample.ts
var finite3 = (value) => typeof value === "number" && Number.isFinite(value);
var lerp2 = (a, b, t) => a + (b - a) * t;
function interpolate(a, b, t) {
  return {
    openness: lerp2(a.openness, b.openness, t),
    width: lerp2(a.width, b.width, t),
    rounding: lerp2(a.rounding, b.rounding, t),
    energy: lerp2(a.energy, b.energy, t),
    pitch: lerp2(a.pitch, b.pitch, t),
    confidence: lerp2(a.confidence, b.confidence, t),
    live: true,
    speaking: true,
    relTime: null,
    events: []
  };
}
function upperBound(keyframes, time) {
  let low = 0;
  let high = keyframes.length;
  while (low < high) {
    const mid = low + high >>> 1;
    if (keyframes[mid].offset <= time) low = mid + 1;
    else high = mid;
  }
  return low;
}
var silenceCache = /* @__PURE__ */ new WeakMap();
function silenceSpans(recording) {
  const cached = silenceCache.get(recording);
  if (cached) return cached;
  const { keyframes, events } = recording;
  const nextRise = new Array(keyframes.length + 1).fill(keyframes.length);
  for (let i = keyframes.length - 1; i > 0; i--) {
    nextRise[i] = keyframes[i].energy > keyframes[i - 1].energy ? i : nextRise[i + 1];
  }
  nextRise[0] = keyframes[0] && keyframes[0].energy > 0 ? 0 : nextRise[1];
  const spans = events.filter((event) => event.kind === "silence").map((event) => {
    if (event.duration > 0) return { start: event.offset, end: event.offset + event.duration };
    const next = upperBound(keyframes, event.offset);
    const resumed = keyframes[nextRise[next]];
    let start = event.offset;
    let following = keyframes[next];
    for (let i = next - 1; i >= 0; i--) {
      const frame = keyframes[i];
      if (event.offset - frame.offset > 0.06 || frame.pitch > 0 || frame.openness > 0.15 || following && frame.energy < following.energy) break;
      if (frame.openness === 0) {
        start = frame.offset;
        break;
      }
      following = frame;
    }
    return { start, end: resumed?.offset ?? recording.duration };
  });
  silenceCache.set(recording, spans);
  return spans;
}
function sampleRecording(recording, seconds, trimMs = 0) {
  if (!finite3(seconds) || !finite3(trimMs)) return { ...REST_SAMPLE, events: [] };
  const relTime = seconds - trimMs / 1e3;
  const rest3 = { ...REST_SAMPLE, relTime, events: [] };
  const { keyframes } = recording;
  if (relTime < 0 || !keyframes.length) return rest3;
  const nextIndex = upperBound(keyframes, relTime);
  const first = keyframes[0];
  let pose;
  if (nextIndex === 0) {
    const until = first.offset - relTime;
    if (until > 0.2) return rest3;
    pose = interpolate(REST_SAMPLE, first, 1 - until / 0.2);
  } else {
    const before = keyframes[nextIndex - 1];
    const after = keyframes[nextIndex];
    if (after) {
      pose = interpolate(before, after, (relTime - before.offset) / (after.offset - before.offset));
    } else {
      const over = relTime - before.offset;
      if (over > 2) return rest3;
      pose = interpolate(before, REST_SAMPLE, over <= 0.25 ? 0 : 1 - Math.exp(-(over - 0.25) / 0.3));
    }
  }
  const events = recording.events.filter((event) => {
    if (relTime < event.offset) return false;
    const next = keyframes[upperBound(keyframes, event.offset)];
    const end = event.duration > 0 ? event.offset + event.duration : next?.offset ?? event.offset + 0.02;
    return relTime < end;
  });
  if (silenceSpans(recording).some(({ start, end }) => relTime >= start && relTime < end)) {
    return {
      ...pose,
      openness: REST_SAMPLE.openness,
      width: REST_SAMPLE.width,
      rounding: REST_SAMPLE.rounding,
      live: true,
      speaking: false,
      sealed: true,
      relTime,
      events
    };
  }
  return { ...pose, relTime, events, speaking: pose.energy > 0.025 && !events.some((e) => e.kind === "silence") };
}

// src/core/face/speech/calibrate.ts
var clamp2 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
var smoothstep = (low, high, value) => {
  const t = clamp2((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};
function calibratedOpenness(sample) {
  const roundingDistance = Math.max(0.1 - sample.rounding, sample.rounding - 0.35, 0);
  const articulated = smoothstep(0.01, 0.12, Math.hypot(sample.width - 0.35, roundingDistance));
  const openness = Math.max(
    clamp2((sample.openness - 0.15) / 0.85),
    Math.min(clamp2(sample.openness), 0.15) * articulated
  );
  return 2.4 * openness / (1 + 1.4 * openness);
}
function mapSpeechToRig(sample) {
  const closed = sample.sealed || sample.events.some((event) => event.kind === "closure" || event.kind === "silence");
  const openness = sample.release ? calibratedOpenness(sample.release.from) * (1 - clamp2(sample.release.amount)) : calibratedOpenness(sample);
  return {
    openness: closed ? 0 : openness,
    width: clamp2(sample.width <= 0.35 ? sample.width / 0.35 * 0.5 : 0.5 + (sample.width - 0.35) / 0.65 * 0.5),
    rounding: clamp2((sample.rounding - 0.35) / 0.65),
    energy: clamp2(sample.energy)
  };
}

// src/core/face/speech/damping.ts
var approach = (from, to, elapsed, timeConstant) => to + (from - to) * Math.exp(-elapsed / timeConstant);
var SpeechMouthDamping = class {
  constructor() {
    __publicField(this, "mouth", null);
    __publicField(this, "at", 0);
    __publicField(this, "relTime", null);
  }
  reset() {
    this.mouth = null;
    this.relTime = null;
  }
  step(articulation, sample, nowMs2) {
    if (!sample.live) {
      this.reset();
      return { ...articulation };
    }
    const elapsed = nowMs2 - this.at;
    const advance = sample.relTime !== null && this.relTime !== null ? sample.relTime - this.relTime : null;
    const discontinuity = advance !== null && (advance < 0 || advance > Math.max(0.12, elapsed * 3e-3));
    const previous = this.mouth;
    if (!previous || elapsed < 0 || elapsed > 100 || discontinuity) {
      this.mouth = { ...articulation };
    } else {
      this.mouth = {
        // Vowels open promptly; gentler falls suppress aperture quiver. A closure seals on this frame.
        openness: articulation.openness === 0 ? 0 : approach(
          previous.openness,
          articulation.openness,
          elapsed,
          articulation.openness > previous.openness ? 15 : 35
        ),
        width: approach(previous.width, articulation.width, elapsed, 40),
        rounding: approach(previous.rounding, articulation.rounding, elapsed, 40),
        energy: articulation.energy
      };
    }
    this.at = nowMs2;
    this.relTime = sample.relTime;
    return { ...this.mouth };
  }
};

// src/core/face/speech/release.ts
var RELEASE_MS = 140;
var rest2 = (relTime) => ({ ...REST_SAMPLE, relTime, events: [] });
function origin(last) {
  const sealed = last.sealed || last.openness === 0 || last.events.some((event) => event.kind === "closure" || event.kind === "silence");
  return sealed ? { ...last, openness: REST_SAMPLE.openness, sealed: true } : last;
}
var Release = class {
  constructor() {
    /** The last sample shown while playing; null once at rest. */
    __publicField(this, "last", null);
    __publicField(this, "resting", null);
  }
  /** A sample while the source plays: shown as it is, and remembered as the next release's origin. */
  playing(sample) {
    this.resting = null;
    this.last = sample;
    return sample;
  }
  /** A sample while the source is stopped: the release under way, then the rest sample. */
  stopped(nowMs2, relTime) {
    if (!this.resting) {
      if (!this.last) return rest2(relTime);
      this.resting = { from: origin(this.last), at: nowMs2 };
    }
    const t = Math.max(0, Math.min(1, (nowMs2 - this.resting.at) / RELEASE_MS));
    if (t >= 1) {
      this.reset();
      return rest2(relTime);
    }
    const amount = t * t * (3 - 2 * t);
    const { from } = this.resting;
    return {
      ...interpolate(from, REST_SAMPLE, amount),
      live: false,
      speaking: false,
      sealed: from.sealed,
      release: { from, amount },
      relTime,
      events: []
    };
  }
  /**
   * Forgets the pose shown, so the next stopped sample rests at once: for a finished release or a source thrown
   * away. A source's own reset (a disconnect, a new clip) keeps it, so even then the mouth releases.
   */
  reset() {
    this.last = null;
    this.resting = null;
  }
};

// src/core/face/speech/recording.ts
function recordingSource(audio, recording, options = {}) {
  const trimMs = options.trimMs ?? 0;
  const release = new Release();
  return {
    sample(nowMs2) {
      const seconds = audio.currentTime;
      const playing = !audio.paused && !audio.ended && seconds >= 0 && seconds <= recording.duration;
      if (playing) return release.playing({ ...sampleRecording(recording, seconds, trimMs), speaking: true });
      return release.stopped(nowMs2, Number.isFinite(seconds) ? seconds - trimMs / 1e3 : null);
    },
    // Nothing is in flight but the pose shown, which releases to rest when the element stops, as any stop does.
    reset() {
    },
    dispose() {
      release.reset();
    }
  };
}

// src/core/face/speech/live.ts
var PREROLL_SEC2 = 0.2;
var HOLD_SEC = 0.25;
var CUT_GRACE_SEC2 = 0.15;
var ClockedFeed = class extends LipsyncFeed {
  constructor(clock) {
    super();
    __publicField(this, "clock");
    this.clock = clock;
  }
  now() {
    return this.clock();
  }
};
var LiveSpeech = class {
  constructor(clock) {
    __publicField(this, "feed");
    __publicField(this, "ctx", null);
    __publicField(this, "anchored", false);
    __publicField(this, "maxProgress", -Infinity);
    __publicField(this, "keyframes", []);
    __publicField(this, "events", []);
    /** The accepted batches as a recording, rebuilt after a change (sampleRecording caches per object). */
    __publicField(this, "recording", null);
    this.feed = new ClockedFeed(clock);
  }
  /** Takes a batch as the feed does; false when the feed dropped it (stale after a cut, or empty). */
  ingest(batch, nowMs2) {
    const progress = batch.ws + batch.t0;
    const wire = {
      version: 2,
      ctx: batch.ctx,
      windowStart: progress,
      lead: batch.lead,
      keyframes: batch.keyframes,
      events: batch.events,
      raw: batch
    };
    this.feed.ingest(wire, nowMs2);
    if (this.feed.lastBatch !== wire) return false;
    const restarted = progress < this.maxProgress - 1e-3;
    if (batch.ctx !== this.ctx || !this.anchored || restarted) {
      this.clear();
      this.ctx = batch.ctx;
      this.anchored = true;
    }
    this.maxProgress = Math.max(this.maxProgress, progress);
    insertByOffset(this.keyframes, batch.keyframes);
    insertByOffset(this.events, batch.events);
    this.recording = null;
    return true;
  }
  /** The utterance's playout time at `nowMs`, in seconds from its first sample; null before any batch. */
  playhead(nowMs2) {
    return this.anchored ? this.feed.relTime(nowMs2) : null;
  }
  /** A barge-in: speech past a short grace will not be heard, and the cut reply's late batches are stale. */
  cut(nowMs2) {
    const playhead = this.playhead(nowMs2);
    this.feed.cut(nowMs2);
    if (playhead === null) return;
    const keep = playhead + CUT_GRACE_SEC2;
    this.keyframes = this.keyframes.filter((frame) => frame.offset <= keep);
    this.events = this.events.filter((event) => event.offset <= keep);
    this.recording = null;
  }
  reset() {
    this.feed.reset();
    this.clear();
    this.ctx = null;
    this.anchored = false;
  }
  sample(nowMs2) {
    const playhead = this.playhead(nowMs2);
    const first = this.keyframes[0];
    const last = this.keyframes.at(-1);
    if (playhead === null || !first || !last) return { ...REST_SAMPLE, events: [] };
    this.recording ?? (this.recording = {
      format: "nemo-avatar-lipsync",
      version: 1,
      duration: Infinity,
      sampleRate: 16e3,
      batches: [],
      keyframes: [...this.keyframes],
      events: [...this.events]
    });
    const speaking = playhead >= first.offset - PREROLL_SEC2 && playhead <= last.offset + HOLD_SEC;
    return { ...sampleRecording(this.recording, playhead), speaking };
  }
  clear() {
    this.keyframes = [];
    this.events = [];
    this.recording = null;
    this.maxProgress = -Infinity;
  }
};
function insertByOffset(into, items) {
  for (const item of items) {
    let index = into.length;
    while (index > 0 && into[index - 1].offset > item.offset) index--;
    into.splice(index, 0, item);
  }
}
function createLipsync(options = {}) {
  const now = options.now ?? (() => performance.now());
  const speech = new LiveSpeech(now);
  speech.feed.offsetTrimMs = options.trimMs ?? 0;
  const release = new Release();
  let userSpeaking = false;
  const reset = () => speech.reset();
  const callbacks = {
    // Lipsync batches are RTVI server-messages with data.type "bot-tts-lipsync"; anything else is ignored.
    onServerMessage: (data) => {
      const batch = parseLipsyncData(data);
      if (batch) speech.ingest(batch, now());
    },
    onUserStartedSpeaking: () => {
      userSpeaking = true;
    },
    onUserStoppedSpeaking: () => {
      userSpeaking = false;
    },
    // Only a barge-in cuts the reply. The bot also stops speaking when its LLM stalls between sentences; the
    // rest of that reply keeps its context, so cutting it would freeze the mouth.
    onBotStoppedSpeaking: () => {
      if (userSpeaking) speech.cut(now());
    },
    onDisconnected: () => {
      userSpeaking = false;
      reset();
    }
  };
  const source2 = {
    sample(nowMs2) {
      const sample = speech.sample(nowMs2);
      return sample.speaking ? release.playing(sample) : release.stopped(nowMs2, sample.relTime);
    },
    reset,
    dispose() {
      speech.reset();
      release.reset();
    }
  };
  return { callbacks, source: source2 };
}

// src/core/motion/effects.ts
var EFFECT_SCALE = 2.75 / 2.15;
var LEVEL_EPSILON = 1e-4;
var smooth7 = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
var OFF = { visible: false, opacity: 0, scale: 0, progress: 0 };
function sampleBurst(duration, age, strength = 1) {
  const s = clamp(strength, 0, 1.5);
  if (!Number.isFinite(age) || age <= 0 || !(age < duration) || s === 0) return { ...OFF };
  const progress = age / duration;
  const emerge = smooth7(progress / 0.17);
  const settle = smooth7((progress - 0.17) / 0.16);
  const pop = progress < 0.17 ? 0.24 + 0.88 * emerge : 1.12 - 0.12 * settle;
  return {
    visible: true,
    opacity: smooth7(progress / 0.09) * (1 - smooth7((progress - 0.6) / 0.4)) * Math.min(1, s),
    scale: pop * 1.4 * (0.85 + 0.15 * s),
    progress
  };
}
function particleMotion(progress, velocity, gravity, spin, delay = 0) {
  const t = clamp((progress - delay) / (1 - delay));
  const position = (time) => [velocity[0] * time, velocity[1] * time + gravity * time * time];
  return {
    progress: t,
    drift: position(t),
    rotation: spin * t,
    reveal: smooth7(t / 0.16),
    trailStart: position(Math.max(0, t - 0.24)),
    trailEnd: position(Math.max(0, t - 0.065))
  };
}
function effectOrigin(anchors) {
  const l = anchors["eye.L"], r = anchors["eye.R"];
  if (l && r) return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
  return anchors["head.eyeMid"] ?? anchors["head.centre"] ?? [627, 531];
}
var EffectDriver = class {
  /** Start in `expression` with its shades already up (the lab's anger and defeat start at 1 in theirs) and no burst. */
  constructor(expression, effectOf2) {
    /** The expression's shades: their envelopes, by effect id. */
    __publicField(this, "levels", /* @__PURE__ */ new Map());
    /** The expression whose bursts play, and when it began (the idle clock, ms); null until the first change. */
    __publicField(this, "burst", null);
    for (const id of expression.effects ?? []) if (effectOf2(id)?.shade) this.levels.set(id, 1);
  }
  /** The expression changed at `nowMs` (the idle clock): its bursts are thrown from then, and the last one ends. */
  begin(expression, nowMs2) {
    this.burst = { expression, at: nowMs2 };
  }
  step({ expression, reaction, effectOf: effectOf2, nowMs: nowMs2, dt, motion, reducedMotion }) {
    const out = [];
    const named = new Set(expression.effects ?? []);
    for (const id of named) if (!this.levels.has(id) && effectOf2(id)?.shade) this.levels.set(id, 0);
    const seconds = Math.max(0, Number.isFinite(dt) ? dt : 0);
    for (const [id, level] of this.levels) {
      const shade = effectOf2(id)?.shade;
      if (!shade) {
        this.levels.delete(id);
        continue;
      }
      const on = named.has(id);
      const tau = on ? shade.enter : shade.exit;
      const next = level + ((on ? 1 : 0) - level) * (tau > 0 ? 1 - Math.exp(-seconds / tau) : 1);
      if (!on && next < LEVEL_EPSILON) this.levels.delete(id);
      else this.levels.set(id, next);
    }
    const w = reaction ? clamp(reaction.weight) : 0;
    const own = new Set(reaction?.def.effects ?? []);
    for (const [id, level] of this.levels) {
      const shown = level * (1 - w) + (own.has(id) ? w : 0);
      if (shown > LEVEL_EPSILON) out.push({ id, kind: "shade", level: shown });
    }
    if (w > LEVEL_EPSILON) {
      for (const id of own) if (!this.levels.has(id) && effectOf2(id)?.shade) out.push({ id, kind: "shade", level: w });
    }
    if (reducedMotion || !(motion > 0)) return out;
    const strength = clamp(motion, 0, 1.5);
    if (this.burst && w === 0) {
      const age = (nowMs2 - this.burst.at) / 1e3;
      for (const id of new Set(this.burst.expression.effects ?? [])) {
        const burst = effectOf2(id)?.burst;
        if (burst && age > 0 && age < burst.duration) out.push({ id, kind: "burst", age, strength });
      }
    }
    if (reaction) {
      for (const id of own) {
        const burst = effectOf2(id)?.burst;
        if (burst && reaction.age > 0 && reaction.age < burst.duration) out.push({ id, kind: "burst", age: reaction.age, strength });
      }
    }
    return out;
  }
};
var parsed = /* @__PURE__ */ new Map();
function commands(d) {
  let cmds = parsed.get(d);
  if (!cmds) parsed.set(d, cmds = parsePath(d));
  return cmds;
}
function burstDrawing(def, glyphOf2, age, strength, origin2, unit2) {
  const sample = sampleBurst(def.duration, age, strength);
  if (!sample.visible) return null;
  const at = (p) => [origin2[0] + p[0] * unit2, origin2[1] + p[1] * unit2];
  const particles = [];
  for (const p of def.particles) {
    const glyph = typeof p.glyph === "string" ? glyphOf2(p.glyph) : p.glyph;
    if (!glyph) continue;
    const flight = particleMotion(sample.progress, p.velocity, p.gravity ?? 12, p.spin ?? 0, p.delay ?? 0);
    if (!(flight.reveal > 0)) continue;
    const [x, y] = at([p.at[0] + flight.drift[0], p.at[1] + flight.drift[1]]);
    const m = chain(rotation(flight.rotation), scaling(sample.scale * (p.size ?? 1) * flight.reveal * unit2), translation(x, y));
    const paint2 = (v) => v === "particle" ? p.color : v;
    const paths = [];
    if (glyph.wake > 0) {
      const a = at([p.at[0] + flight.trailStart[0], p.at[1] + flight.trailStart[1]]);
      const b = at([p.at[0] + flight.trailEnd[0], p.at[1] + flight.trailEnd[1]]);
      paths.push({ d: `M ${fmt(a[0])} ${fmt(a[1])} L ${fmt(b[0])} ${fmt(b[1])}`, stroke: p.color, width: glyph.wake * unit2, opacity: flight.reveal * 0.65 });
    }
    const dash = glyph.draw ? 1 - smooth7(flight.progress / 0.25) : void 0;
    for (const g of glyph.paths) {
      const fill = paint2(g.fill), stroke = paint2(g.stroke);
      const path = { d: formatPath(mapCmds(commands(g.d), (q) => applyAffine(m, q))) };
      if (fill) path.fill = fill;
      if (stroke) {
        path.stroke = stroke;
        path.width = (g.width ?? 1) * unit2;
        if (dash !== void 0) path.dash = dash;
      }
      paths.push(path);
    }
    particles.push({ opacity: glyph.fade === false ? 1 : flight.reveal, paths });
  }
  return { opacity: sample.opacity, particles };
}
function shadeDrawing(def, origin2, unit2) {
  const at = (p) => [origin2[0] + p[0] * unit2, origin2[1] + p[1] * unit2];
  const f = def.fill;
  const fill = !f ? null : "color" in f ? { color: f.color, opacity: f.opacity ?? 1 } : { from: at(f.from), to: at(f.to), stops: f.stops.map((s) => ({ at: s.at, color: s.color, opacity: s.opacity ?? 1 })) };
  const lines = (def.lines ?? []).map((l) => ({
    d: formatPath(mapCmds(commands(l.d), at)),
    stroke: l.color,
    width: l.width * unit2,
    opacity: l.opacity ?? 1
  }));
  return { fill, lines };
}

// src/core/face/gaze.ts
var finite4 = (value) => Number.isFinite(value) ? value : 0;
function stepGazeOwnership(current, speaking, seconds) {
  const owner = clamp(current);
  const dt = clamp(seconds, 0, 0.1);
  return owner + ((speaking ? 1 : 0) - owner) * (1 - Math.exp(-dt / (speaking ? 0.12 : 0.32)));
}
function gazeTarget(pose, motion, gazeOwnership) {
  const ownership = clamp(gazeOwnership);
  const idleX = Math.tanh((finite4(pose.gazeX) + finite4(motion.glanceX)) / 13) * 11;
  const idleY = Math.tanh((finite4(pose.gazeY) + finite4(motion.glanceY)) / 9) * 6;
  const idleWeight = 1 - ownership * 0.94;
  const microX = Math.tanh(finite4(motion.sway)) * 0.32;
  const microY = Math.tanh(finite4(motion.breath)) * 0.22;
  return [idleX * idleWeight + microX * ownership, idleY * idleWeight + microY * ownership];
}

// src/core/motion/headInertia.ts
var headTransform = (pose = POSE_REST, motion) => ({
  angle: pose.headAngle + motion.sway * 2.25 + motion.headAngle,
  x: pose.headX + motion.sway * 2.4 + motion.headX,
  y: pose.headY - motion.breath * 2 + motion.headY
});
var zero = () => ({ angle: 0, x: 0, y: 0 });
var axes = ["angle", "x", "y"];
var HeadInertia = class {
  constructor() {
    __publicField(this, "previous", null);
    __publicField(this, "position", zero());
    __publicField(this, "velocity", zero());
    __publicField(this, "wasEnabled", false);
  }
  step(target, seconds, enabled = true) {
    if (!this.previous || !enabled || !this.wasEnabled || seconds > 0.25 || !Number.isFinite(seconds)) {
      this.previous = { ...target };
      this.position = { ...target };
      this.velocity = zero();
      this.wasEnabled = enabled;
      return zero();
    }
    if (seconds <= 0) return Object.fromEntries(axes.map((axis) => [axis, this.position[axis] - target[axis]]));
    const omega = 19, damping = 0.5;
    const attenuation = omega * damping;
    const frequency = omega * Math.sqrt(1 - damping * damping);
    const decay = Math.exp(-attenuation * seconds);
    const sine = Math.sin(frequency * seconds), cosine = Math.cos(frequency * seconds);
    const lag = zero();
    for (const axis of axes) {
      const speed = (target[axis] - this.previous[axis]) / seconds;
      const drift = 2 * damping * speed / omega;
      const offset = this.position[axis] - this.previous[axis] + drift;
      const relativeVelocity = this.velocity[axis] - speed;
      const quadrature = (relativeVelocity + attenuation * offset) / frequency;
      const nextOffset = decay * (offset * cosine + quadrature * sine);
      this.position[axis] = target[axis] + nextOffset - drift;
      this.velocity[axis] = speed + decay * (relativeVelocity * cosine - (attenuation * quadrature + frequency * offset) * sine);
      lag[axis] = this.position[axis] - target[axis];
    }
    this.previous = { ...target };
    return lag;
  }
};

// src/core/motion/bodyInertia.ts
var bodyTransform = (pose = POSE_REST, motion) => {
  const head = headTransform(pose, motion);
  return {
    x: motion.sway * 0.84 + head.x * 0.3 + head.angle * 0.35,
    y: motion.breath * 1.07 + pose.chest + motion.chest
  };
};
var zero2 = () => ({ x: 0, y: 0 });
var axes2 = ["x", "y"];
var OMEGA = 5;
var DAMPING = 0.18;
var BodyInertia = class {
  constructor() {
    __publicField(this, "previous", null);
    __publicField(this, "position", zero2());
    __publicField(this, "velocity", zero2());
    __publicField(this, "wasEnabled", false);
  }
  step(target, seconds, enabled = true) {
    if (!this.previous || !enabled || !this.wasEnabled || seconds > 0.25 || !Number.isFinite(seconds)) {
      this.previous = { ...target };
      this.position = { ...target };
      this.velocity = zero2();
      this.wasEnabled = enabled;
      return zero2();
    }
    if (seconds <= 0) return { x: this.position.x - target.x, y: this.position.y - target.y };
    const attenuation = OMEGA * DAMPING;
    const frequency = OMEGA * Math.sqrt(1 - DAMPING * DAMPING);
    const decay = Math.exp(-attenuation * seconds);
    const sine = Math.sin(frequency * seconds), cosine = Math.cos(frequency * seconds);
    const lag = zero2();
    for (const axis of axes2) {
      const speed = (target[axis] - this.previous[axis]) / seconds;
      const drift = 2 * DAMPING * speed / OMEGA;
      const offset = this.position[axis] - this.previous[axis] + drift;
      const relativeVelocity = this.velocity[axis] - speed;
      const quadrature = (relativeVelocity + attenuation * offset) / frequency;
      const nextOffset = decay * (offset * cosine + quadrature * sine);
      this.position[axis] = target[axis] + nextOffset - drift;
      this.velocity[axis] = speed + decay * (relativeVelocity * cosine - (attenuation * quadrature + frequency * offset) * sine);
      lag[axis] = this.position[axis] - target[axis];
    }
    this.previous = { ...target };
    return lag;
  }
};

// src/core/motion/frame.ts
var OWNER_EPSILON = 1e-3;
var MIN_OPEN2 = 0.015;
var WINK_FROM = 0.5;
var WINK_FULL = 0.75;
function stepSpeechOwnership(current, speaking, seconds) {
  return speaking ? 1 : clamp(current) * Math.exp(-clamp(seconds, 0, 0.1) / 0.04);
}
var sanitize = (a) => ({
  openness: clamp(a.openness),
  width: clamp(Number.isFinite(a.width) ? a.width : 0.5),
  rounding: clamp(a.rounding),
  energy: clamp(a.energy ?? 0)
});
var atRest = (a) => Math.abs(a.openness - REST_ARTICULATION.openness) <= OWNER_EPSILON && Math.abs(a.width - REST_ARTICULATION.width) <= OWNER_EPSILON && Math.abs(a.rounding - REST_ARTICULATION.rounding) <= OWNER_EPSILON && Math.abs(a.energy - REST_ARTICULATION.energy) <= OWNER_EPSILON;
// realtime-context-standard-demo: the speech's own acting (SpeechSample.gesture), from the host. Not in the creator's
// export: client/scripts/use-avatar.sh applies it to each new one.
var GESTURE_MOUTH_KEYS = /* @__PURE__ */ new Set(["smile", "smirk", "restOpen"]);
function gestured(pose, gesture, amount) {
  if (!gesture) return pose;
  const out = { ...pose };
  const relax = clamp(gesture.relax ?? 0);
  out.smile = 1 + (out.smile - 1) * (1 - relax);
  out.smirk *= 1 - relax;
  for (const [key, value] of Object.entries(gesture.pose ?? {})) {
    if (isPoseKey(key) && Number.isFinite(value)) out[key] += value * (GESTURE_MOUTH_KEYS.has(key) ? 1 : amount);
  }
  return out;
}
var AvatarFrameDriver = class {
  constructor(nowMs2, wallMs = nowMs2, options = {}) {
    __publicField(this, "headInertia", new HeadInertia());
    __publicField(this, "bodyInertia", new BodyInertia());
    __publicField(this, "library");
    __publicField(this, "poses", /* @__PURE__ */ new WeakMap());
    __publicField(this, "spring");
    __publicField(this, "idle");
    __publicField(this, "reactions");
    __publicField(this, "effects");
    /** The library's effects by id, for the effects list it was made from. */
    __publicField(this, "effectIndex", { list: void 0, byId: /* @__PURE__ */ new Map() });
    /** The expression id last asked for (an unknown one plays neutral), and the expression it plays. */
    __publicField(this, "expressionId");
    __publicField(this, "current");
    /** The library changed: find the expression again at the next step. */
    __publicField(this, "stale", false);
    __publicField(this, "previous");
    __publicField(this, "previousWall");
    __publicField(this, "started");
    __publicField(this, "speechOwnership", 0);
    __publicField(this, "gazeOwnership", 0);
    this.previous = nowMs2;
    this.previousWall = wallMs;
    this.started = nowMs2;
    this.library = options.animation ?? BUILTIN_ANIMATION;
    this.expressionId = options.expression ?? NEUTRAL_EXPRESSION.id;
    const start = this.current = expressionOf(this.library, this.expressionId);
    this.spring = new PoseSpring(this.poseOf(start));
    this.idle = new MotionMixer(start.id, start.idle);
    this.reactions = new ReactionDriver((id) => this.reactionOf(id));
    this.effects = new EffectDriver(start, (id) => this.effectOf(id));
  }
  /** The expression id last asked for. */
  get expression() {
    return this.expressionId;
  }
  /** The library it plays from now on (a reaction under way plays on; the expression is found again at the next step). */
  setAnimation(library) {
    if (library === this.library) return;
    this.library = library;
    this.stale = true;
  }
  step(inputs, idleMs, reducedMotion = false, wallMs = idleMs) {
    const { motion = 1, speech = null, expression = NEUTRAL_EXPRESSION.id, reaction = null } = inputs;
    if (expression !== this.expressionId || this.stale) {
      const def = expressionOf(this.library, expression);
      if (def !== this.current) {
        this.spring.setTarget(this.poseOf(def), reducedMotion ? 0 : motion);
        this.idle.setTarget(def.id, def.idle);
        if (def.id !== this.current.id) this.effects.begin(def, idleMs);
        this.current = def;
      }
      this.expressionId = expression;
      this.stale = false;
    }
    const elapsed = Math.max(0, (idleMs - this.previous) / 1e3);
    const dt = Math.min(elapsed, 0.1);
    this.previous = idleMs;
    const wall = (wallMs - this.previousWall) / 1e3;
    this.previousWall = wallMs;
    const speaking = speech?.speaking === true;
    const articulation = speech ? sanitize(speech.articulation) : { ...REST_ARTICULATION };
    let owner = stepSpeechOwnership(this.speechOwnership, speaking, wall);
    if (!speaking && owner < OWNER_EPSILON && atRest(articulation)) owner = 0;
    this.speechOwnership = owner;
    this.gazeOwnership = stepGazeOwnership(this.gazeOwnership, speaking || speech?.gesture?.attend === true, wall);
    const base = this.idle.sample((idleMs - this.started) / 1e3, dt, reducedMotion ? 0 : motion);
    const acted = this.reactions.step({
      basePose: this.spring.step(dt),
      baseMotion: base,
      trigger: reaction,
      nowMs: idleMs,
      dt: elapsed,
      amount: motion,
      reducedMotion
    });
    const { motion: frame } = acted;
    const pose = gestured(acted.pose, speech?.gesture, reducedMotion ? 0 : motion);
    const playing = acted.reaction ? this.reactionOf(acted.reaction.id) : void 0;
    const effects = this.effects.step({
      expression: this.current,
      reaction: acted.reaction && playing ? { def: playing, age: acted.reaction.age, weight: acted.reaction.weight } : null,
      effectOf: (id) => this.effectOf(id),
      nowMs: idleMs,
      dt,
      motion,
      reducedMotion
    });
    const [gazeX, gazeY] = gazeTarget(pose, frame, this.gazeOwnership);
    const wink = clamp((Math.abs(pose.eyeLeft - pose.eyeRight) - WINK_FROM) / (WINK_FULL - WINK_FROM));
    const lids = 1 - frame.blink * (1 - wink * wink * (3 - 2 * wink));
    return {
      motion: frame,
      headLag: this.headInertia.step(headTransform(pose, frame), elapsed, !reducedMotion && motion > 0),
      bodyLag: this.bodyInertia.step(bodyTransform(pose, frame), elapsed, !reducedMotion && motion > 0),
      pose,
      reaction: acted.reaction,
      eyes: {
        openLeft: Math.max(MIN_OPEN2, pose.eyeLeft * lids),
        openRight: Math.max(MIN_OPEN2, pose.eyeRight * lids),
        smile: pose.eyeSmile,
        gazeX,
        gazeY
      },
      mouth: { articulation, owner, talking: speech ? clamp(speech.talking ?? 0) : 0 },
      effects
    };
  }
  poseOf(def) {
    let pose = this.poses.get(def);
    if (!pose) this.poses.set(def, pose = poseOf(def.pose));
    return pose;
  }
  reactionOf(id) {
    return this.library.reactions.find((r) => r.id === id);
  }
  effectOf(id) {
    const list = this.library.effects;
    if (list !== this.effectIndex.list) this.effectIndex = { list, byId: new Map((list ?? []).map((e) => [e.id, e])) };
    return this.effectIndex.byId.get(id);
  }
};

// src/core/rig.ts
var KIND_MOTION = {
  hair: { tipPx: 10, maxTurn: 5 },
  "hair-rear": { tipPx: 8, maxTurn: 3 },
  dangling: { tipPx: 8, maxTurn: 4.5 },
  cloth: { tipPx: 4, maxTurn: 2.5 },
  arm: { tipPx: 3, maxTurn: 1.5 }
};
var ease = (signal) => Math.tanh(signal / 2) * 2;
var HUNG_SWAY = 0.7;
var HUNG_SPLAY = 0.55;
var BOTTOM = 1254;
var isIdentity = (m) => Math.abs(m[0] - 1) < 1e-6 && Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6 && Math.abs(m[3] - 1) < 1e-6 && Math.abs(m[4]) < 1e-4 && Math.abs(m[5]) < 1e-4;
function turnOf(kind, layer) {
  const k = KIND_MOTION[kind];
  if (!k || !layer.bounds) return 0;
  const [x0, y0, x1, y1] = layer.bounds;
  const [px, py] = layer.pivot;
  const reach = Math.max(Math.hypot(x0 - px, y0 - py), Math.hypot(x1 - px, y0 - py), Math.hypot(x0 - px, y1 - py), Math.hypot(x1 - px, y1 - py), 1);
  return Math.min(k.tipPx / reach * (180 / Math.PI), k.maxTurn);
}
function headCarrier(r, frame) {
  const s = r.actingScale > 0 ? r.actingScale : 1;
  const h = headTransform(frame.pose ?? POSE_REST, frame.motion);
  const headPivot = r.anchors["head.pivot"] ?? [627, 758];
  return chain(rotation(h.angle, headPivot), translation(h.x * s, h.y * s));
}
var toward = (m, t) => t < 1 ? m.map((v, i) => IDENTITY[i] + (v - IDENTITY[i]) * t) : m;
function headAffine(r, frame, amount = 1) {
  const t = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 1));
  return toward(headCarrier(r, frame), t);
}
function rigTransforms(r, frame, amount = 1) {
  const t = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 1));
  const m = frame.motion;
  const pose = frame.pose ?? POSE_REST;
  const s = r.actingScale > 0 ? r.actingScale : 1;
  const lag = frame.headLag ?? { angle: 0, x: 0, y: 0 };
  const hung = frame.bodyLag ?? { x: 0, y: 0 };
  const collarX = r.anchors["body.collar"]?.[0] ?? 627;
  const head = headCarrier(r, { motion: m, pose });
  const collarY = r.anchors["body.collar"]?.[1] ?? 920;
  const span2 = Math.max(BOTTOM - collarY, 1);
  const dx = m.sway * 0.84 * s;
  const dy = -(m.breath * 1.07 + pose.chest + (m.chest ?? 0)) * s;
  const body = [1, 0, -dx / span2, 1 - dy / span2, dx * BOTTOM / span2, dy * BOTTOM / span2];
  const signal = {
    hair: ease(m.hair + lag.angle * 0.3),
    "hair-rear": ease(m.rearHair + lag.angle * 0.2),
    dangling: ease(m.hair * 0.6 + m.scarf * 0.4 + lag.angle * 0.5),
    cloth: ease(m.scarf + m.scarfBounce * 0.3),
    arm: ease(m.sway * 0.6 + m.breath * 0.15)
  };
  const hatAngle = Math.tanh((lag.angle + lag.x * 0.2) / 2.5) * 2.5;
  const hatX = Math.tanh(lag.x * s / 18) * 18;
  const hatY = Math.tanh(lag.y * s / 5) * 5;
  const out = {};
  const affines = /* @__PURE__ */ new Map();
  for (const layer of r.layers) {
    let local = IDENTITY;
    const k = layer.kind;
    if (k === "hat" && (hatAngle || hatX || hatY)) local = chain(rotation(hatAngle, layer.pivot), translation(hatX, hatY));
    else if (k === "dangling" && layer.follows === "body") {
      const side = layer.pivot[0] < collarX ? 1 : -1;
      const angle = ease(-hung.x * HUNG_SWAY + side * hung.y * HUNG_SPLAY) * turnOf(k, layer);
      if (angle) local = rotation(angle, layer.pivot);
    } else if (KIND_MOTION[k] && signal[k]) {
      const angle = signal[k] * turnOf(k, layer);
      if (angle) local = rotation(angle, layer.pivot);
    }
    const carrier = layer.follows === "head" ? head : layer.follows === "body" ? body : IDENTITY;
    const m2 = toward(multiply(carrier, local), t);
    affines.set(layer.key, m2);
    out[layer.key] = t === 0 || isIdentity(m2) ? "" : affineToSvg(m2);
  }
  for (const layer of r.layers) {
    if (!layer.cutBy) continue;
    const own = affines.get(layer.key), by = affines.get(layer.cutBy);
    if (!own || !by) continue;
    let cut;
    try {
      cut = multiply(invert(own), by);
    } catch {
      continue;
    }
    out[`${layer.key}@cut`] = t === 0 || isIdentity(cut) ? "" : affineToSvg(cut);
  }
  return out;
}

// src/runtime/ease.ts
var HOLD_EASE_MS = 200;
var RESUME_DELAY_MS = 300;
var RESUME_EASE_MS = 500;
var smooth8 = (t) => t * t * (3 - 2 * t);
var HoldEase = class {
  constructor() {
    /** 1: full motion; 0: the rest pose. */
    __publicField(this, "amount", 1);
    __publicField(this, "wait", 0);
    __publicField(this, "wasHeld", false);
  }
  /** One frame of `stepMs`: whether the idle clock runs, and the blend towards rest (1 full motion, 0 rest). */
  step(stepMs, hold) {
    let advance = true;
    if (hold) {
      this.wasHeld = true;
      this.wait = RESUME_DELAY_MS;
      this.amount = Math.max(0, this.amount - stepMs / HOLD_EASE_MS);
      advance = false;
    } else if (this.wasHeld) {
      if (this.wait > 0) {
        this.wait -= stepMs;
        advance = false;
      } else {
        this.amount = Math.min(1, this.amount + stepMs / RESUME_EASE_MS);
        if (this.amount >= 1) this.wasHeld = false;
      }
    }
    return { advance, blend: this.amount >= 1 ? 1 : smooth8(this.amount) };
  }
};
function blendEyes(eyes, blend) {
  if (blend >= 1) return eyes;
  return {
    openLeft: 1 - (1 - eyes.openLeft) * blend,
    openRight: 1 - (1 - eyes.openRight) * blend,
    smile: eyes.smile * blend + 0,
    gazeX: eyes.gazeX * blend + 0,
    gazeY: eyes.gazeY * blend + 0
  };
}
function blendPose(pose, blend) {
  if (blend >= 1) return pose;
  const out = { ...pose };
  for (const k of POSE_KEYS) out[k] = POSE_REST[k] + (pose[k] - POSE_REST[k]) * blend + 0;
  return out;
}

// src/runtime/plan.ts
function composeTransform(m, own) {
  const ours = affineToSvg(m);
  const o = own?.trim();
  return o ? `${ours} ${o}` : ours;
}
function layerTransform(value, own) {
  if (!value) return null;
  const o = own?.trim();
  return o ? `${value} ${o}` : value;
}
function eyeToShine(spec) {
  if (!spec.shine) return null;
  try {
    return multiply(invert(spec.shine.frame), spec.frame);
  } catch {
    return null;
  }
}
function eyePlan(spec, pose, eyeClip, toShine = eyeToShine(spec)) {
  if (pose.rest) return null;
  let shineMove = null;
  let shineClip = null;
  if (spec.shine && toShine) {
    const g = pose.shineGaze ?? [0, 0];
    const glance = translation(g[0], g[1]);
    if (eyeClip) {
      shineClip = multiply(toShine, pose.squash);
      shineMove = glance;
    } else {
      const squash = multiply(toShine, multiply(pose.squash, invert(toShine)));
      shineMove = multiply(squash, glance);
    }
  }
  return {
    squash: pose.squash,
    move: translation(pose.gaze[0], pose.gaze[1]),
    shineMove,
    shineClip,
    lid: pose.lid ? { d: pose.lid.d, width: pose.lid.width, paint: spec.lid.paint } : null
  };
}
function eyeRigNode(plan, shineClipId, shapes) {
  const children = [];
  if (plan.shineClip && shapes.length) {
    const m = plan.shineClip;
    children.push({
      tag: "defs",
      attrs: {},
      children: [{
        tag: "clipPath",
        attrs: { id: shineClipId, clipPathUnits: "userSpaceOnUse" },
        children: shapes.map((s) => ({ tag: s.tag, attrs: { ...s.attrs, transform: composeTransform(m, s.transform) } }))
      }]
    });
  }
  if (plan.lid) {
    children.push({
      tag: "path",
      attrs: {
        "data-cr-eye-lid": "",
        d: plan.lid.d,
        fill: "none",
        stroke: plan.lid.paint,
        "stroke-width": fmt(plan.lid.width, 3),
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }
    });
  }
  return children.length ? { tag: "g", attrs: { "data-cr-eye-rig": "" }, children } : null;
}
function mouthInsideNode(spec, pose, ids) {
  const inside = pose.open ? pose.interior : void 0;
  if (!inside) return null;
  const defs = [{ tag: "clipPath", attrs: { id: ids.cavity, clipPathUnits: "userSpaceOnUse" }, children: [{ tag: "path", attrs: { d: inside.cavity } }] }];
  const clipped = [];
  if (inside.teeth) {
    clipped.push({ tag: "path", attrs: { "data-mouth-part": "teeth", d: inside.teeth.d, fill: spec.paint.teeth, opacity: fmt(inside.teeth.opacity, 3) } });
  }
  if (inside.tongue) {
    const [a, b] = inside.tongue.axis;
    defs.push({
      tag: "linearGradient",
      attrs: { id: ids.tongue, gradientUnits: "userSpaceOnUse", x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]) },
      children: [
        { tag: "stop", attrs: { offset: "0", "stop-color": spec.paint.tongue } },
        { tag: "stop", attrs: { offset: "1", "stop-color": spec.paint.tongueDeep } }
      ]
    });
    clipped.push({ tag: "path", attrs: { "data-mouth-part": "tongue", d: inside.tongue.d, fill: `url(#${ids.tongue})`, opacity: fmt(inside.tongue.opacity, 3) } });
  }
  const children = [
    { tag: "defs", attrs: {}, children: defs },
    { tag: "path", attrs: { "data-mouth-part": "cavity", d: inside.cavity, fill: spec.paint.cavity } }
  ];
  if (clipped.length) children.push({ tag: "g", attrs: { "clip-path": `url(#${ids.cavity})` }, children: clipped });
  return { tag: "g", attrs: { "data-cr-mouth-rig": "inside" }, children };
}
var TWIN_STROKE_ATTRS = ["d", "fill-rule", "opacity", "stroke-opacity", "stroke-width", "stroke-linecap", "stroke-linejoin"];
function lineTwinNode(node, hook) {
  const copies = [];
  const walk = (n) => {
    if (n.tag === "defs") return;
    const stroke = n.attrs.stroke;
    if (n.tag === "path" && stroke && stroke !== "none") {
      const attrs = {};
      for (const k of TWIN_STROKE_ATTRS) if (n.attrs[k] !== void 0) attrs[k] = n.attrs[k];
      copies.push({ tag: "path", attrs: { ...attrs, fill: "none", stroke: "currentColor" } });
    }
    for (const c of n.children ?? []) walk(c);
  };
  if (node) walk(node);
  return copies.length ? { tag: "g", attrs: { ...hook }, children: copies } : null;
}
function mouthLineNode(spec, pose) {
  const line = pose.open ? pose.line : void 0;
  if (!line) return null;
  return {
    tag: "g",
    attrs: { "data-cr-mouth-rig": "line" },
    children: [{
      tag: "path",
      attrs: {
        "data-mouth-part": "line",
        d: line.d,
        fill: "none",
        stroke: spec.paint.line,
        "stroke-width": fmt(line.width, 3),
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      }
    }]
  };
}
var MAX_PIECES = 64;
var lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function splitCmds(cmds, maxLength) {
  if (!(maxLength > 0) || !Number.isFinite(maxLength)) return cmds.slice();
  const pieces = (length) => Math.min(MAX_PIECES, Math.max(1, Math.ceil(length / maxLength)));
  const out = [];
  let cur = [0, 0];
  let start = [0, 0];
  const lineTo = (to) => {
    const n = pieces(dist(cur, to));
    for (let i = 1; i < n; i++) out.push({ c: "L", p: lerp3(cur, to, i / n) });
  };
  for (const k of cmds) {
    if (k.c === "M") {
      out.push(k);
      cur = start = k.p;
    } else if (k.c === "L") {
      lineTo(k.p);
      out.push(k);
      cur = k.p;
    } else if (k.c === "Z") {
      lineTo(start);
      out.push(k);
      cur = start;
    } else {
      let [p0, p1, p2] = [cur, k.p1, k.p2];
      for (let i = pieces(dist(cur, k.p1) + dist(k.p1, k.p2) + dist(k.p2, k.p)); i > 1; i--) {
        const t = 1 / i;
        const a = lerp3(p0, p1, t), b = lerp3(p1, p2, t), c = lerp3(p2, k.p, t);
        const d = lerp3(a, b, t), e = lerp3(b, c, t), m = lerp3(d, e, t);
        out.push({ c: "C", p1: a, p2: d, p: m });
        [p0, p1, p2] = [m, e, c];
      }
      out.push({ c: "C", p1, p2, p: k.p });
      cur = k.p;
    }
  }
  return out;
}
function gradientGeometry(tag, attr) {
  if (attr("gradientUnits")?.trim() !== "userSpaceOnUse") return null;
  const num2 = (name) => {
    const v = attr(name)?.trim();
    return v ? Number(v) : void 0;
  };
  const t = attr("gradientTransform")?.trim();
  let transform = null;
  if (t) {
    transform = parseTransform(t);
    if (!transform) return null;
    try {
      invert(transform);
    } catch {
      return null;
    }
  }
  const finite5 = (...v) => v.every((x) => x !== void 0 && Number.isFinite(x));
  if (tag === "linearGradient") {
    const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(num2);
    return finite5(x1, y1, x2, y2) ? { kind: "linear", transform, p1: [x1, y1], p2: [x2, y2] } : null;
  }
  if (tag !== "radialGradient") return null;
  const [cx, cy, r, fx, fy, fr] = ["cx", "cy", "r", "fx", "fy", "fr"].map(num2);
  if (!finite5(cx, cy, r) || [fx, fy, fr].some((v) => v !== void 0 && !Number.isFinite(v))) return null;
  const f = fx === void 0 && fy === void 0 ? null : [fx ?? cx, fy ?? cy];
  return { kind: "radial", transform, c: [cx, cy], r, f, fr: fr ?? null };
}
function carriedGradient(g, f) {
  const m = g.transform;
  const back = m ? invert(m) : null;
  const toUser = (p) => m ? applyAffine(m, p) : p;
  const fromUser = (p) => back ? applyAffine(back, p) : p;
  const carry2 = (p) => fromUser(f(toUser(p)));
  if (g.kind === "linear") {
    const [a, b] = [carry2(g.p1), carry2(g.p2)];
    return { x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]) };
  }
  const at = toUser(g.c);
  const to = f(at);
  const c = fromUser(to);
  const r = g.r * (m ? Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : 1);
  const stretch = r > 0 ? (dist(f([at[0] + r, at[1]]), to) + dist(f([at[0], at[1] + r]), to)) / (2 * r) : 1;
  const out = { cx: fmt(c[0]), cy: fmt(c[1]), r: fmt(g.r * stretch) };
  if (g.f) {
    const p = carry2(g.f);
    Object.assign(out, { fx: fmt(p[0]), fy: fmt(p[1]) });
  }
  if (g.fr !== null) out.fr = fmt(g.fr * stretch);
  return out;
}
var opacityOf = (v) => v < 1 ? { opacity: fmt(Math.max(0, v), 4) } : {};
function effectPathNode(p) {
  const attrs = { d: p.d, fill: p.fill ?? "none" };
  if (p.stroke) {
    Object.assign(attrs, { stroke: p.stroke, "stroke-width": fmt(p.width ?? 1, 3), "stroke-linecap": "round", "stroke-linejoin": "round" });
    if (p.dash !== void 0) Object.assign(attrs, { pathLength: "1", "stroke-dasharray": "1", "stroke-dashoffset": fmt(p.dash, 4) });
  }
  return { tag: "path", attrs: { ...attrs, ...opacityOf(p.opacity ?? 1) } };
}
var effectsGroup = (kind, head, opacity) => ({
  "data-cr-effects": kind,
  transform: affineToSvg(head),
  ...opacityOf(opacity),
  "aria-hidden": "true",
  "pointer-events": "none"
});
function burstsNode(bursts, head, opacity) {
  if (!bursts.length) return null;
  return {
    tag: "g",
    attrs: effectsGroup("burst", head, opacity),
    children: bursts.map(({ id, drawing }) => ({
      tag: "g",
      attrs: { "data-cr-effect": id, ...opacityOf(drawing.opacity) },
      children: drawing.particles.map((p) => ({ tag: "g", attrs: opacityOf(p.opacity), children: p.paths.map(effectPathNode) }))
    }))
  };
}
function shadesNode(shades, face, box, head, opacity, ids) {
  if (!shades.length || !face.length) return null;
  const clip = `${ids}face`;
  const children = [{ tag: "clipPath", attrs: { id: clip, clipPathUnits: "userSpaceOnUse" }, children: face.map((d) => ({ tag: "path", attrs: { d } })) }];
  const [x0, y0, x1, y1] = box;
  for (const { id, level, drawing } of shades) {
    const parts = [];
    const f = drawing.fill;
    if (f) {
      let paint2;
      let alpha = 1;
      if ("color" in f) {
        paint2 = f.color;
        alpha = f.opacity;
      } else {
        const gradient = `${ids}${id}-fill`;
        parts.push({
          tag: "linearGradient",
          attrs: { id: gradient, gradientUnits: "userSpaceOnUse", x1: fmt(f.from[0]), y1: fmt(f.from[1]), x2: fmt(f.to[0]), y2: fmt(f.to[1]) },
          children: f.stops.map((s) => ({ tag: "stop", attrs: { offset: fmt(s.at, 4), "stop-color": s.color, "stop-opacity": fmt(s.opacity, 4) } }))
        });
        paint2 = `url(#${gradient})`;
      }
      parts.push({ tag: "rect", attrs: { x: fmt(x0), y: fmt(y0), width: fmt(x1 - x0), height: fmt(y1 - y0), fill: paint2, ...opacityOf(alpha) } });
    }
    parts.push(...drawing.lines.map(effectPathNode));
    children.push({ tag: "g", attrs: { "data-cr-effect": id, "clip-path": `url(#${clip})`, ...opacityOf(level) }, children: parts });
  }
  return { tag: "g", attrs: effectsGroup("shade", head, opacity), children };
}

// src/runtime/writer.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var descendants = (root) => Array.from(root.getElementsByTagName("*"));
var AttrWriter = class {
  constructor() {
    __publicField(this, "owned", /* @__PURE__ */ new Map());
    __publicField(this, "frame", 0);
  }
  /** Start a frame: what it does not write again is restored by `end`. */
  begin() {
    this.frame += 1;
  }
  /** Write `value`, or (null) the element's own value back. Nothing happens when the attribute already shows it. */
  set(el, name, value) {
    let attrs = this.owned.get(el);
    let w = attrs?.get(name);
    if (!w) {
      if (value === null) return;
      const own = el.getAttribute(name);
      w = { own, wrote: own, frame: this.frame };
      if (!attrs) this.owned.set(el, attrs = /* @__PURE__ */ new Map());
      attrs.set(name, w);
    }
    w.frame = this.frame;
    const next = value ?? w.own;
    if (next === w.wrote) return;
    if (next === null) el.removeAttribute(name);
    else el.setAttribute(name, next);
    w.wrote = next;
  }
  /** The attribute's value before any write of ours. */
  own(el, name) {
    const w = this.owned.get(el)?.get(name);
    return w ? w.own : el.getAttribute(name);
  }
  /** End a frame: restore every attribute it did not write. */
  end() {
    for (const [el, attrs] of this.owned) {
      for (const [name, w] of attrs) {
        if (w.frame === this.frame) continue;
        if (w.wrote !== w.own) {
          if (w.own === null) el.removeAttribute(name);
          else el.setAttribute(name, w.own);
        }
        attrs.delete(name);
      }
      if (!attrs.size) this.owned.delete(el);
    }
  }
  /** Restore every write. */
  clear() {
    this.begin();
    this.end();
  }
  /**
   * Let go of every write after a host re-render: an attribute that still shows our write gets its own value back;
   * one the host has written since is the host's now.
   */
  release() {
    for (const [el, attrs] of this.owned) {
      for (const [name, w] of attrs) {
        if (w.wrote === w.own || el.getAttribute(name) !== w.wrote) continue;
        if (w.own === null) el.removeAttribute(name);
        else el.setAttribute(name, w.own);
      }
    }
    this.owned.clear();
  }
};
function create(parent, node) {
  const el = parent.ownerDocument.createElementNS(SVG_NS, node.tag);
  for (const [k, v] of Object.entries(node.attrs)) el.setAttribute(k, v);
  for (const c of node.children ?? []) el.appendChild(create(el, c));
  return el;
}
function patch(el, node) {
  for (const [k, v] of Object.entries(node.attrs)) if (el.getAttribute(k) !== v) el.setAttribute(k, v);
  for (const k of el.getAttributeNames()) if (!(k in node.attrs)) el.removeAttribute(k);
  const want = node.children ?? [];
  const have = Array.from(el.children);
  want.forEach((c, i) => {
    const at = have[i];
    if (at && at.localName === c.tag) patch(at, c);
    else {
      const made = create(el, c);
      el.insertBefore(made, at ?? null);
      at?.remove();
    }
  });
  for (const extra of have.slice(want.length)) extra.remove();
}
var GenSlot = class {
  constructor(where) {
    __publicField(this, "where", where);
    __publicField(this, "el", null);
  }
  sync(parent, node, before = null) {
    if (!node) return this.remove();
    if (!this.el || this.el.parentNode !== parent) {
      this.remove();
      this.el = create(parent, node);
    } else patch(this.el, node);
    if (this.where === "first") {
      if (parent.firstElementChild !== this.el) parent.insertBefore(this.el, parent.firstChild);
    } else if (before && before.parentNode === parent) {
      if (this.el.nextElementSibling !== before) parent.insertBefore(this.el, before);
    } else if (parent.lastElementChild !== this.el) parent.appendChild(this.el);
  }
  remove() {
    this.el?.remove();
    this.el = null;
  }
  /** The group, while it is there. */
  get element() {
    return this.el;
  }
};
function layerGroups(root) {
  const out = /* @__PURE__ */ new Map();
  const add = (key, el) => {
    const list = out.get(key);
    if (list) list.push(el);
    else out.set(key, [el]);
  };
  for (const el of descendants(root)) {
    const key = el.getAttribute("data-cr-key");
    if (key !== null) add(key, el);
    const cut = el.getAttribute("data-cr-cut");
    if (cut !== null) add(`${cut}@cut`, el);
  }
  return out;
}
var frameOf = (layer) => layer ? descendants(layer).find((el) => el.hasAttribute("data-cr-frame")) ?? null : null;
var twinOf = (frame) => Array.from(frame.children).find((el) => el.hasAttribute("data-overlay")) ?? null;
var groupsOf = (frame, roles) => descendants(frame).filter((el) => roles.has(el.getAttribute("data-sub-role") ?? ""));
function idIndex(root) {
  const out = /* @__PURE__ */ new Map();
  for (const el of [root, ...descendants(root)]) {
    const id = el.getAttribute("id");
    if (id && !out.has(id)) out.set(id, el);
  }
  return out;
}
var clipOf = (el) => clipRef(el.getAttribute("clip-path"), el.getAttribute("style"));
function within(el, top, test) {
  for (let e = el; e && e !== top; e = e.parentElement) if (test(e)) return true;
  return false;
}
function writeTransform(w, els, m) {
  for (const el of els) w.set(el, "transform", composeTransform(m, w.own(el, "transform")));
}
var EyeRig = class {
  constructor(spec, frame, layers, ids, prefix) {
    __publicField(this, "spec");
    __publicField(this, "frame");
    /** The eye's overlay twin, or null. */
    __publicField(this, "twin");
    __publicField(this, "squash");
    __publicField(this, "move");
    /** Both squashed and moved (a mass eye's mass). */
    __publicField(this, "both");
    /** The children of every clip path used in the frame outside the squash groups (which carry the squash already). */
    __publicField(this, "clips");
    __publicField(this, "shapes");
    __publicField(this, "shine");
    __publicField(this, "slot", new GenSlot("last"));
    __publicField(this, "twinSlot", new GenSlot("last"));
    __publicField(this, "shineClipId");
    this.spec = spec;
    this.frame = frame;
    this.twin = twinOf(frame);
    const squashRoles = new Set(spec.squash);
    const moveRoles = new Set(spec.kind === "mass" ? [...spec.move, "mass"] : spec.move);
    const roleOf = (el) => el.getAttribute("data-sub-role") ?? "";
    const groups = groupsOf(frame, /* @__PURE__ */ new Set([...squashRoles, ...moveRoles]));
    this.squash = groups.filter((el) => squashRoles.has(roleOf(el)) && !moveRoles.has(roleOf(el)));
    this.move = groups.filter((el) => moveRoles.has(roleOf(el)) && !squashRoles.has(roleOf(el)));
    this.both = groups.filter((el) => squashRoles.has(roleOf(el)) && moveRoles.has(roleOf(el)));
    const inSquash = (el) => within(el, frame, (e) => squashRoles.has(roleOf(e)));
    const clipIds = /* @__PURE__ */ new Set();
    for (const el of descendants(frame)) {
      const id = clipOf(el);
      if (id && !inSquash(el)) clipIds.add(id);
    }
    this.clips = [...clipIds].flatMap((id) => Array.from(ids.get(id)?.children ?? []));
    const eyeClip = descendants(frame).map((el) => el.hasAttribute("data-cr-eye-clip") ? clipOf(el) : null).find((id) => id) ?? null;
    this.shapes = Array.from(eyeClip && ids.get(eyeClip)?.children || []).map((el) => {
      const attrs = {};
      for (const k of el.getAttributeNames()) if (k !== "id" && k !== "transform") attrs[k] = el.getAttribute(k) ?? "";
      return { tag: el.localName, attrs, transform: el.getAttribute("transform") };
    });
    this.shineClipId = `${prefix}${idPart(spec.layer)}-shine-clip`;
    const shineFrame = spec.shine ? frameOf(layers.get(spec.shine.layer)?.[0]) : null;
    const toShine = eyeToShine(spec);
    this.shine = shineFrame && toShine ? { frame: shineFrame, move: groupsOf(shineFrame, new Set(spec.move)), toShine } : null;
  }
  /** The eye's frame (and its shine's) is still in the page. */
  get connected() {
    return this.frame.isConnected && (!this.shine || this.shine.frame.isConnected);
  }
  write(w, pose) {
    const plan = eyePlan(this.spec, pose, this.shapes.length > 0, this.shine?.toShine ?? null);
    if (!plan) return this.clear();
    const lift = pose.lift ?? [0, 0];
    if (lift[0] || lift[1]) {
      const frames = this.shine ? [this.frame, this.shine.frame] : [this.frame];
      for (const f of frames) w.set(f, "transform", composeTransform(translation(lift[0], lift[1]), w.own(f, "transform")));
    }
    writeTransform(w, this.squash, plan.squash);
    writeTransform(w, this.clips, plan.squash);
    writeTransform(w, this.move, plan.move);
    writeTransform(w, this.both, multiply(plan.squash, plan.move));
    if (pose.fade !== void 0 && pose.fade < 1) {
      for (const el of [...this.squash, ...this.both, ...this.move, ...this.shine?.move ?? []]) {
        const own = Number(w.own(el, "opacity") ?? "1");
        w.set(el, "opacity", fmt((Number.isFinite(own) ? own : 1) * pose.fade, 3));
      }
    }
    if (this.shine && plan.shineMove) writeTransform(w, this.shine.move, plan.shineMove);
    const node = eyeRigNode(plan, this.shineClipId, this.shine ? this.shapes : []);
    if (this.shine && plan.shineClip && this.shapes.length) w.set(this.shine.frame, "clip-path", `url(#${this.shineClipId})`);
    this.slot.sync(this.frame, node, this.twin);
    if (this.twin) this.twinSlot.sync(this.twin, lineTwinNode(node, { "data-cr-eye-rig": "twin" }));
  }
  clear() {
    this.slot.remove();
    this.twinSlot.remove();
  }
};
var BrowRig = class {
  constructor(spec, frame) {
    __publicField(this, "spec");
    __publicField(this, "frame");
    __publicField(this, "children");
    this.spec = spec;
    this.frame = frame;
    this.children = Array.from(frame.children).filter((el) => el.localName !== "defs");
  }
  get connected() {
    return this.frame.isConnected;
  }
  /** Write the brow's local transform (browPose); at rest nothing is written, so the writer removes the last one. */
  write(w, m) {
    if (!isRestAffine(m)) writeTransform(w, this.children, m);
  }
};
var PAINT_STYLE = { fill: /(?:^|;)\s*fill\s*:\s*([^;]+)/, stroke: /(?:^|;)\s*stroke\s*:\s*([^;]+)/ };
var URL_ID = /url\(\s*(["']?)#([^"')\s]+)\1\s*\)/;
var URL_IDS = new RegExp(URL_ID.source, "g");
function paintOf(el, prop) {
  const style = el.getAttribute("style");
  const m = style ? PAINT_STYLE[prop].exec(style) : null;
  if (m) return { value: m[1].trim(), attr: "style" };
  const v = el.getAttribute(prop);
  return v === null ? null : { value: v.trim(), attr: prop };
}
function referrers(root, ids) {
  const out = /* @__PURE__ */ new Map();
  const add = (id, el) => {
    if (!ids.has(id)) return;
    const list = out.get(id);
    if (!list) out.set(id, [el]);
    else if (!list.includes(el)) list.push(el);
  };
  for (const el of [root, ...descendants(root)]) {
    for (const name of el.getAttributeNames()) {
      const value = el.getAttribute(name) ?? "";
      if (name === "href" || name === "xlink:href") {
        if (value.trim().startsWith("#")) add(value.trim().slice(1), el);
      } else if (value.includes("url(")) for (const m of value.matchAll(URL_IDS)) add(m[2], el);
    }
  }
  return out;
}
var PIECE_OF_HALF_WIDTH = 1 / 6;
var MouthRig = class {
  /** `root` is the svg (where a gradient's other users are looked for) and `index` its elements by id. */
  constructor(spec, frame, prefix, root = frame, index = idIndex(root)) {
    __publicField(this, "spec");
    __publicField(this, "frame");
    /** The mouth's overlay twin, or null. */
    __publicField(this, "twin");
    __publicField(this, "roles", /* @__PURE__ */ new Map());
    /** Each path's original data in the sub-role groups, parsed at bind; split for the deformer at its first carry. */
    __publicField(this, "paths", /* @__PURE__ */ new Map());
    /** The carryable gradients the sub-roles' paths are painted with, by id, and each path's use of one. */
    __publicField(this, "gradients", /* @__PURE__ */ new Map());
    __publicField(this, "uses", []);
    /** The copies of shared gradients, by sub-role and id. */
    __publicField(this, "copies", /* @__PURE__ */ new Map());
    __publicField(this, "inside", new GenSlot("first"));
    __publicField(this, "line", new GenSlot("last"));
    __publicField(this, "lineTwin", new GenSlot("last"));
    __publicField(this, "ids");
    this.spec = spec;
    this.frame = frame;
    this.twin = twinOf(frame);
    for (const el of descendants(frame)) {
      const role = el.getAttribute("data-sub-role");
      if (!role) continue;
      const list = this.roles.get(role);
      if (list) list.push(el);
      else this.roles.set(role, [el]);
      for (const p of [el, ...descendants(el)]) {
        const d = p.localName === "path" ? p.getAttribute("d") : null;
        if (!d || this.paths.has(p)) continue;
        try {
          this.paths.set(p, { role, cmds: parsePath(d) });
        } catch {
        }
      }
    }
    const key = idPart(spec.layer);
    this.ids = { cavity: `${prefix}${key}-mouth-cavity`, tongue: `${prefix}${key}-mouth-tongue` };
    this.bindGradients(root, index, `${prefix}${key}-mouth-gradient-`);
  }
  /**
   * Find the carryable gradients each path is painted with (its own fill or stroke, or the nearest ancestor's up to
   * `root`) and whether only one sub-role's paths name each, so it can be carried in place; every other carried use
   * gets a copy.
   */
  bindGradients(root, index, copyPrefix) {
    for (const [path, { role }] of this.paths) {
      for (const prop of ["fill", "stroke"]) {
        let paint2 = null;
        let holder = path;
        for (; holder; holder = holder === root ? null : holder.parentElement) {
          paint2 = paintOf(holder, prop);
          if (paint2 && paint2.value !== "inherit") break;
        }
        const id = paint2 && holder ? URL_ID.exec(paint2.value)?.[2] : void 0;
        if (!id || !paint2 || !holder) continue;
        if (!this.gradients.has(id)) {
          const el = index.get(id);
          const geometry = el ? gradientGeometry(el.localName, (name) => el.getAttribute(name)) : null;
          if (!el || !geometry) continue;
          this.gradients.set(id, { el, geometry, transform: el.getAttribute("gradientTransform"), owner: null });
        }
        this.uses.push({ role, path, prop, holder, attr: paint2.attr, id });
      }
    }
    if (!this.uses.length) return;
    const named = referrers(root, new Set(this.gradients.keys()));
    for (const [id, g] of this.gradients) {
      const uses = this.uses.filter((u) => u.id === id);
      const roles = new Set(uses.map((u) => u.role));
      const own = (el) => uses.some((u) => u.holder === el && u.path === el);
      if (roles.size === 1 && uses.every((u) => u.holder === u.path) && (named.get(id) ?? []).every(own)) g.owner = uses[0].role;
    }
    for (const u of this.uses) {
      const key = copyKey(u.role, u.id);
      if (this.gradients.get(u.id).owner === null && !this.copies.has(key)) this.copies.set(key, { id: `${copyPrefix}${this.copies.size}`, el: null });
    }
  }
  /** The mouth's frame is still in the page. */
  get connected() {
    return this.frame.isConnected;
  }
  write(w, pose) {
    if (!pose.open) return this.clear();
    for (const role of pose.hide) for (const el of this.roles.get(role) ?? []) w.set(el, "display", "none");
    for (const [role, m] of Object.entries(pose.transforms ?? {})) if (m) writeTransform(w, this.roles.get(role) ?? [], m);
    for (const [role, v] of Object.entries(pose.opacity ?? {})) {
      if (v === void 0) continue;
      for (const el of this.roles.get(role) ?? []) {
        const own = Number(w.own(el, "opacity") ?? "1");
        w.set(el, "opacity", fmt((Number.isFinite(own) ? own : 1) * v, 3));
      }
    }
    const deform = pose.deform ?? {};
    for (const [p, path] of this.paths) {
      const f = deform[path.role];
      if (!f) continue;
      path.split ?? (path.split = splitCmds(path.cmds, this.spec.rest.halfWidth * PIECE_OF_HALF_WIDTH));
      w.set(p, "d", formatPath(mapCmds(path.split, f)));
    }
    this.carryGradients(w, deform);
    this.inside.sync(this.frame, mouthInsideNode(this.spec, pose, this.ids));
    const line = mouthLineNode(this.spec, pose);
    this.line.sync(this.frame, line, this.twin);
    if (this.twin) this.lineTwin.sync(this.twin, lineTwinNode(line, { "data-cr-mouth-rig": "line-twin" }));
  }
  /**
   * Carry each gradient a deformed sub-role is painted with: write its own attributes when only that sub-role names
   * it, else keep that sub-role's copy (an href to it, carried) just after it and point the sub-role's paths at the
   * copy. A copy no deformed sub-role uses this frame leaves the page; the attribute writes go back by the writer.
   */
  carryGradients(w, deform) {
    const carried = /* @__PURE__ */ new Set();
    const live = /* @__PURE__ */ new Set();
    const rewrites = /* @__PURE__ */ new Map();
    for (const u of this.uses) {
      const f = deform[u.role];
      if (!f) continue;
      const g = this.gradients.get(u.id);
      if (g.owner !== null) {
        if (carried.has(u.id)) continue;
        carried.add(u.id);
        for (const [k, v] of Object.entries(carriedGradient(g.geometry, f))) w.set(g.el, k, v);
        continue;
      }
      const key = copyKey(u.role, u.id);
      const copy = this.copies.get(key);
      if (!live.has(key)) {
        live.add(key);
        syncCopy(copy, u.id, g, carriedGradient(g.geometry, f));
      }
      if (!copy.el) continue;
      if (u.holder !== u.path) {
        w.set(u.path, u.prop, `url(#${copy.id})`);
        continue;
      }
      let attrs = rewrites.get(u.holder);
      if (!attrs) rewrites.set(u.holder, attrs = /* @__PURE__ */ new Map());
      let ids = attrs.get(u.attr);
      if (!ids) attrs.set(u.attr, ids = /* @__PURE__ */ new Map());
      ids.set(u.id, copy.id);
    }
    for (const [holder, attrs] of rewrites) {
      for (const [attr, ids] of attrs) w.set(holder, attr, rewriteUrls(w.own(holder, attr) ?? "", ids));
    }
    for (const [key, copy] of this.copies) {
      if (live.has(key)) continue;
      copy.el?.remove();
      copy.el = null;
    }
  }
  clear() {
    this.inside.remove();
    this.line.remove();
    this.lineTwin.remove();
    for (const copy of this.copies.values()) {
      copy.el?.remove();
      copy.el = null;
    }
  }
};
var copyKey = (role, id) => `${role}
${id}`;
function syncCopy(copy, id, g, attrs) {
  const parent = g.el.parentElement;
  if (!parent) return;
  const node = {
    tag: g.el.localName,
    attrs: { id: copy.id, href: `#${id}`, gradientUnits: "userSpaceOnUse", ...g.transform ? { gradientTransform: g.transform } : {}, ...attrs }
  };
  if (copy.el && copy.el.parentNode === parent) return patch(copy.el, node);
  copy.el?.remove();
  copy.el = create(parent, node);
  parent.insertBefore(copy.el, g.el.nextElementSibling);
}
var EffectsRig = class {
  constructor(parent, layers) {
    __publicField(this, "parent", parent);
    __publicField(this, "layers", layers);
    __publicField(this, "bursts", new GenSlot("last"));
    __publicField(this, "shades", /* @__PURE__ */ new Map());
    /** Where the bursts go: the outline's parent, else the layers' own. */
    __publicField(this, "outer");
    this.outer = parent.hasAttribute("data-cr-outline") && parent.parentElement ? parent.parentElement : parent;
  }
  get connected() {
    return this.parent.isConnected;
  }
  /** Draw the bursts' group (null: none) and the shades' groups by the layer they go before (null: last). */
  write(bursts, shades) {
    this.bursts.sync(this.outer, bursts);
    const at = /* @__PURE__ */ new Map();
    for (const { before, node } of shades) {
      const el = before === null ? null : this.childOf(before);
      const had = at.get(el);
      at.set(el, had ? { ...had, children: [...had.children ?? [], ...node.children ?? []] } : node);
    }
    for (const [el, slot] of this.shades) {
      if (at.has(el)) continue;
      slot.remove();
      this.shades.delete(el);
    }
    for (const [el, node] of at) {
      let slot = this.shades.get(el);
      if (!slot) this.shades.set(el, slot = new GenSlot("last"));
      slot.sync(this.parent, node, el ?? (this.outer === this.parent ? this.bursts.element : null));
    }
  }
  clear() {
    this.bursts.remove();
    for (const slot of this.shades.values()) slot.remove();
    this.shades.clear();
  }
  /** The parent's child that holds layer `key`, or null when it is not in the parent. */
  childOf(key) {
    for (let el = this.layers.get(key)?.[0] ?? null; el; el = el.parentElement) if (el.parentElement === this.parent) return el;
    return null;
  }
};
function bind(root, face, prefix) {
  const layers = layerGroups(root);
  const ids = idIndex(root);
  const eyes = [];
  for (const spec of face.eyes) {
    const frame = frameOf(layers.get(spec.layer)?.[0]);
    if (frame) eyes.push(new EyeRig(spec, frame, layers, ids, prefix));
  }
  const brows = [];
  for (const spec of face.brows ?? []) {
    const frame = frameOf(layers.get(spec.layer)?.[0]);
    if (frame) brows.push(new BrowRig(spec, frame));
  }
  const m = face.mouth;
  const mouthFrame = m ? frameOf(layers.get(m.layer)?.[0]) : null;
  const beside = (face.head && layers.get(face.head.layer)?.[0]) ?? (face.eyes[0] && layers.get(face.eyes[0].layer)?.[0]) ?? layers.values().next().value?.[0];
  return {
    layers,
    eyes,
    brows,
    mouth: m && mouthFrame ? new MouthRig(m, mouthFrame, prefix, root, ids) : null,
    effects: beside?.parentElement ? new EffectsRig(beside.parentElement, layers) : null
  };
}
function isStale(b) {
  for (const els of b.layers.values()) for (const el of els) if (!el.isConnected) return true;
  return b.eyes.some((e) => !e.connected) || b.brows.some((e) => !e.connected) || !!b.mouth && !b.mouth.connected || !!b.effects && !b.effects.connected;
}
function writeLayers(w, layers, transforms) {
  for (const [key, value] of Object.entries(transforms)) {
    for (const el of layers.get(key) ?? []) w.set(el, "transform", layerTransform(value, w.own(el, "transform")));
  }
}

// src/runtime/animator.ts
var MAX_STEP_MS = 100;
var Animator = class {
  constructor(root, rig, face, options) {
    __publicField(this, "root", root);
    __publicField(this, "options", options);
    __publicField(this, "rig");
    __publicField(this, "face");
    __publicField(this, "driver", null);
    /** The library the driver plays (options.animation, then setAnimation's); null: the built-in neutral alone. */
    __publicField(this, "animation");
    __publicField(this, "ease", new HoldEase());
    /** The eyes' own ease: held by a hold and by a freeze (the layers' ease is held by a hold alone). */
    __publicField(this, "eyeEase", new HoldEase());
    __publicField(this, "writer", new AttrWriter());
    __publicField(this, "damping", new SpeechMouthDamping());
    __publicField(this, "source", null);
    __publicField(this, "binding", null);
    __publicField(this, "idleMs", 0);
    /** The idle clock when the driver was made: motion time 0. */
    __publicField(this, "origin", 0);
    __publicField(this, "previous", null);
    /** Motion time (s) the idle clock is held at, or null. */
    __publicField(this, "pinned", null);
    __publicField(this, "kept", null);
    /** The mouth spec whose engine threw (onMouthError): left as drawn until the face changes. */
    __publicField(this, "failed", null);
    /** Each shade's drawing, made once for an origin and a scale; the face's box, once per head spec. */
    __publicField(this, "shadeDrawings", /* @__PURE__ */ new WeakMap());
    __publicField(this, "faceBox", null);
    /** The last speech sample a step drew (null with no source). */
    __publicField(this, "sample", null);
    this.rig = rig;
    this.face = face;
    this.animation = options.animation ?? null;
  }
  /** The expressions and reactions the frame driver plays from now on (a reaction under way plays on). */
  setAnimation(library) {
    if (library === this.animation) return;
    this.animation = library;
    this.driver?.setAnimation(library);
  }
  /** A new rig and face (a host's new resolve): every element is found again at the next write. */
  setRig(rig, face) {
    if (rig === this.rig && face === this.face) return;
    this.rig = rig;
    if (face !== this.face) {
      this.face = face;
      this.failed = null;
    }
    this.rebind();
  }
  /** Where speech comes from (null: none); a new source starts the damping again. */
  setSpeech(source2) {
    if (source2 === this.source) return;
    this.source = source2;
    this.damping.reset();
  }
  /** Hold the idle clock at `seconds` of motion time (a blink or a glance at a known moment), or let it run on from there (null). */
  pin(seconds) {
    this.pinned = seconds === null || !Number.isFinite(seconds) ? null : Math.max(0, seconds);
  }
  /** The idle clock in motion seconds (where the blink track and the looks are). */
  get idleSeconds() {
    return (this.idleMs - this.origin) / 1e3;
  }
  /** The frame the last step made, and the hold's blend (1 full motion, 0 rest); null before the first step. */
  get frame() {
    return this.kept;
  }
  /** The eyes as written: the last frame's, blended towards rest by a hold or a freeze. */
  get eyes() {
    return this.kept ? blendEyes(this.kept.frame.eyes, this.kept.eyeBlend) : null;
  }
  /** The mouth is left as drawn: its engine threw (onMouthError said why). */
  get mouthFailed() {
    return this.failed !== null;
  }
  /** The next step is a step of 0 (a loop starting again): the clocks go on from where they are. */
  restart() {
    this.previous = null;
  }
  /** One frame at `now` (performance.now() time): the clocks, speech and the frame driver. */
  step(now, inputs) {
    const step = this.previous === null ? 0 : Math.min(Math.max(now - this.previous, 0), MAX_STEP_MS);
    this.previous = now;
    const { advance, blend } = this.ease.step(step, inputs.hold);
    const eyeBlend = this.eyeEase.step(step, inputs.hold || !!inputs.freeze).blend;
    if (!this.driver) {
      this.driver = new AvatarFrameDriver(this.idleMs, now, {
        ...this.animation ? { animation: this.animation } : {},
        ...inputs.expression ? { expression: inputs.expression } : {}
      });
      this.origin = this.idleMs;
    }
    if (this.pinned !== null) this.idleMs = this.origin + this.pinned * 1e3;
    else if (advance && !inputs.freeze) this.idleMs += step;
    const frame = this.driver.step(
      { motion: inputs.motion, speech: this.speech(now), expression: inputs.expression, reaction: inputs.reaction ?? null },
      this.idleMs,
      inputs.reduced,
      now
    );
    this.kept = { frame, blend, eyeBlend };
    return frame;
  }
  /** Write the kept frame: the layers' transforms, the eyes and the mouth. Nothing before the first step. */
  write() {
    const kept = this.kept;
    if (!kept) return;
    const b = this.binding ?? (this.binding = bind(this.root, this.face, this.options.prefix));
    const w = this.writer;
    w.begin();
    writeLayers(w, b.layers, rigTransforms(this.rig, kept.frame, kept.blend));
    const scale = this.rig.actingScale;
    const eyes = blendEyes(kept.frame.eyes, kept.eyeBlend);
    for (const eye of b.eyes) eye.write(w, eyePose(eye.spec, eyes, scale));
    const pose = blendPose(kept.frame.pose, kept.blend);
    for (const brow of b.brows) {
      const { lift, angle } = browOf(brow.spec, pose);
      brow.write(w, browPose(brow.spec, lift, angle, scale));
    }
    if (b.mouth) this.writeMouth(b.mouth, kept.frame.mouth, pose);
    if (b.effects) this.writeEffects(b.effects, kept);
    w.end();
  }
  /** step and write. */
  draw(now, inputs) {
    this.step(now, inputs);
    this.write();
  }
  /** Some element the last write bound has left the page (a host replaced it without a rebind). */
  stale() {
    return !!this.binding && isStale(this.binding);
  }
  /** Let go of every write after a host re-render (writes the host has made since are the host's) and forget every element. */
  rebind() {
    this.writer.release();
    for (const eye of this.binding?.eyes ?? []) eye.clear();
    this.binding?.mouth?.clear();
    this.binding?.effects?.clear();
    this.binding = null;
  }
  /** Remove every write, the generated groups included: the svg is as the host drew it. */
  clear() {
    this.writer.clear();
    for (const eye of this.binding?.eyes ?? []) eye.clear();
    this.binding?.mouth?.clear();
    this.binding?.effects?.clear();
  }
  speech(now) {
    if (!this.source) {
      this.sample = null;
      return null;
    }
    const sample = this.source.sample(now);
    this.sample = sample;
    return { articulation: this.damping.step(mapSpeechToRig(sample), sample, now), speaking: sample.speaking, gesture: sample.gesture, talking: sample.talking };
  }
  /**
   * The kept frame's effects (docs/animate.md "Effects"), about the eyes' midpoint at actingScale × EFFECT_SCALE px an
   * effect unit, riding the head and faded by a hold's blend: the bursts, and each shade before the layer its band ends
   * at (face.json's head; none without one). Nothing without a library, with nothing playing, or at rest.
   */
  writeEffects(rig, kept) {
    const lib = this.animation;
    const states = kept.frame.effects;
    if (!lib || !states.length || !(kept.blend > 0)) return rig.write(null, []);
    const head = headAffine(this.rig, kept.frame, kept.blend);
    const origin2 = effectOrigin(this.rig.anchors);
    const unit2 = (this.rig.actingScale > 0 ? this.rig.actingScale : 1) * EFFECT_SCALE;
    const spec = this.face.head;
    const bursts = [];
    const shades = /* @__PURE__ */ new Map();
    for (const s of states) {
      const def = effectOf(lib, s.id);
      if (s.kind === "burst" && def?.burst) {
        const drawing = burstDrawing(def.burst, (id) => glyphOf(lib, id), s.age, s.strength, origin2, unit2);
        if (drawing) bursts.push({ id: s.id, drawing });
      } else if (s.kind === "shade" && def?.shade && spec && def.shade.over in spec.after) {
        const before = spec.after[def.shade.over] ?? null;
        const list = shades.get(before) ?? [];
        list.push({ id: s.id, level: s.level, drawing: this.shadeDrawing(def.shade, origin2, unit2) });
        shades.set(before, list);
      }
    }
    const box = this.boxOf(spec);
    const placed = [];
    if (spec && box) {
      for (const [before, list] of shades) {
        const node = shadesNode(list, spec.face, box, head, kept.blend, `${this.options.prefix}fx-${idPart(before ?? "end")}-`);
        if (node) placed.push({ before, node });
      }
    }
    rig.write(burstsNode(bursts, head, kept.blend), placed);
  }
  shadeDrawing(def, origin2, unit2) {
    const at = `${origin2[0]} ${origin2[1]} ${unit2}`;
    const had = this.shadeDrawings.get(def);
    if (had?.at === at) return had.drawing;
    const drawing = shadeDrawing(def, origin2, unit2);
    this.shadeDrawings.set(def, { at, drawing });
    return drawing;
  }
  /** The face's box (its skin's bounds, a pixel out), or null. */
  boxOf(head) {
    if (!this.faceBox || this.faceBox.head !== head) {
      let box = null;
      for (const d of head?.face ?? []) box = unionBox(box, pathBounds(d));
      this.faceBox = { head, box: box ? [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1] : null };
    }
    return this.faceBox.box;
  }
  writeMouth(mouth, frame, acting) {
    const report = this.options.onMouthError;
    if (!report) return mouth.write(this.writer, mouthPose(mouth.spec, frame.articulation, frame.owner, acting, frame.talking));
    if (this.failed === mouth.spec) return;
    let pose;
    try {
      pose = mouthPose(mouth.spec, frame.articulation, frame.owner, acting, frame.talking);
    } catch (e) {
      this.failed = mouth.spec;
      mouth.clear();
      report(e, mouth.spec);
      return;
    }
    mouth.write(this.writer, pose);
  }
};

// src/runtime/look.ts
var SIGMA_PER_WIDTH = 1 / 1.88;
var WIDTH_MAX = 24;
var r3 = (v) => String(Math.round(v * 1e3) / 1e3);
var clamp01 = (v) => Math.min(1, Math.max(0, v));
function lookState(base) {
  const o = base?.outline;
  const v = base?.overlay;
  return {
    ...o?.on !== void 0 ? { on: o.on } : {},
    ...o?.width !== void 0 ? { width: o.width } : {},
    ...o?.color !== void 0 ? { color: o.color } : {},
    sigmaPerWidth: o?.sigmaPerWidth ?? SIGMA_PER_WIDTH,
    ...v?.color !== void 0 ? { overlayColor: v.color } : {},
    ...v?.back !== void 0 ? { back: v.back } : {},
    layers: {},
    touched: { outline: false, width: false, color: false, overlayColor: false, back: false }
  };
}
function nextLook(state, look) {
  const s = { ...state, layers: { ...state.layers }, touched: { ...state.touched } };
  const o = look.outline;
  if (typeof o === "boolean") {
    s.on = o;
    s.touched.outline = true;
  } else if (o) {
    if (o.on !== void 0) {
      s.on = o.on;
      s.touched.outline = true;
    }
    if (o.width !== void 0 && Number.isFinite(o.width)) {
      s.width = Math.min(WIDTH_MAX, Math.max(0, o.width));
      s.touched.width = s.touched.outline = true;
    }
    if (o.color !== void 0) {
      s.color = o.color;
      s.touched.color = true;
    }
  }
  const v = look.overlay;
  if (v?.color !== void 0) {
    s.overlayColor = v.color;
    s.touched.overlayColor = true;
  }
  if (v?.back !== void 0 && Number.isFinite(v.back)) {
    s.back = clamp01(v.back);
    s.touched.back = true;
  }
  for (const [layer, value] of Object.entries(v?.layers ?? {})) if (Number.isFinite(value)) s.layers[layer] = clamp01(value);
  return s;
}
function lookWrites(s) {
  const out = { layers: Object.entries(s.layers).map(([k, v]) => [k, r3(v)]) };
  if (s.touched.outline) out.filter = (s.on ?? true) && (s.width ?? 1) >= 0.5;
  if (s.touched.width && s.width !== void 0) out.stdDeviation = r3(s.width * s.sigmaPerWidth);
  if (s.touched.color && s.color !== void 0) out.flood = s.color;
  if (s.touched.overlayColor && s.overlayColor !== void 0) out.overlayColor = s.overlayColor;
  if (s.touched.back && s.back !== void 0) out.back = r3(s.back);
  return out;
}
function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
var has = (name) => (el) => el.hasAttribute(name);
function applyLook(svg, w) {
  const all = Array.from(svg.getElementsByTagName("*"));
  if (w.filter !== void 0) {
    const id = all.find(has("data-cr-outline-filter"))?.getAttribute("id");
    for (const el of all.filter(has("data-cr-outline"))) {
      if (w.filter && id) setAttr(el, "filter", `url(#${id})`);
      else if (!w.filter && el.hasAttribute("filter")) el.removeAttribute("filter");
    }
  }
  if (w.stdDeviation !== void 0) for (const el of all.filter(has("data-cr-outline-blur"))) setAttr(el, "stdDeviation", w.stdDeviation);
  if (w.flood !== void 0) for (const el of all.filter(has("data-cr-outline-flood"))) setAttr(el, "flood-color", w.flood);
  const twins = all.filter(has("data-overlay"));
  if (w.overlayColor !== void 0) for (const el of twins) setAttr(el, "color", w.overlayColor);
  if (w.back !== void 0) {
    for (const el of twins) if (el.getAttribute("data-overlay") === "back") setAttr(el, "opacity", w.back);
  }
  for (const [layer, value] of w.layers) {
    const groups = all.filter((el) => el.getAttribute("data-cr-key") === layer || el.getAttribute("data-rig-layer") === layer || el.getAttribute("data-rig-feature") === layer);
    for (const g of groups) for (const el of Array.from(g.getElementsByTagName("*"))) if (el.hasAttribute("data-overlay")) setAttr(el, "opacity", value);
  }
}

// src/runtime/player.ts
var clampMotion = (v) => Math.max(0, Math.min(1.5, Number.isFinite(v) ? v : 1));
var nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
function playerOf(svg, rig, face, options = {}, onDestroy) {
  const library = options.animation ?? BUILTIN_ANIMATION;
  const animator = new Animator(svg, rig, face, { prefix: options.idPrefix ?? mountPrefix(), animation: library });
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const expressions = Object.freeze(library.expressions.slice());
  const reactions = Object.freeze(library.reactions.slice());
  let look = lookState(options.look);
  let motion = clampMotion(options.motion ?? 1);
  let expression = expressionOf(library, options.expression).id;
  let held = false;
  let request = 0;
  let running = false;
  let destroyed = false;
  let reaction = null;
  let triggers = 0;
  let pending = null;
  const reduced = () => options.reducedMotion ?? media?.matches ?? false;
  const settle = () => {
    const resolve = pending;
    pending = null;
    resolve?.();
  };
  const draw = (now) => {
    animator.draw(now, { hold: held, motion, reduced: reduced(), expression, reaction });
    if (!reaction) return;
    const shown = animator.frame?.frame.reaction ?? null;
    if (shown?.id !== reaction.id) {
      reaction = null;
      settle();
    }
  };
  const loop = (now) => {
    if (!running) return;
    request = requestAnimationFrame(loop);
    try {
      draw(now);
    } catch (e) {
      player.stop();
      throw e;
    }
  };
  const player = {
    svg,
    get running() {
      return running;
    },
    start() {
      if (running || destroyed || typeof requestAnimationFrame !== "function") return;
      running = true;
      animator.restart();
      request = requestAnimationFrame(loop);
    },
    stop() {
      if (running) cancelAnimationFrame(request);
      running = false;
      reaction = null;
      settle();
      animator.restart();
      animator.clear();
    },
    destroy() {
      if (destroyed) return;
      player.stop();
      destroyed = true;
      animator.setSpeech(null);
      animator.rebind();
      onDestroy?.();
    },
    hold(on) {
      held = !!on;
    },
    setMotion(amount) {
      motion = clampMotion(amount);
    },
    setSpeech(next) {
      animator.setSpeech(next);
    },
    setLook(next) {
      look = nextLook(look, next);
      applyLook(svg, lookWrites(look));
    },
    rebind() {
      animator.rebind();
    },
    tick(at) {
      if (!destroyed) draw(at ?? nowMs());
    },
    expressions,
    reactions,
    get expression() {
      return expression;
    },
    setExpression(id) {
      expression = expressionOf(library, id).id;
    },
    react(id) {
      if (destroyed) return Promise.resolve();
      if (!reactionOf(library, id)) {
        const known = library.reactions.map((r) => r.id).join(", ");
        return Promise.reject(new Error(`No reaction "${id}" in this avatar (${known ? `it has ${known}` : "it has none: its bundle has no animation.json"}).`));
      }
      settle();
      triggers += 1;
      reaction = { id, trigger: triggers };
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
    // realtime-context-standard-demo: with no reaction asked for, the one under way eases out (REACTION_CANCEL_SECONDS).
    endReaction() {
      reaction = null;
      settle();
    },
    get frame() {
      const kept = animator.frame;
      if (!kept) return null;
      const { pose, reaction: shown, effects } = kept.frame;
      return { pose: { ...pose }, reaction: shown ? { ...shown } : null, effects: effects.map((e) => ({ ...e })) };
    }
  };
  return player;
}
function createPlayer(svg, rig, face, options = {}) {
  return playerOf(svg, rig, face, options);
}

// src/runtime/mount.ts
function scopeSvgIds(svg, prefix) {
  const all = [svg, ...descendants(svg)];
  const ids = scopedIds(all.map((el) => el.getAttribute("id") ?? ""), prefix);
  if (!ids.size) return;
  for (const el of all) {
    for (const name of el.getAttributeNames()) {
      const value = el.getAttribute(name) ?? "";
      const next = rewriteAttribute(name, value, ids);
      if (next !== value) el.setAttribute(name, next);
    }
    if (el.localName === "style" && el.textContent) el.textContent = rewriteUrls(el.textContent, ids);
  }
}
function viewBoxOf(svg) {
  const v = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  return v.length === 4 && v.every(Number.isFinite) && v[2] > 0 && v[3] > 0 ? v : null;
}
var UNDRAWN = /* @__PURE__ */ new Set(["defs", "title", "desc", "metadata", "style"]);
function clipSvg(svg, prefix, mode) {
  const vb = viewBoxOf(svg);
  if (mode === "none" || !vb) return;
  const [x, y, w, h] = vb;
  const box = mode === "canvas" ? [x, y, w, h] : [x - w, y - h, 3 * w, 2 * h];
  const doc = svg.ownerDocument;
  const id = `${prefix}mount-clip`;
  const defs = doc.createElementNS(SVG_NS, "defs");
  const clip = doc.createElementNS(SVG_NS, "clipPath");
  clip.setAttribute("id", id);
  clip.setAttribute("clipPathUnits", "userSpaceOnUse");
  const rect = doc.createElementNS(SVG_NS, "rect");
  ["x", "y", "width", "height"].forEach((k, i) => rect.setAttribute(k, String(box[i])));
  clip.appendChild(rect);
  defs.appendChild(clip);
  const group = doc.createElementNS(SVG_NS, "g");
  group.setAttribute("data-cr-mount-clip", mode);
  group.setAttribute("clip-path", `url(#${id})`);
  for (const child of Array.from(svg.children)) if (!UNDRAWN.has(child.localName)) group.appendChild(child);
  svg.insertBefore(defs, svg.firstChild);
  svg.appendChild(group);
}
function inlineSvg(doc, text2, prefix, clip) {
  const parsed2 = new DOMParser().parseFromString(text2, "image/svg+xml");
  const root = parsed2.documentElement;
  if (parsed2.getElementsByTagName("parsererror").length || root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
    throw new Error("character.svg is not an SVG the runtime can read.");
  }
  const svg = doc.importNode(root, true);
  for (const title of Array.from(svg.getElementsByTagName("title"))) title.remove();
  scopeSvgIds(svg, prefix);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("style", "display: block; overflow: visible");
  clipSvg(svg, prefix, clip);
  return svg;
}
function mountAvatar(element, avatar, options = {}) {
  const { clip = "bottom", outline = true, ...rest3 } = options;
  const prefix = mountPrefix();
  const svg = inlineSvg(element.ownerDocument, avatar.svg, prefix, clip);
  element.appendChild(svg);
  const player = playerOf(svg, avatar.rig, avatar.face.rig, {
    ...rest3,
    idPrefix: prefix,
    ...avatar.rig.look ? { look: avatar.rig.look } : {},
    ...avatar.animation ? { animation: avatar.animation } : {}
  }, () => svg.remove());
  if (!outline) player.setLook({ outline: false });
  return player;
}
export {
  createLipsync,
  createPlayer,
  loadAvatar,
  mountAvatar,
  parseRecording,
  recordingSource
};
