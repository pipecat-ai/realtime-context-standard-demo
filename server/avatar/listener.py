#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Has the client avatar listen while the customer talks.

A listener's face moves with the speaker: it nods along as they pause after
saying something, and now and then reacts to what they just said. The nods come
from the customer's audio as it arrives, with no model. The reactions come from
Jev, which reads the customer's newest words in Flux's interim transcript, a few
words at a time and about once a second at most; a reading that comes back after
the customer has said much more is dropped, so Sam never reacts to something said
several words back. And when a turn ends that the Tone reader reads as angry, Sam
is taken aback by it, with no model of its own.
"""

import asyncio
import math
import random
import time
from dataclasses import dataclass

import numpy as np
from loguru import logger
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    Frame,
    InputAudioRawFrame,
    InterimTranscriptionFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
)
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIServerMessageFrame
from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy, TypeSafeError

from avatar.cues import last_said, listen_questions, listen_state

LISTEN_MESSAGE_TYPE = "avatar-listen"

# Speech is audio louder than the quiet between words by VOICE_DB, within
# VOICE_RANGE_DB of the voice's recent peak, and over SILENCE_DB: a breath in a
# pause is none of these. It stays speech until it falls HOLD_DB below that.
VOICE_DB = 12.0
VOICE_RANGE_DB = 26.0
SILENCE_DB = -60.0
HOLD_DB = 5.0
# A pause this long after at least PHRASE_SECS of speech since the last nod may
# get one: the likelier and the stronger, the longer the customer has talked,
# up to SURE_SECS. Never two nods closer than NOD_GAP_SECS.
PAUSE_SECS = 0.18
PHRASE_SECS = 1.0
SURE_SECS = 3.5
NOD_GAP_SECS = 2.2
# A nod waits this long to be sent, and for Jev's reading of the phrase that
# just ended, so a reaction to it can take its place: a nod and then a shake of
# the head reads as yes, then no. One kept waiting NOD_LATE_SECS more is too late
# to send. Nor is there one while a reaction plays, about REACTION_SECS.
NOD_HOLD_SECS = 0.4
NOD_LATE_SECS = 0.6
REACTION_SECS = 3.0

# Jev reads as a phrase ends, as a listener takes it in: at a pause, once
# PHRASE_WORDS new words have come (or RUN_ON_WORDS without one), no sooner than
# READ_GAP_SECS after its last reading, and at most MAX_READS a turn; and the
# turn's last words when it ends. The transcript has the phrase's last word
# TRANSCRIPT_LAG_SECS after the pause at the latest. The newest words are those
# since the last reading, at most NEWEST_WORDS of them.
PHRASE_WORDS = 2
RUN_ON_WORDS = 5
READ_GAP_SECS = 1.5
MAX_READS = 10
TRANSCRIPT_LAG_SECS = 0.3
NEWEST_WORDS = 10
# Jev answers in about a tenth of a second; a reading later than this is no use.
READ_TIMEOUT_SECS = 0.8
# A reaction plays only with this much of Jev's probability (a laugh over the
# customer's words most of all: Momo's is a full one), while the customer has
# said at most STALE_WORDS more, REACTION_GAP_SECS after the last one, and each
# once a turn. A face changes with MIN_FACE of it, and holds FACE_HOLD_SECS.
MIN_REACTION = {"shocked": 0.7, "shake": 0.75, "laugh": 0.8}
STALE_WORDS = 6
REACTION_GAP_SECS = 6.0
MIN_FACE = 0.55
FACE_HOLD_SECS = 2.5
# A turn the Tone reader reads as angry, this sure, takes Sam aback as it ends:
# she's shocked until she answers.
ANGRY = 0.8
SARCASTIC = 0.5


@dataclass
class Nod:
    """A nod: how strong (0–1), and whether it's two."""

    strength: float
    double: bool


def _ramp(low: float, high: float, value: float) -> float:
    return min(1.0, max(0.0, (value - low) / (high - low)))


class PauseNods:
    """Finds the pauses in the customer's speech that a listener nods at.

    Hears each chunk of audio as it arrives and measures its loudness against
    the quiet between words, a floor that drops to the quietest moments at once
    and creeps up over seconds, so it follows the room; and against the voice's
    peak, which jumps to the loudest and fades over seconds, so it follows the
    speaker.
    """

    def __init__(self, rng: random.Random | None = None):
        """Initialize the nodder.

        Args:
            rng: The randomness of the nods, for tests.
        """
        self._rng = rng or random.Random()
        self._floor: float | None = None
        self._peak = SILENCE_DB
        self._voiced = False
        self._run_start = 0.0
        self.reset()

    def reset(self):
        """Start a new turn: forget the speech heard, but not the room."""
        self._spoken = 0.0
        self._quiet_since: float | None = None
        self._last_nod = -math.inf
        # When the last pause after speech was heard, nod or not: a phrase's end.
        self.paused_at: float | None = None

    def hear(self, audio: bytes, sample_rate: int, channels: int, now: float) -> Nod | None:
        """Hear a chunk of 16-bit audio that arrived at `now` (seconds); a nod if it ends a pause worth one."""
        samples = np.frombuffer(audio, dtype=np.int16)
        if not samples.size or sample_rate <= 0:
            return None
        seconds = samples.size / (sample_rate * max(1, channels))
        rms = float(np.sqrt(np.mean(np.square(samples / 32768.0))))
        db = 20 * math.log10(rms + 1e-9)
        if self._floor is None:
            self._floor = db
        self._floor += (db - self._floor) * (
            1 - math.exp(-seconds / (0.05 if db < self._floor else 4.0))
        )
        self._peak = (
            db
            if db > self._peak
            else self._peak + (db - self._peak) * (1 - math.exp(-seconds / 3.0))
        )

        speech = max(self._floor + VOICE_DB, self._peak - VOICE_RANGE_DB, SILENCE_DB)
        voiced = db > speech - (HOLD_DB if self._voiced else 0.0)
        if voiced and not self._voiced:
            self._run_start = now
            self._quiet_since = None
        elif self._voiced and not voiced:
            self._spoken += now - self._run_start
            self._quiet_since = now
        self._voiced = voiced

        if self._quiet_since is None or now - self._quiet_since < PAUSE_SECS:
            return None
        # This pause is decided, either way.
        self._quiet_since = None
        self.paused_at = now
        talked = _ramp(PHRASE_SECS, SURE_SECS, self._spoken)
        if self._spoken < PHRASE_SECS or now - self._last_nod < NOD_GAP_SECS:
            return None
        if self._rng.random() > 0.5 + 0.5 * talked:
            return None
        self._spoken = 0.0
        self._last_nod = now
        strength = min(1.0, 0.45 + 0.35 * talked + self._rng.uniform(-0.1, 0.15))
        return Nod(strength, double=talked > 0.5 and self._rng.random() < 0.3)


class AvatarListener(FrameProcessor):
    """Sends the avatar's listening cues while the customer talks.

    Goes after the STT, which passes the customer's audio on with its
    transcripts. Sam listens from the start of the customer's turn (the user
    aggregator broadcasts UserStartedSpeakingFrame back up to here) until Sam
    speaks. Each cue is an RTVI server-message the client plays as it comes: a
    nod (its strength, and whether it's double), or a reaction and a face.
    """

    def __init__(
        self,
        context: LLMContext,
        *,
        read: bool = True,
        rng: random.Random | None = None,
        **kwargs,
    ):
        """Initialize the listener.

        Args:
            context: The conversation, for Sam's last line.
            read: Whether Jev reads the customer's words (it needs TYPESAFE_API_KEY);
                the nods need nothing.
            rng: The randomness of the nods, for tests.
            **kwargs: Additional arguments passed to the parent class.
        """
        super().__init__(**kwargs)
        self._context = context
        self._jev_reads = read
        self._nods = PauseNods(rng)
        self._jev: AsyncTypeSafeClient | None = None
        self._listening = False
        self._turn = 0
        self._words: list[str] = []
        self._read_words = 0
        self._read_at = -math.inf
        self._reads = 0
        self._reading: asyncio.Task | None = None
        self._reacted: set[str] = set()
        self._reacted_at = -math.inf
        self._face = "neutral"
        self._face_at = -math.inf
        # A nod waiting to be sent, and when it's due.
        self._held: tuple[float, Nod] | None = None

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)
        if isinstance(frame, UserStartedSpeakingFrame):
            self._start_turn()
        elif isinstance(frame, BotStartedSpeakingFrame):
            # Sam answers: the director's cues have the face from here.
            self._listening = False
            self._held = None
        elif isinstance(frame, InputAudioRawFrame):
            now = time.monotonic()
            nod = self._nods.hear(frame.audio, frame.sample_rate, frame.num_channels, now)
            if self._listening:
                await self._listen(nod, now)
        elif isinstance(frame, (InterimTranscriptionFrame, TranscriptionFrame)):
            if self._listening:
                self._words = frame.text.split()
                self._maybe_read(final=isinstance(frame, TranscriptionFrame))
                if isinstance(frame, TranscriptionFrame):
                    await self._react_to_reading(frame)

    async def cleanup(self):
        await super().cleanup()
        if self._jev:
            await self._jev.aclose()

    def _start_turn(self):
        self._listening = True
        self._turn += 1
        self._words = []
        self._read_words = 0
        self._reads = 0
        self._reacted = set()
        # The client listens with a plain face (avatar-cue-store.ts).
        self._face = "neutral"
        self._face_at = -math.inf
        self._held = None
        self._nods.reset()

    async def _listen(self, nod: Nod | None, now: float):
        """Hold a new nod, send one that's due, and read a phrase that just ended."""
        if nod and now - self._reacted_at >= REACTION_SECS:
            self._held = (now + NOD_HOLD_SECS, nod)
        reading = self._reading is not None and not self._reading.done()
        if self._held and now >= self._held[0] and not reading:
            due, nod = self._held
            self._held = None
            if now - due <= NOD_LATE_SECS:
                logger.debug(f"{self}: nod {nod}")
                await self._send(nod=round(nod.strength, 2), double=nod.double)
        paused = self._nods.paused_at
        # No newer transcript came with the phrase's end: it had it already.
        if paused is not None and now - paused >= TRANSCRIPT_LAG_SECS:
            self._maybe_read(final=False)

    def _maybe_read(self, final: bool):
        if not self._jev_reads or (self._reading and not self._reading.done()):
            return
        new = len(self._words) - self._read_words
        now = time.monotonic()
        paused = self._nods.paused_at is not None and self._nods.paused_at > self._read_at
        due = (
            new >= 1
            if final
            else now - self._read_at >= READ_GAP_SECS
            and (paused and new >= PHRASE_WORDS or new >= RUN_ON_WORDS)
        )
        if not due or self._reads >= MAX_READS:
            return
        start = max(self._read_words, len(self._words) - NEWEST_WORDS)
        before, newest = self._words[:start], self._words[start:]
        self._read_words = len(self._words)
        self._read_at = now
        self._reads += 1
        self._reading = self.create_task(
            self._read_words_heard(before, newest, self._turn), f"listen-{self._turn}"
        )

    async def _react_to_reading(self, frame: TranscriptionFrame):
        """Takes Sam aback at a turn the Tone reader reads as angry."""
        emotion = next((s for s in frame.perception or [] if s.name == "emotion"), None)
        if not emotion or not emotion.labels or "shocked" in self._reacted:
            return
        label, sure = emotion.labels[0]
        sarcasm = next((s.value for s in frame.perception or [] if s.name == "sarcasm"), None)
        # Sarcasm reads as angry too, but it's a jab, not an outburst.
        if label != "angry" or sure < ANGRY or (sarcasm or 0) >= SARCASTIC:
            return
        logger.debug(f"{self}: angry {sure:.2f} → shocked")
        self._reacted.add("shocked")
        self._reacted_at = time.monotonic()
        self._held = None
        await self._send(reaction="shocked")

    async def _read_words_heard(self, before: list[str], newest: list[str], turn: int):
        heard = len(before) + len(newest)
        state = listen_state(
            last_said(self._context, "assistant"), " ".join(before[-40:]), " ".join(newest)
        )
        started = time.monotonic()
        try:
            self._jev = self._jev or AsyncTypeSafeClient(
                retry=RetryPolicy(max_retries=0, timeout=READ_TIMEOUT_SECS)
            )
            response = await self._jev.system_one(state=state, questions=listen_questions())
        except TypeSafeError as e:
            logger.warning(f"{self}: couldn't read {state['newest']!r}: {e}")
            return
        now = time.monotonic()
        if turn != self._turn or not self._listening:
            return
        reaction, face = response.choices["reaction"], response.choices["face"]
        react: str | None = reaction.choice
        if (
            react not in MIN_REACTION
            or reaction.probabilities[react] < MIN_REACTION[react]
            # Said too long ago now to react to.
            or len(self._words) - heard > STALE_WORDS
            or react in self._reacted
            or now - self._reacted_at < REACTION_GAP_SECS
        ):
            react = None
        else:
            self._reacted.add(react)
            self._reacted_at = now
            # The reaction is the listener's answer to the phrase, not a nod.
            self._held = None
        expression: str | None = face.choice
        if (
            face.probabilities[expression] < MIN_FACE
            or expression == self._face
            or now - self._face_at < FACE_HOLD_SECS
        ):
            expression = None
        else:
            self._face = expression
            self._face_at = now
        logger.debug(
            f"{self}: {state['newest']!r} in {now - started:.2f}s: "
            f"{reaction.choice} {reaction.probabilities[reaction.choice]:.2f}, "
            f"{face.choice} {face.probabilities[face.choice]:.2f}"
            f" → {react or 'no reaction'}, {expression or 'same face'}"
        )
        if react or expression:
            await self._send(reaction=react, expression=expression)

    async def _send(self, **cue):
        await self.push_frame(RTVIServerMessageFrame(data={"type": LISTEN_MESSAGE_TYPE, **cue}))
