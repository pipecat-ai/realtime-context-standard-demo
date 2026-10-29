#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Demo mode: a scripted caller talks to Sam, so the demo runs with no one at the mic.

The caller's lines walk through a typical support call that runs the range of
feelings, from nervous to sarcastic, angry, apologetic, surprised and glad, so
the Tone reader, the LLM's replies and the tagger's delivery all have something
to show, along with a tool call for each order. While Sam reads out an order,
the caller now and then says "mm-hmm", which the backchannel detector keeps from
interrupting. ElevenLabs v4 voices each line, performed with its tags, in a male
voice.

``DemoCaller`` goes right after the transport's input, in place of the mic, and
its ``replies`` right after the LLM, where it sees Sam's replies being written. It
feeds the pipeline a steady stream of audio, as a mic would: silence, and each
line as its turn comes, which Flux transcribes like any caller. A line's turn
comes once Sam has answered the last and gone quiet; a backchannel's, once Sam
has been answering for a while and is still talking. The client can't hear the
pipeline's input, so the caller's audio is also sent to it as it plays, in
``demo-caller-audio`` server messages of 16-bit PCM, base64-encoded.
"""

import asyncio
import base64
import os
import time
from dataclasses import dataclass

import aiohttp
import numpy as np
from loguru import logger
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    CancelFrame,
    EndFrame,
    Frame,
    FunctionCallCancelFrame,
    FunctionCallInProgressFrame,
    FunctionCallResultFrame,
    InputAudioRawFrame,
    InterruptionFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    StartFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIServerMessageFrame

AUDIO_MESSAGE_TYPE = "demo-caller-audio"

# Chris, a premade voice every account has: a casual, conversational American man.
CALLER_VOICE = "iP95p4xoKVk53GoZ742B"
CALLER_MODEL = "eleven_v4_turbo"
DIALOGUE_URL = "https://api.elevenlabs.io/v1/text-to-dialogue"

# The mic's cadence, and how much of the caller's audio goes in each message to
# the client.
CHUNK_SECS = 0.02
MESSAGE_SECS = 0.1
# After this long with no sign of Sam, no speech or tool call, Sam's answer is
# given up on, and the next line said anyway.
REPLY_TIMEOUT_SECS = 20.0
# How many lines ElevenLabs voices at once.
RENDERS_AT_ONCE = 3
# A pause in a line longer than MAX_PAUSE_SECS is cut to it: ElevenLabs can
# leave a long one between sentences, which Flux would end the turn at. Quieter
# than SILENCE_DB, in dB of full scale, is a pause.
MAX_PAUSE_SECS = 0.15
SILENCE_DB = -45.0


@dataclass(frozen=True)
class Line:
    """One of the caller's turns."""

    # What the caller says, with the ElevenLabs tags that perform it.
    text: str
    # How long the caller waits after Sam stops before saying it.
    pause: float = 1.0
    # Said over Sam's answer, once Sam has been answering this long and is still
    # talking. Left unsaid if the answer is shorter.
    backchannel: str | None = None
    backchannel_after: float = 2.5


# A caller with a camping trip on Friday: order 48213, a tent, has shipped;
# 39560, boots, was delivered; and 51077, a sleeping bag, is still processing
# (tools.py). Each line reads naturally whatever Sam said before it, so the
# call holds together however the LLM words its replies. The reader reads the
# words, not the voice, so each feeling is in them. Each line is one sentence,
# its only question at the end: Flux can end a turn at any sentence's end.
SCRIPT = [
    Line(
        "Hi, yeah, I'm calling about a tent I ordered, order four eight two one three, can "
        "you tell me where it is?",
        # Flux can leave a hummed "mm-hmm" untranscribed, with nothing to show.
        backchannel="Okay, yeah.",
    ),
    Line(
        "[relieved] Oh, thank goodness, I was honestly so worried it wouldn't make it, we "
        "leave for the mountains on Friday morning.",
        pause=0.8,
    ),
    Line(
        "Actually, since someone's always there to sign for it, could you send it to my "
        "office instead?"
    ),
    Line("[sarcastic] Oh, fantastic, that's just great, love that for me.", pause=1.2),
    Line(
        "[frustrated] Ugh, look, this keeps happening, the boots I got from you last time are "
        "already falling apart, it's order three nine five six oh, can I send them back?",
        backchannel="Right.",
        backchannel_after=1.5,
    ),
    Line(
        "[angry] Seriously, I've already spent twenty minutes on this, and now you're "
        "telling me I have to write an email?",
        pause=0.7,
    ),
    # Brings up another order, or Sam takes the apology as the end of the call,
    # without asking a question Sam might answer by guessing which.
    Line(
        "[sighs] I'm sorry, that's not on you, it's just been a really sad, rough week, and "
        "this trip was the one thing I was looking forward to, so I have one more order to "
        "ask about.",
        pause=1.4,
    ),
    Line(
        "It's five one oh seven seven, a sleeping bag, has that one gone out yet?",
        backchannel="Uh-huh.",
    ),
    Line("[hopeful] Oh, good, I really need it by Friday, so could you speed it up?"),
    Line("[surprised] No way, only fifteen dollars, wow, yes, absolutely, do it!", pause=0.9),
    Line(
        "[laughs] That's amazing, you might have actually just saved this trip, is there "
        "anything else I need to do?",
        pause=1.1,
    ),
    Line("[warmly] Perfect, thanks, Sam, seriously, you've been great, that's everything."),
]


def tighten(audio: bytes, sample_rate: int) -> bytes:
    """Cuts each pause in 16-bit mono PCM to MAX_PAUSE_SECS."""
    step = sample_rate // 100
    samples = np.frombuffer(audio, dtype=np.int16)
    steps = samples[: len(samples) // step * step].reshape(-1, step)
    rms = np.sqrt(np.mean(steps.astype(np.float32) ** 2, axis=1)) / 32768
    quiet = rms < 10 ** (SILENCE_DB / 20)
    kept, run = [], 0
    for chunk, silent in zip(steps, quiet):
        run = run + 1 if silent else 0
        if run * 0.01 <= MAX_PAUSE_SECS:
            kept.append(chunk)
    return np.concatenate(kept).tobytes() if kept else b""


# Each line's audio, by sample rate, voice and text, kept for the process's later
# sessions.
_rendered: dict[tuple[int, str, str], bytes] = {}


async def render(session: aiohttp.ClientSession, text: str, sample_rate: int) -> bytes:
    """Voice a line with ElevenLabs v4 Text-to-Dialogue, as 16-bit mono PCM."""
    voice = os.getenv("DEMO_CALLER_VOICE_ID") or CALLER_VOICE
    key = (sample_rate, voice, text)
    if key not in _rendered:
        async with session.post(
            DIALOGUE_URL,
            params={"output_format": f"pcm_{sample_rate}"},
            headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"]},
            json={"model_id": CALLER_MODEL, "inputs": [{"text": text, "voice_id": voice}]},
        ) as response:
            response.raise_for_status()
            _rendered[key] = tighten(await response.read(), sample_rate)
    return _rendered[key]


class _ReplyWatcher(FrameProcessor):
    """Tells the caller while the LLM writes a reply: before it's heard, or
    between a tool call and what Sam says of it, Sam is quiet but not done.
    """

    def __init__(self, caller: "DemoCaller"):
        super().__init__()
        self._caller = caller

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMFullResponseStartFrame):
            self._caller._sam_writing = True
        elif isinstance(frame, (LLMFullResponseEndFrame, InterruptionFrame)):
            self._caller._sam_writing = False
            self._caller._sam_quiet_at = time.monotonic()
        await self.push_frame(frame, direction)


class DemoCaller(FrameProcessor):
    """Plays the scripted caller into the pipeline, in place of the mic.

    Goes right after the transport's input; the mic's audio is dropped. Its
    ``replies`` goes right after the LLM.
    """

    def __init__(self, script: list[Line] = SCRIPT):
        super().__init__()
        self._script = script
        self._sample_rate = 16000
        self._tasks: list[asyncio.Task] = []
        # The line being said, from where it's got to.
        self._speech = bytearray()
        self._said = asyncio.Event()
        # What Sam is doing: writing a reply, speaking, waiting on tool calls,
        # and whether Sam has answered the caller's last line.
        self._sam_writing = False
        self._sam_speaking = False
        self._sam_answered = False
        self._sam_answered_at = 0.0
        self._sam_quiet_at = 0.0
        self._calls: set[str] = set()
        self.replies = _ReplyWatcher(self)

    @property
    def _sam_busy(self) -> bool:
        return self._sam_writing or self._sam_speaking or bool(self._calls)

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, InputAudioRawFrame):
            return
        if isinstance(frame, BotStartedSpeakingFrame):
            if not self._sam_answered:
                self._sam_answered_at = time.monotonic()
            self._sam_speaking = True
            self._sam_answered = True
        elif isinstance(frame, BotStoppedSpeakingFrame):
            self._sam_speaking = False
            self._sam_quiet_at = time.monotonic()
        elif isinstance(frame, FunctionCallInProgressFrame):
            self._calls.add(frame.tool_call_id)
        elif isinstance(frame, (FunctionCallResultFrame, FunctionCallCancelFrame)):
            # Sam answers with what the tool found.
            self._calls.discard(frame.tool_call_id)
            self._sam_answered = False
        await self.push_frame(frame, direction)

        if isinstance(frame, StartFrame):
            self._sample_rate = frame.audio_in_sample_rate
            self._tasks = [self.create_task(self._feed()), self.create_task(self._call())]
        elif isinstance(frame, (EndFrame, CancelFrame)):
            for task in self._tasks:
                await self.cancel_task(task)
            self._tasks = []

    async def _call(self):
        """Says each line in turn, once Sam has answered the last."""
        limit = asyncio.Semaphore(RENDERS_AT_ONCE)

        async def voiced(text: str | None) -> bytes:
            if not text:
                return b""
            async with limit:
                return await render(session, text, self._sample_rate)

        async with aiohttp.ClientSession() as session:
            # All voiced ahead, in order, while Sam greets the caller.
            audio = [
                (
                    asyncio.ensure_future(voiced(line.text)),
                    asyncio.ensure_future(voiced(line.backchannel)),
                )
                for line in self._script
            ]
            try:
                for n, (line, (voice, backchannel)) in enumerate(zip(self._script, audio), 1):
                    await self._wait_for_sam(line.pause)
                    logger.info(f"Demo caller ({n}/{len(self._script)}): {line.text}")
                    self._sam_answered = False
                    await self._say(await voice)
                    if line.backchannel and await self._sam_still_answering(line.backchannel_after):
                        logger.info(f"Demo caller backchannel: {line.backchannel}")
                        await self._say(await backchannel)
            finally:
                for futures in audio:
                    for future in futures:
                        future.cancel()

    async def _say(self, audio: bytes):
        """Plays audio into the pipeline, and returns once it's been fed."""
        if not audio:
            return
        self._said.clear()
        self._speech = bytearray(audio)
        await self._said.wait()

    async def _wait_for_sam(self, pause: float):
        """Waits for Sam to answer and then be quiet for ``pause`` seconds."""
        started = time.monotonic()
        while time.monotonic() - started < REPLY_TIMEOUT_SECS:
            if self._sam_busy:
                started = time.monotonic()
            elif self._sam_answered and time.monotonic() - self._sam_quiet_at >= pause:
                return
            await asyncio.sleep(0.05)
        logger.warning("Demo caller: no reply from Sam, so saying the next line")

    async def _sam_still_answering(self, after: float) -> bool:
        """Waits for Sam to have been answering for ``after`` seconds.

        False if the answer ends first, or never starts.
        """
        started = time.monotonic()
        while time.monotonic() - started < REPLY_TIMEOUT_SECS:
            if self._sam_answered:
                if self._sam_speaking and time.monotonic() - self._sam_answered_at >= after:
                    return True
                if not self._sam_busy and time.monotonic() - self._sam_quiet_at >= 0.5:
                    return False
            await asyncio.sleep(0.05)
        return False

    async def _feed(self):
        """Feeds the pipeline audio on the mic's cadence: the line being said, or silence."""
        chunk = int(self._sample_rate * CHUNK_SECS) * 2
        message_bytes = int(self._sample_rate * MESSAGE_SECS) * 2
        silence = bytes(chunk)
        outgoing = bytearray()
        due = time.monotonic()
        while True:
            if self._speech:
                audio = bytes(self._speech[:chunk]).ljust(chunk, b"\x00")
                del self._speech[:chunk]
                outgoing += audio
                if len(outgoing) >= message_bytes or not self._speech:
                    await self._send(bytes(outgoing))
                    outgoing.clear()
                if not self._speech:
                    self._said.set()
            else:
                audio = silence
            await self.push_frame(
                InputAudioRawFrame(audio=audio, sample_rate=self._sample_rate, num_channels=1)
            )
            due += CHUNK_SECS
            await asyncio.sleep(max(0.0, due - time.monotonic()))

    async def _send(self, audio: bytes):
        """Sends the client the caller's audio, to play as the pipeline hears it."""
        await self.push_frame(
            RTVIServerMessageFrame(
                data={
                    "type": AUDIO_MESSAGE_TYPE,
                    "audio": base64.b64encode(audio).decode(),
                    "sample_rate": self._sample_rate,
                }
            )
        )
