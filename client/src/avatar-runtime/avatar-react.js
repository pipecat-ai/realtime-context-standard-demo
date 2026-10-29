// avatar-react 905cc2a74abfa185: the avatar runtime as a React component and a Zustand store (README.md).
// src/runtime/react/Avatar.tsx
import { useEffect, useRef } from "react";
import { mountAvatar } from "./avatar-runtime.js";

// src/runtime/react/store.ts
import { create } from "zustand";
import {
  createLipsync,
  loadAvatar,
  parseRecording,
  recordingSource
} from "./avatar-runtime.js";
var mountings = /* @__PURE__ */ new WeakMap();
function mountingOf(store) {
  const mounting = mountings.get(store);
  if (!mounting) throw new Error("<Avatar> needs a store made by createAvatarStore.");
  return mounting;
}
function mergeCallbacks(first, second) {
  const out = { ...first };
  for (const [name, value] of Object.entries(second)) {
    const before = out[name];
    out[name] = typeof before === "function" && typeof value === "function" ? (...args) => {
      before(...args);
      return value(...args);
    } : value;
  }
  return out;
}
function createAvatarStore(options = {}) {
  const src = String(options.src ?? "/avatar/");
  const fetcher = options.fetch;
  let loading = null;
  let reacting = 0;
  const bundle = () => {
    if (!loading) {
      store.setState({ status: "loading", error: null });
      loading = loadAvatar(src, fetcher ? { fetch: fetcher } : void 0).then(
        (avatar) => {
          const { width, height } = avatar.rig.canvas;
          store.setState({
            status: "ready",
            canvas: { width, height },
            expressions: avatar.animation?.expressions ?? [],
            reactions: avatar.animation?.reactions ?? []
          });
          return avatar;
        },
        (e) => {
          loading = null;
          store.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
          throw e;
        }
      );
    }
    return loading;
  };
  const store = create()((set, get) => ({
    src,
    status: "idle",
    error: null,
    canvas: null,
    player: null,
    expressions: [],
    reactions: [],
    expression: options.expression ?? "neutral",
    reaction: null,
    speech: null,
    outline: options.outline ?? true,
    motion: options.motion ?? 1,
    held: false,
    async load() {
      await bundle();
    },
    setExpression(id) {
      const { player } = get();
      player?.setExpression(id);
      set({ expression: player ? player.expression : id });
    },
    async react(id) {
      const { player } = get();
      if (!player) throw new Error("Nothing is mounted: render <Avatar> with this store first.");
      const token = ++reacting;
      set({ reaction: id });
      try {
        await player.react(id);
      } finally {
        if (token === reacting) set({ reaction: null });
      }
    },
    setSpeech(source) {
      set({ speech: source });
      get().player?.setSpeech(source);
    },
    async playClip(audio, lipsync) {
      const playing = audio.play();
      playing.catch(() => {
      });
      const raw = typeof lipsync === "string" || lipsync instanceof URL ? await (await (fetcher ?? fetch)(String(lipsync))).json() : lipsync;
      get().setSpeech(recordingSource(audio, parseRecording(raw)));
      await playing;
    },
    lipsync(callbacks) {
      const live = createLipsync();
      get().setSpeech(live.source);
      return mergeCallbacks(live.callbacks, callbacks ?? {});
    },
    setOutline(on) {
      set({ outline: on });
      get().player?.setLook({ outline: on });
    },
    setMotion(amount) {
      set({ motion: amount });
      get().player?.setMotion(amount);
    },
    hold(on) {
      set({ held: on });
      get().player?.hold(on);
    }
  }));
  mountings.set(store, {
    bundle,
    attach(player) {
      const { speech, held } = store.getState();
      if (speech) player.setSpeech(speech);
      if (held) player.hold(true);
      player.start();
      store.setState({ player, expression: player.expression, expressions: player.expressions, reactions: player.reactions });
    },
    detach(player) {
      player.destroy();
      if (store.getState().player !== player) return;
      reacting++;
      store.setState({ player: null, reaction: null });
    }
  });
  return store;
}

// src/runtime/react/Avatar.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Avatar({ store, clip = "bottom", reducedMotion, className, style, fallback = null }) {
  const host = useRef(null);
  const mounted = store((s) => s.player !== null);
  const canvas = store((s) => s.canvas);
  useEffect(() => {
    let gone = false;
    let player = null;
    mountingOf(store).bundle().then(
      (avatar) => {
        if (gone || !host.current) return;
        const { outline, motion, expression } = store.getState();
        player = mountAvatar(host.current, avatar, { clip, outline, motion, expression, ...reducedMotion === void 0 ? {} : { reducedMotion } });
        mountingOf(store).attach(player);
      },
      () => {
      }
      // the store holds the error
    );
    return () => {
      gone = true;
      if (player) mountingOf(store).detach(player);
    };
  }, [store, clip, reducedMotion]);
  return /* @__PURE__ */ jsxs("div", { className, style: { position: "relative", aspectRatio: canvas ? `${canvas.width} / ${canvas.height}` : "1 / 1", ...style }, children: [
    /* @__PURE__ */ jsx("div", { ref: host, style: { position: "absolute", inset: 0 } }),
    mounted ? null : fallback
  ] });
}
export {
  Avatar,
  createAvatarStore
};
