/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "webrtc" (default) or "daily"; see env.example. */
  readonly VITE_BOT_TRANSPORT?: string
}
