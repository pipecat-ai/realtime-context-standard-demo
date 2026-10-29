// The avatar runtime's React binding: the character as a component, driven through a Zustand store. It needs react (18
// or later) and zustand (4.5 or later) in the app, and imports avatar-runtime.js from beside it.
//
//   import { Avatar, createAvatarStore } from "./avatar-runtime/avatar-react.js";
//   export const useMomo = createAvatarStore({ src: "/avatar/" });
//   <Avatar store={useMomo} style={{ width: 420 }} />
//   const expression = useMomo((s) => s.expression);
//   useMomo.getState().setExpression("happy");
//   await useMomo.getState().react("laugh");
//
// Written by hand; the creator checks it against the code (src/runtime/react/public.typetest.ts).
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import type {
  AvatarClip, AvatarPlayer, ExpressionDef, LipsyncCallbacks, ReactionDef, SpeechRecording, SpeechSource,
} from "./avatar-runtime.js";

/** Where the bundle is: not asked for yet, on its way, loaded, or failed (`error` says why). */
export type AvatarStatus = "idle" | "loading" | "ready" | "error";

export interface AvatarState {
  /** The bundle's folder: character.svg, rig.json, face.json and animation.json. */
  readonly src: string;
  status: AvatarStatus;
  error: string | null;
  /** The canvas's size, once loaded: the box <Avatar> keeps the ratio of. */
  canvas: { width: number; height: number } | null;
  /** The player of the mounted <Avatar>, or null while none shows this store. */
  player: AvatarPlayer | null;
  /** The expressions it can hold, neutral first, and the reactions it can play (empty until loaded). */
  expressions: readonly ExpressionDef[];
  reactions: readonly ReactionDef[];
  /** The expression it holds (kept across mounts). */
  expression: string;
  /** The reaction under way, or null. */
  reaction: string | null;
  /** Where speech comes from, or null (kept across mounts). */
  speech: SpeechSource | null;
  outline: boolean;
  /** Idle motion, 0–1.5. */
  motion: number;
  /** Eyes open, glance centred and idle at rest (speech keeps the mouth). */
  held: boolean;
  /** Fetch the bundle (once; an <Avatar> mounting asks for it too). */
  load(): Promise<void>;
  /** Hold an expression: the face springs to it. An id the bundle lacks plays neutral. */
  setExpression(id: string): void;
  /** Play a reaction over the expression. Resolves when it ends or another replaces it; rejects while nothing is mounted
   * or for an id `reactions` lacks. */
  react(id: string): Promise<void>;
  setSpeech(source: SpeechSource | null): void;
  /** Play a recorded clip: `audio` plays its sound, `lipsync` is its `<name>.lipsync.json` (a URL or the parsed JSON).
   * Call it inside the click that asks for it, so the browser lets the audio play. */
  playClip(audio: HTMLAudioElement, lipsync: string | URL | SpeechRecording): Promise<void>;
  /** Speech from a live pipecat-visemes bot: the PipecatClient callbacks to pass, yours merged in (a callback both have
   * runs both, the lipsync's first). */
  lipsync<C extends object = Record<never, never>>(callbacks?: C): C & LipsyncCallbacks;
  setOutline(on: boolean): void;
  setMotion(amount: number): void;
  hold(on: boolean): void;
}

/** A character's store: a Zustand hook (`useMomo((s) => s.expression)`) with getState, setState and subscribe. */
export type AvatarStore = UseBoundStore<StoreApi<AvatarState>>;

export interface AvatarStoreOptions {
  /** The bundle's folder ("/avatar/" by default), relative to the page. */
  src?: string | URL;
  /** The expression it starts in ("neutral" by default). */
  expression?: string;
  outline?: boolean;
  motion?: number;
  /** The fetch loadAvatar and playClip use. */
  fetch?: typeof fetch;
}

/** A store for one character; it loads nothing until an <Avatar> mounts it or load() is called. */
export declare function createAvatarStore(options?: AvatarStoreOptions): AvatarStore;

export interface AvatarProps {
  /** The character's store (createAvatarStore). One <Avatar> shows a store at a time. */
  store: AvatarStore;
  /** Where the character is cut: "bottom" (default: hair and hats may pass the top and sides), "canvas" or "none". */
  clip?: AvatarClip;
  /** Reduced motion on or off; by default the page's prefers-reduced-motion. */
  reducedMotion?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Shown until the character is mounted (while it loads, and if it fails). */
  fallback?: ReactNode;
}

/** Mounts the store's character in a box that keeps the canvas's aspect ratio unless `style` sets both sides, starts
 * it and gives the store its player; unmounting destroys it. */
export declare function Avatar(props: AvatarProps): ReactElement;
