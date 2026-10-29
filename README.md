# Realtime Context Standard Demo

A customer service voice agent for Northwind Outfitters, an outdoor gear shop,
built with [Pipecat](https://pipecat.ai). It looks up orders, changes an order's
shipping address or speed, cancels orders that haven't shipped, and hangs up when the
customer is done.

- `server/`: the bot.
- `client/`: the web client.

## Server

```
Deepgram Flux (STT) → avatar listener → Tone reader → PhoneLLM Mini on Baseten (LLM)
    → Tone tagger → ElevenLabs v4 Text-to-Dialogue (TTS) → phone timer → avatar director
    → lipsync
```

- **Avatar listener** (`server/avatar/listener.py`) has the avatar listen as the user
  talks. It nods along at the user's pauses, from their audio alone: the likelier the
  longer they've talked, never closer than about two seconds apart. With
  `TYPESAFE_API_KEY`, Jev also reads the user's newest words from Flux's interim
  transcript as each phrase ends, at most every second and a half, for a reaction
  (shocked, a laugh, a sympathetic shake of the head) and the face Sam listens with. A
  reading that comes back after the user has said much more is dropped, a reaction
  replaces the nod it lands with, and each plays once a turn.
- **Tone reader** reads each user turn, with the bot's line before it, for emotion and
  sarcasm. The LLM gets the reading with the user's message.
- **Tone tagger** voices each sentence the LLM writes with the TTS's tags, breaths
  included.
- **Phone timer** (`server/avatar/phones.py`) looks up the phones of each word the TTS
  speaks (CMUdict, from `lipsync/`) and places them through the word's time, for the
  avatar's lips: where they meet, round and spread.
- **Avatar director** (`server/avatar/`) has [Jev](https://docs.typesafe.ai) read each
  sentence Sam is about to speak, with the reply before it and the customer's last
  message, and pick the client avatar's expression and gesture for it. A laugh or sigh
  the tagger wrote is its own gesture. Without `TYPESAFE_API_KEY` it's left out.
- **Lipsync** (`server/lipsync/`, from pipecat-visemes) reads the TTS audio for the
  avatar's mouth shapes, and sends them ahead of the audio's playout.
- **Tools** (`server/tools.py`) run against an in-memory order store seeded with three
  orders: `51077` (processing), `48213` (shipped) and `39560` (delivered). Any name
  that isn't one of theirs gets `51077`, so a demo always has an order to work with.

### Start options

Set at session start, in the `/start` request's `body`:

```json
{ "transport": "webrtc", "body": { "tts": "cartesia", "use_tagger": "false" } }
```

| Option                | Values                                | Effect                                                                                                                     |
| --------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tts`                 | `"elevenlabs"` (default), `"cartesia"` | ElevenLabs v4 Text-to-Dialogue, or Cartesia. Breaths only with ElevenLabs.                                                  |
| `use_tagger`          | `"true"` (default), `"false"`          | `"false"` drops the tagger and swaps PhoneLLM Mini for GPT-5.6 Luna, which writes the tags itself from the TTS's tag spec. |
| `detect_backchannels` | `"false"` (default), `"true"`          | `"true"` keeps Sam talking through the user's backchannels ("mm-hmm"), which the transcript shows in grey. See `server/backchannel/`. |

The Tone reader runs either way.

Pipecat Tone's rc1 models come from
[pipecat-ai/pipecat#6407](https://github.com/pipecat-ai/pipecat/pull/6407), and
[pipecat-ai/pipecat#6418](https://github.com/pipecat-ai/pipecat/pull/6418) sends the
reader's perception to the client in RTVI `user-input`. Both are merged but not yet
released, so `server/pyproject.toml` installs Pipecat from `main` until they are.

### Run locally

```sh
cd server
cp env.example .env   # fill in the keys below
uv sync
uv run bot.py
```

Open http://localhost:7860/client. The first session downloads the Tone models from
Hugging Face before the pipeline starts.

Server env, in `server/.env` (from `server/env.example`):

| Variable                | For                                                    |
| ----------------------- | ------------------------------------------------------ |
| `DEEPGRAM_API_KEY`      | Flux speech-to-text                                    |
| `PHONELLM_MINI_URL`     | `use_tagger` true: Baseten deployment's `/sync/v1` URL |
| `PHONELLM_MINI_API_KEY` | `use_tagger` true: Baseten API key                     |
| `OPENAI_API_KEY`        | `use_tagger` false: GPT-5.6 Luna                       |
| `ELEVENLABS_API_KEY`    | `tts` elevenlabs                                       |
| `ELEVENLABS_VOICE_ID`   | `tts` elevenlabs, optional: defaults to River          |
| `CARTESIA_API_KEY`      | `tts` cartesia                                         |
| `CARTESIA_VOICE_ID`     | `tts` cartesia, optional: defaults to an Emotive voice |
| `HF_TOKEN`              | Optional: Hugging Face downloads. `detect_backchannels` true: read access to `pipecat-ai`, whose model is private for now, unless `hf auth login` has it |
| `TYPESAFE_API_KEY`      | Optional: Jev, for the avatar's expressions and gestures |

### Evals

`server/evals/` holds [Pipecat evals](https://docs.pipecat.ai/pipecat/evals/overview):
scripted conversations in `scenarios/support_call.yaml` (look up a shipped order and
decline changing it, confirm before cancelling, hang up on goodbye), run against both
`use_tagger` paths by `manifest.yaml`. They run in text mode, so they test the LLM's
tool calls and policy, not speech, and an OpenAI model (`OPENAI_API_KEY`) judges them.

```sh
cd server
uv run pipecat eval suite evals/manifest.yaml
```

The suite starts a fresh bot for each run, and writes logs and `results.jsonl` to
`server/evals/eval-runs/`.

### Deploy to Pipecat Cloud

Deploys to the `daily-demos` organization as `realtime-context-standard-demo` on an
`agent-2x` profile with Krisp VIVA on, built in the cloud from `server/Dockerfile`.
It needs Pipecat and the clients published first: the image can't install Pipecat from
a git branch.

```sh
cd server
cp pcc-deploy.example.toml pcc-deploy.toml
pipecat cloud secrets set realtime-context-standard-demo-secrets --file .env --organization daily-demos
pipecat cloud deploy --organization daily-demos
pipecat cloud organizations keys create --organization daily-demos   # pk_... for the client
```

## Client

Vite + React, built on the unreleased RTVI 2.3.0 Pipecat clients (vendored in
`client/vendor/` by `client/scripts/vendor-pipecat.sh`). The stage shows Sam as an
avatar on the ambient background; the side panel shows the transcript, tool calls
and latency.

The avatar is Momo, exported from Pipecat Character Studio: her data files are in
`client/public/avatar/` and the runtime that plays them in `client/src/avatar-runtime/`,
with one addition, `client/scripts/avatar-runtime.patch`, that lets speech move more
than her mouth. `client/scripts/use-avatar.sh <export folder>` copies in a newer export
and applies it. Her mouth is shaped by `client/src/lib/mouth-shaper.ts` from the bot's
lipsync batches and phones: it opens with the voice's loudness in a speaking range, its
lips meet, round and spread where the phones say, timed against the analysis's closures,
they draw in and purse a little while she talks, and every control is smoothed around
the moment shown. `client/src/lib/speech-gesture.ts` moves the rest of her face with it:
her head dips into the syllables that stand out by loudness and pitch, her brows lift
with the high ones, her head tilts a little differently each phrase, she blinks as a
phrase starts after a pause, and her expression's smile eases while she talks.
`client/src/lib/lipsync-aligner.ts` keeps it all on the voice as it's heard: it matches
the batches' energy against the bot's audio as it plays, and delays the face by the lag
between them. Each line's expression and gesture, from the avatar director, plays as the
line is heard. While the user talks, `client/src/lib/listening.ts` has her listen: she
turns to them, a little tilted and leaning in with her eyes on theirs, and plays the
avatar listener's nods, reactions and faces as they arrive.

Under each user line are the Tone reader's emotion and sarcasm; under
each bot line, the line as it was voiced, rebuilt from `bot-output`'s delivery and
the sounds and pauses performed. With the backchannel detector on, what the user
said while Sam talked through it shows in a grey, dashed bubble labelled
"backchannel".

```sh
cd client
cp env.example .env.local   # BOT_START_URL defaults to the local runner
pnpm install
pnpm dev
```

The browser only calls `/api/start` (`client/server/bot-api.ts`, served by Vite in
dev and by the Vercel functions in `client/api/` in production), which holds the
Pipecat Cloud key and forwards only the `tts`, `use_tagger` and `detect_backchannels`
options.

Client env, in `client/.env.local` (from `client/env.example`), or the Vercel
project's environment in production:

| Variable                   | For                                                                              |
| -------------------------- | -------------------------------------------------------------------------------- |
| `VITE_BOT_TRANSPORT`       | `webrtc` (default) or `daily`; read by the browser and `/api/start`             |
| `BOT_START_URL`            | The local runner (default) or `https://api.pipecat.daily.co/v1/public/realtime-context-standard-demo/start` |
| `BOT_START_PUBLIC_API_KEY` | With Pipecat Cloud: the `pk_...` key. Server only, never `VITE_`-prefixed        |
