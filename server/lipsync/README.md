# lipsync

Server-side lipsync from [pipecat-visemes](https://github.com/jptaylor/pipecat-visemes):
`LipsyncProcessor` reads the TTS audio for mouth shapes, and `LipsyncMessageRelay` sends
them to the client as RTVI `server-message`s of type `bot-tts-lipsync`, where the avatar
speaks with them (`client/src/stores/avatar-store.ts`).

Copied unchanged from pipecat-visemes' `server/lipsync/` at commit
`98843fd864b80f03870ea300bbf1e8ac32608144` (BSD 2-Clause, Copyright (c) 2026, Daily),
including its packed CMU dictionary in `data/`. To update it, copy the folder again. It's
left out of pyright (`pyproject.toml`), which pipecat-visemes doesn't run; its own tests pass
on this bot's Pipecat.

## Tuning for Sam's voice

Measured on ElevenLabs River, the bot's voice, against the TTS's character timings:

- The analyzer's keyframes sit within 5 ms of the audio, so it runs with its defaults.
- Drawn as the avatar runtime maps them, they make a flappy, gaping mouth: openness swings
  from shut to wide open at every syllable (mean 60 local px on Momo's 175 px mouth), the
  second formant rounds the lips as much on "m", "n" and "l" as on "oo", and openness holds
  through pauses. So the client shapes the mouth itself (`client/src/lib/mouth-shaper.ts`):
  loudness opens it in a speaking range, the phones of the words, which
  `server/avatar/phones.py` times, say where the lips meet, round and spread, and talking
  draws the lips in and purses them a little. On twelve River lines: lips meet on 91% of
  "m", "b" and "p" (67% before), the open mouth is three-quarters of its rest width (92%),
  "ee" is 26 px wider than "oo" (8), the opening is a mean 29 px (60), and the motion is a
  sixth as rough. The analysis's energy and pitch also move the head, brows and eyes
  (`client/src/lib/speech-gesture.ts`).
- Text events (`LipsyncProcessor(text_events=True)`) would read the words for closures, but
  they give up on a TTS context with more than one sentence, and Pipecat keeps one context
  per reply, so they stay off.
- The voice is heard 100–320 ms after a batch says it plays, and drifts through a reply.
  `client/src/lib/lipsync-aligner.ts` measures that lag against the audio as it plays and
  delays the mouth to match.
