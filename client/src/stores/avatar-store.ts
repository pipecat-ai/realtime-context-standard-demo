import { createLipsync } from "@/avatar-runtime/avatar-runtime.js"
import { createAvatarStore } from "@/avatar-runtime/avatar-react.js"
import { createLipsyncAligner } from "@/lib/lipsync-aligner"
import { shapedSource } from "@/lib/mouth-shaper"
import { createSpeechTrack } from "@/lib/speech-track"

/**
 * Sam's face: Momo, a Pipecat Character Studio export served from
 * public/avatar/ (scripts/use-avatar.sh). The store keeps her expression and
 * speech across mounts.
 */
export const useAvatarStore = createAvatarStore({ src: "/avatar/" })

/** The utterance playing: the bot's lipsync batches and the phones of its words. */
const speech = createSpeechTrack()

/**
 * Her mouth, kept on the voice as it's heard. Its callbacks go to the
 * PipecatClient: the batches and phones, and the turn events that cut a reply
 * the user talks over.
 */
export const lipsync = createLipsyncAligner(createLipsync(), speech)
useAvatarStore.getState().setSpeech(shapedSource(lipsync.source, speech))
