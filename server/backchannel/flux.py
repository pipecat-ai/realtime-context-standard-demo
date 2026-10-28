#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Deepgram Flux, with the backchannel model judging the turns it starts over the bot.

Flux proposes a turn whenever it hears the user, and the user aggregator takes
each proposal as an interruption. While Sam is talking, this holds Flux's
proposal back until the backchannel model has heard the speech:

- a floor-take ("wait", "no"), or speech the model can't call: the proposal goes
  on and the user's turn interrupts Sam, as it would without the model;
- a backchannel ("mm-hmm", "right"): the proposal never goes on, Sam keeps
  talking, and Flux's transcript of it goes on as a ``UserBackchannelFrame``,
  which the client shows as a backchannel and the LLM never reads.

A backchannel is only one while Sam talks. An "okay" just after Sam's last
sentence, which the model hears as one, goes on as a turn, so Sam answers it.

It's done in the STT rather than a processor after it so the transcript of a
backchannel is replaced before anything sees it: the RTVI observer reports a
transcription as the user's input the first time it's pushed.

The model listens on its own Silero VAD, as it was evaluated: the user
aggregator keeps none, so turns stay Flux's alone. Speech that VAD never
reports, such as a quiet "yeah" under Sam's voice, is judged by its words.
"""

import asyncio
import time
from contextlib import suppress
from enum import Enum

from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADState
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    Frame,
    InputAudioRawFrame,
    InterimTranscriptionFrame,
    InterruptionFrame,
    ProposedUserStartedSpeakingFrame,
    ProposedUserStoppedSpeakingFrame,
    StartFrame,
    TranscriptionFrame,
    UserBackchannelFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameDirection
from pipecat.services.deepgram.flux.stt import DeepgramFluxSTTService

from .analyzer import BackchannelAnalyzer
from .decision import Decision, Verdict
from .lexicon import Lexicon
from .model import ensure_model

# How long a released turn's transcript waits for the turn's interruption.
INTERRUPTION_WAIT_SECS = 1.0


class _Speech(Enum):
    """What the model made of the user's latest speech."""

    IDLE = "idle"  # none over Sam, or none the VAD has reported yet
    PENDING = "pending"  # over Sam, still listening
    BACKCHANNEL = "backchannel"
    FLOOR_TAKE = "floor_take"
    UNDECIDED = "undecided"  # ended without a call, such as a cough


class _Turn(Enum):
    """What happens to the turn Flux has open."""

    NONE = "none"  # none open
    HELD = "held"  # proposed over Sam; waiting on the model
    PASSING = "passing"  # proposed and passed on: the user aggregator has it
    BACKCHANNEL = "backchannel"  # reported as a backchannel; its end is dropped


class BackchannelFluxSTTService(DeepgramFluxSTTService):
    """Deepgram Flux that leaves the bot talking through the user's backchannels."""

    def __init__(self, **kwargs):
        """Initialize the service.

        Args:
            **kwargs: Passed to :class:`DeepgramFluxSTTService`.
        """
        super().__init__(**kwargs)
        self._analyzer: BackchannelAnalyzer | None = None
        self._vad = SileroVADAnalyzer()
        self._vad_state = VADState.QUIET
        self._lexicon = Lexicon()

        self._bot_speaking = False
        # Monotonic times, to tell whether Sam talked over the user's speech.
        self._bot_stopped_at = 0.0
        self._speech_started_at = 0.0
        self._user_turn = False
        self._speech = _Speech.IDLE
        self._turn = _Turn.NONE
        # Flux's latest transcript of a held turn, passed on with the turn.
        self._held_interim: InterimTranscriptionFrame | None = None
        # The ids of broadcast frames held back, whose other half follows.
        self._dropped: set[int] = set()
        # Set when an interruption passes back up through here.
        self._interrupted = asyncio.Event()

    async def start(self, frame: StartFrame):
        """Load the model, downloading it on first use, then connect to Flux."""
        self._analyzer = await asyncio.to_thread(
            lambda: BackchannelAnalyzer(model_path=ensure_model())
        )
        logger.info(f"{self}: backchannel model loaded")
        await super().start(frame)

    async def cleanup(self):
        """Release the VAD."""
        await super().cleanup()
        await self._vad.cleanup()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Follow Sam's speech and the user's turns, and listen to the user."""
        # Flux first, so it hears the user whatever happens here.
        await super().process_frame(frame, direction)
        if isinstance(frame, InputAudioRawFrame):
            await self._listen(frame)
        elif isinstance(frame, BotStartedSpeakingFrame):
            self._set_bot_speaking(True)
        elif isinstance(frame, BotStoppedSpeakingFrame):
            await self._handle_bot_stopped()
        elif isinstance(frame, UserStartedSpeakingFrame):
            self._handle_user_turn_started()
        elif isinstance(frame, UserStoppedSpeakingFrame):
            self._user_turn = False
        elif isinstance(frame, InterruptionFrame):
            self._interrupted.set()

    async def push_frame(self, frame: Frame, direction: FrameDirection = FrameDirection.DOWNSTREAM):
        """Pass on Flux's turn frames, unless the turn is held or is a backchannel."""
        # The upstream half of a broadcast follows the downstream half.
        if frame.broadcast_sibling_id in self._dropped:
            self._dropped.discard(frame.broadcast_sibling_id)
            return
        if await self._passes(frame):
            await super().push_frame(frame, direction)
        elif frame.broadcast_sibling_id is not None:
            self._dropped.add(frame.id)

    # -- Flux's turn ---------------------------------------------------------

    async def _passes(self, frame: Frame) -> bool:
        """Whether a frame Flux pushes goes on."""
        if isinstance(frame, ProposedUserStartedSpeakingFrame):
            if self._turn == _Turn.NONE:
                self._turn = _Turn.HELD if self._should_hold() else _Turn.PASSING
                if self._turn == _Turn.HELD:
                    logger.debug(f"{self}: holding a turn proposed over the bot")
                    if self._speech == _Speech.IDLE:
                        # Flux heard it first; the VAD may never.
                        self._speech_started_at = time.monotonic()
            return self._turn == _Turn.PASSING
        if isinstance(frame, InterimTranscriptionFrame) and self._turn == _Turn.HELD:
            self._held_interim = frame
            if (
                self._speech == _Speech.IDLE
                and frame.text.strip()
                and not self._lexicon.is_backchannel(frame.text)
            ):
                # Speech the model hasn't heard, in words no backchannel has.
                await self._release(f"{frame.text!r} is not a backchannel")
            return False
        if isinstance(frame, TranscriptionFrame) and self._turn == _Turn.HELD:
            return await self._judge_transcript(frame)
        if isinstance(frame, ProposedUserStoppedSpeakingFrame):
            # A held turn ending here never had a transcript.
            ended, self._turn = self._turn, _Turn.NONE
            self._held_interim = None
            # What the model made of the turn's speech ends with it, unless
            # the user is still talking.
            if self._vad_state != VADState.SPEAKING:
                self._speech = _Speech.IDLE
            return ended not in (_Turn.HELD, _Turn.BACKCHANNEL)
        return True

    def _should_hold(self) -> bool:
        """Whether a turn Flux proposes now waits for the model."""
        if self._user_turn or self._speech in (_Speech.FLOOR_TAKE, _Speech.UNDECIDED):
            return False
        if self._speech in (_Speech.PENDING, _Speech.BACKCHANNEL):
            return True
        # Flux hearing the user before the VAD does, if it ever will, while Sam
        # talks. Speech the VAD hears already began before Sam did.
        return self._bot_speaking and self._vad_state != VADState.SPEAKING

    async def _judge_transcript(self, frame: TranscriptionFrame) -> bool:
        """Flux ended a held turn: report it as a backchannel, or pass the turn on.

        The model's call stands if it made one. If it's still listening, or the
        VAD never heard the speech, its words decide, since the turn's end
        follows now.
        """
        if not frame.text.strip():
            # Flux heard noise and no words: nothing to interrupt Sam for.
            return False
        if self._speech == _Speech.BACKCHANNEL:
            by = "model"
        elif self._speech in (_Speech.IDLE, _Speech.PENDING) and self._lexicon.is_backchannel(
            frame.text
        ):
            by = "words"
        else:
            await self._release(f"{frame.text!r} is not a backchannel", before_transcript=True)
            return True
        # Sam stopped before the user started, and hasn't started again.
        if not self._bot_speaking and self._bot_stopped_at < self._speech_started_at:
            await self._release(
                f"{frame.text!r} answers the bot, which is quiet", before_transcript=True
            )
            return True
        logger.info(f"{self}: backchannel {frame.text!r} (by {by})")
        self._turn = _Turn.BACKCHANNEL
        self._held_interim = None
        await super().push_frame(
            UserBackchannelFrame(text=frame.text, user_id=frame.user_id, timestamp=frame.timestamp)
        )
        return False

    async def _release(self, reason: str, *, before_transcript: bool = False):
        """Pass a held turn on to the user aggregator, which interrupts Sam.

        Args:
            reason: Why, for the log.
            before_transcript: The turn's transcript goes on next. The
                interruption the turn starts clears the frames queued behind it,
                so the transcript waits for it to pass back up through here.
        """
        if self._turn != _Turn.HELD:
            return
        logger.debug(f"{self}: passing a held turn on: {reason}")
        self._turn = _Turn.PASSING
        self._interrupted.clear()
        await self.broadcast_frame(ProposedUserStartedSpeakingFrame)
        if self._held_interim:
            await super().push_frame(self._held_interim)
            self._held_interim = None
        if before_transcript:
            # No interruption comes while the user is muted.
            with suppress(TimeoutError):
                await asyncio.wait_for(self._interrupted.wait(), INTERRUPTION_WAIT_SECS)

    # -- the model -------------------------------------------------------------

    async def _listen(self, frame: InputAudioRawFrame):
        """Run the user's audio through the model, then the VAD."""
        if not self._analyzer:
            return
        if frame.sample_rate != self._vad.sample_rate:
            self._analyzer.set_sample_rate(frame.sample_rate)
            self._vad.set_sample_rate(frame.sample_rate)
        for decision in self._analyzer.append_audio(frame.audio, num_channels=frame.num_channels):
            await self._handle_decision(decision)

        state = await self._vad.analyze_audio(frame.audio)
        if state not in (self._vad_state, VADState.STARTING, VADState.STOPPING):
            self._vad_state = state
            if state == VADState.SPEAKING:
                await self._handle_speech_started()
            else:
                await self._handle_speech_stopped()

    async def _handle_speech_started(self):
        assert self._analyzer
        if self._user_turn:
            return
        # The VAD reports speech start_secs after it began.
        self._speech_started_at = time.monotonic() - self._vad.params.start_secs
        if self._analyzer.user_onset(backdate_secs=self._vad.params.start_secs):
            self._speech = _Speech.PENDING
        else:
            self._speech = _Speech.IDLE
            # Sam is quiet, so speaking now interrupts nothing.
            await self._release("the user is talking and the bot is quiet")

    async def _handle_speech_stopped(self):
        assert self._analyzer
        decision = self._analyzer.user_offset(backdate_secs=self._vad.params.stop_secs)
        if decision:
            await self._handle_decision(decision)
        if self._speech == _Speech.PENDING:
            # Stopped before the model could call it: Flux decides, as it would alone.
            self._speech = _Speech.UNDECIDED
            await self._release("the model couldn't call it")

    async def _handle_decision(self, decision: Decision):
        logger.info(
            f"{self}: {decision.verdict.value} ({decision.intent}, {decision.confidence:.2f}) "
            f"{decision.secs_since_onset * 1000:.0f} ms after onset, by {decision.reason}"
        )
        if decision.verdict == Verdict.BACKCHANNEL:
            self._speech = _Speech.BACKCHANNEL
            return
        self._speech = (
            _Speech.FLOOR_TAKE if decision.verdict == Verdict.FLOOR_TAKE else _Speech.UNDECIDED
        )
        await self._release(f"{decision.verdict.value} by {decision.reason}")

    # -- the conversation ------------------------------------------------------

    def _set_bot_speaking(self, speaking: bool):
        self._bot_speaking = speaking
        if self._analyzer:
            self._analyzer.set_bot_speaking(speaking)

    async def _handle_bot_stopped(self):
        self._set_bot_speaking(False)
        self._bot_stopped_at = time.monotonic()
        if self._speech == _Speech.PENDING and self._vad_state == VADState.SPEAKING:
            # The user is still talking, now into silence.
            await self._release("the bot stopped while the user talks")

    def _handle_user_turn_started(self):
        # The user has the floor, so nothing they say now is judged.
        self._user_turn = True
        self._speech = _Speech.IDLE
        if self._analyzer:
            self._analyzer.cancel_pending()
