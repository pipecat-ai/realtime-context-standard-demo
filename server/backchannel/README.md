# Backchannel detection

With `detect_backchannels` on, Sam keeps talking through "mm-hmm" and "right",
and the client shows them in the transcript as backchannels. It runs
[pipecat-ai/backchannel-detector](https://huggingface.co/pipecat-ai/backchannel-detector),
a streaming audio model that hears, while the bot talks, whether the user is
backchannelling or taking the floor.

`BackchannelFluxSTTService` (`flux.py`) is Deepgram Flux with the model in
front of the turns it starts. While Sam talks, it holds each turn Flux proposes
until the model calls it. A floor-take passes the turn on, and Sam is
interrupted as before. A backchannel never becomes a turn: its transcript goes
on as a `UserBackchannelFrame`, which RTVI sends as `user-input` of type
`backchannel` and the user aggregator keeps out of the LLM context.

`analyzer.py`, `decision.py`, `lexicon.py` and `model.py` are copied unchanged
from pipecat-vap's `pipecat_backchannel/` drop-in (the model's code); copy them
again to update. `model.py` pins the model's revision and checksum.

## Model download

The first session with `detect_backchannels` downloads the model (4 MB) to
`~/.cache/pipecat-backchannel`. The Hugging Face repo is public, so it needs no
token; `HF_TOKEN` is used if set. `BACKCHANNEL_MODEL` can point at a local
`.onnx` instead.

## Removing it

The feature is on unless a session turns it off (`detect_backchannels: "false"`).
To take it out:

- delete `server/backchannel/`;
- `server/bot.py`: `BotOptions.detect_backchannels` and where it's read, and
  the choice of STT class in `run_bot`;
- `client/server/bot-api.ts`: `detect_backchannels` in `SESSION_OPTIONS`;
- `client/src/stores/session-store.ts`, `client/src/lib/session-config.ts`,
  `client/src/App.tsx` and `client/src/components/session-options.tsx`: the
  `detectBackchannels` option and its toggle;
- `client/src/components/transcript.tsx`: `includeBackchannel` and `Backchannel`,
  and `client/src/stores/expression-store.ts`: the `backchannel` check in
  `userInput`;
- `README.md`: the `detect_backchannels` row and notes.

It was added in one commit, so `git revert` of that commit does all of it.
