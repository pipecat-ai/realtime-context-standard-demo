# Realtime Context Standard Demo

A customer service voice agent for Northwind Outfitters, an outdoor gear shop,
built with [Pipecat](https://pipecat.ai). It looks up orders, changes an order's
shipping address or speed, cancels orders that haven't shipped, and hangs up when the
customer is done.

- `server/`: the bot.
- `client/`: the web client (to come).

## Server

```
Deepgram Flux (STT) → Tone reader → PhoneLLM Mini on Baseten (LLM)
    → Tone tagger → ElevenLabs v4 Text-to-Dialogue (TTS)
```

- **Tone reader** reads each user turn, with the bot's line before it, for emotion and
  sarcasm. The LLM gets the reading with the user's message.
- **Tone tagger** voices each sentence the LLM writes with the TTS's tags, breaths
  included.
- **Tools** (`server/tools.py`) run against an in-memory order store seeded with three
  orders: `51077` (processing), `48213` (shipped) and `39560` (delivered).

### Start options

Set at session start, in the `/start` request's `body`:

```json
{ "transport": "webrtc", "body": { "tts": "cartesia", "use_tagger": "false" } }
```

| Option       | Values                                | Effect                                                                                                                     |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tts`        | `"elevenlabs"` (default), `"cartesia"` | ElevenLabs v4 Text-to-Dialogue, or Cartesia. Breaths only with ElevenLabs.                                                  |
| `use_tagger` | `"true"` (default), `"false"`          | `"false"` drops the tagger and swaps PhoneLLM Mini for GPT-5.6 Luna, which writes the tags itself from the TTS's tag spec. |

The Tone reader runs either way.

Pipecat Tone's rc1 models come from
[pipecat-ai/pipecat#6407](https://github.com/pipecat-ai/pipecat/pull/6407), so
`server/pyproject.toml` installs Pipecat from that branch until it's released.

### Run locally

```sh
cp env.example .env   # fill in the keys below
cd server
uv sync
uv run bot.py
```

Open http://localhost:7860/client. The first session downloads the Tone models from
Hugging Face before the pipeline starts.

| Variable                | For                                                    |
| ----------------------- | ------------------------------------------------------ |
| `DEEPGRAM_API_KEY`      | Flux speech-to-text                                    |
| `PHONELLM_MINI_URL`     | `use_tagger` true: Baseten deployment's `/sync/v1` URL |
| `PHONELLM_MINI_API_KEY` | `use_tagger` true: Baseten API key                     |
| `OPENAI_API_KEY`        | `use_tagger` false: GPT-5.6 Luna                       |
| `ELEVENLABS_API_KEY`    | `tts` elevenlabs                                       |
| `ELEVENLABS_VOICE_ID`   | `tts` elevenlabs: the voice                            |
| `CARTESIA_API_KEY`      | `tts` cartesia                                         |
| `CARTESIA_VOICE_ID`     | `tts` cartesia, optional: defaults to an Emotive voice |
| `HF_TOKEN`              | Optional: Hugging Face downloads                       |
