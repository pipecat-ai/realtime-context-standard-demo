# Real-time Context Standard Demo

The [Real-time Context Standard](https://docs.pipecat.ai/api-reference/standards/real-time-context-standard)
(RCS) is an open standard for the context voice agent models pass each other beyond
the words. A voice agent is a chain of models: speech-to-text transcribes the user, an
LLM writes a reply, and text-to-speech speaks it. Between them they pass text, so how
the user sounded and how the reply should be said are lost along the way. RCS carries
that context in the same text stream, in formats any model in the chain can produce
and read.

This demo is a voice agent built on RCS Alpha with Pipecat's
[expressive conversation](https://docs.pipecat.ai/pipecat/features/expressive-conversation):

- **Perception.** Pipecat Tone's reader hears how each customer turn was meant: their
  emotion, and whether they're sarcastic. The LLM reads it at the head of their
  message, such as `([emotion angry=0.81, neutral=0.12],[sarcasm value=0.04]) Where's my order?`.
- **Expression.** Pipecat Tone's tagger marks up each sentence of the reply with its
  delivery, sounds, pauses and stressed words, and the TTS performs them:
  `<<sympathetic>> I'm so sorry about the wait.` With `use_tagger` off, the LLM writes
  the tags itself.
- **The client.** Both reach the browser over RTVI 2.3.0: the transcript shows the
  reading under each customer line, and each bot line as it was voiced.

The agent does customer service for Northwind Outfitters, an outdoor gear shop, and is
built with [Pipecat](https://pipecat.ai). It looks up orders, changes an order's
shipping address or speed, cancels orders that haven't shipped, and hangs up when the
customer is done.

- `server/`: the bot.
- `client/`: the web client.

## Server

```
Deepgram Flux (STT) → Tone reader → avatar listener → PhoneLLM Mini on Baseten (LLM)
    → Tone tagger → ElevenLabs v4 Text-to-Dialogue (TTS) → phone timer → avatar director
    → lipsync
```

- **Tone reader** reads each user turn, with the bot's line before it, for emotion and
  sarcasm. The LLM gets the reading with the user's message.
- **Avatar listener** (`server/avatar/listener.py`) has the avatar listen as the user
  talks. It nods along at the user's pauses, from their audio alone: the likelier the
  longer they've talked, never closer than about two seconds apart. With
  `TYPESAFE_API_KEY`, Jev also reads the user's newest words from Flux's interim
  transcript as each phrase ends, at most every second and a half, for a reaction
  (shocked, a laugh, a sympathetic shake of the head) and the face Sam listens with. A
  reading that comes back after the user has said much more is dropped, a reaction
  replaces the nod it lands with, and each plays once a turn. A turn the Tone reader
  reads as angry takes Sam aback as it ends: she looks shocked until she answers.
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
| `detect_backchannels` | `"true"` (default), `"false"`          | `"true"` keeps Sam talking through the user's backchannels ("mm-hmm"), which the transcript shows in grey; `"false"` lets them interrupt her. See `server/backchannel/`. |
| `demo`                | `"false"` (default), `"true"`          | `"true"` has a scripted caller talk to Sam in place of the mic. See `server/demo.py`. |

The Tone reader runs either way.

### Run locally

```sh
cd server
cp env.example .env   # fill in the keys below
uv sync
uv run bot.py
```

Open http://localhost:7860/client. The first session downloads the Tone models and
the backchannel model from Hugging Face before the pipeline starts. Their repos are
public, so no token is needed.

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
| `HF_TOKEN`              | Optional: the models are public; a token only raises Hugging Face's rate limits |
| `TYPESAFE_API_KEY`      | Optional: Jev, for the avatar's expressions and gestures |
| `DEMO_CALLER_VOICE_ID`  | `demo`, optional: the caller's ElevenLabs voice, defaults to Chris |

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

```sh
cd server
cp pcc-deploy.example.toml pcc-deploy.toml
pipecat cloud secrets set realtime-context-standard-demo-secrets --file .env --organization daily-demos
pipecat cloud deploy --organization daily-demos
pipecat cloud organizations keys create --organization daily-demos   # pk_... for the client
```

## Client

Vite + React, built on the RTVI 2.3.0 Pipecat clients. The stage shows Sam as an
avatar on the ambient background; the side panel shows the transcript, tool calls
and latency.

The avatar uses:

- Avatar from Pipecat Character Studio (coming soon!)
- Lipsync via [Pipecat Visemes](https://github.com/jptaylor/pipecat-visemes)
- Expressions, gestures and listening reactions via [Jev](https://docs.typesafe.ai)

On landing, a dialog picks the call's mode: LLM mode (GPT-5.6 Luna writes the tags,
for Cartesia) or tagger mode (PhoneLLM Mini and the Tone tagger, for ElevenLabs). The
settings button changes it, and the backchannel detector, between calls.

`?demo` runs a demo call in tagger mode: a scripted caller, voiced by ElevenLabs, talks
to Sam through a typical call, with a range of feelings, tool calls and backchannels.
It starts on its own where the browser allows audio without a tap, and otherwise on
the call button.

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
Pipecat Cloud key and forwards only the `tts`, `use_tagger`, `detect_backchannels` and
`demo` options.

Client env, in `client/.env.local` (from `client/env.example`), or the Vercel
project's environment in production:

| Variable                   | For                                                                              |
| -------------------------- | -------------------------------------------------------------------------------- |
| `VITE_BOT_TRANSPORT`       | `webrtc` (default) or `daily`; read by the browser and `/api/start`             |
| `BOT_START_URL`            | The local runner (default) or `https://api.pipecat.daily.co/v1/public/realtime-context-standard-demo/start` |
| `BOT_START_PUBLIC_API_KEY` | With Pipecat Cloud: the `pk_...` key. Server only, never `VITE_`-prefixed        |
