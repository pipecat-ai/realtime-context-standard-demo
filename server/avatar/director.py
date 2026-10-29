#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Directs the client avatar's face through each line Sam speaks."""

import asyncio

from loguru import logger
from pipecat.frames.frames import AggregatedTextFrame, Frame, InterruptionFrame
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIServerMessageFrame
from pipecat.utils.text.base_text_aggregator import TextType
from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy, TypeSafeError

from avatar.cues import cue_questions, cue_state

CUE_MESSAGE_TYPE = "avatar-cue"
# A reaction plays only when Jev gives it this much of its probability: most
# lines are better without one.
MIN_REACTION = 0.5
# A cue later than this is dropped: its line has been heard.
JEV_TIMEOUT_SECS = 1.0
# The tagger's sounds, as Momo's reactions; a breath has none.
SOUND_REACTIONS = {"laugh": "laugh", "chuckle": "laugh", "sigh": "sigh"}


class AvatarDirector(FrameProcessor):
    """Sends a cue for each segment the TTS will speak: the avatar's expression and reaction.

    Goes after the TTS, which pushes each sentence it is about to speak as an
    ``AggregatedTextFrame``. Jev reads each sentence with the reply before it and
    the customer's last message, and picks the expression and the reaction; an
    expression sound the tagger wrote (``[[laughs]]``) is its reaction alone. The
    cue goes to the client as an RTVI server-message keyed by the frame's id, the
    ``segment_id`` RTVI's ``bot-output`` reports as each word plays, so the client
    plays it with the line however early it arrives.
    """

    def __init__(self, context: LLMContext, **kwargs):
        """Initialize the director.

        Args:
            context: The conversation, for the customer's last message.
            **kwargs: Additional arguments passed to the parent class.
        """
        super().__init__(**kwargs)
        self._context = context
        self._jev: AsyncTypeSafeClient | None = None
        self._reply: str | None = None
        self._said: list[str] = []
        self._last_reaction: str | None = None
        self._tasks: set[asyncio.Task] = set()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)
        if isinstance(frame, InterruptionFrame):
            # The rest of the reply won't be spoken.
            for task in list(self._tasks):
                await self.cancel_task(task)
            self._tasks.clear()
        elif isinstance(frame, AggregatedTextFrame) and frame.will_be_spoken:
            await self._direct(frame)

    async def cleanup(self):
        await super().cleanup()
        if self._jev:
            await self._jev.aclose()

    async def _direct(self, frame: AggregatedTextFrame):
        if frame.context_id != self._reply:
            # One TTS context per reply.
            self._reply = frame.context_id
            self._said = []
            self._last_reaction = None
        if frame.text_type == TextType.EXPRESSION_SOUND:
            sound = next((s for s in SOUND_REACTIONS if frame.text.startswith(s)), None)
            # Jev may have already given the line before it the same gesture.
            if sound and SOUND_REACTIONS[sound] != self._last_reaction:
                self._last_reaction = SOUND_REACTIONS[sound]
                await self._send_cue(frame.id, None, self._last_reaction)
        elif frame.text_type == TextType.SENTENCE and frame.text.strip():
            state = cue_state(self._customer_said(), list(self._said), frame.text.strip())
            self._said.append(frame.text.strip())
            task = self.create_task(self._ask_jev(frame.id, state), f"cue-{frame.id}")
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)

    async def _ask_jev(self, segment: int, state: dict):
        try:
            self._jev = self._jev or AsyncTypeSafeClient(
                retry=RetryPolicy(max_retries=1, timeout=JEV_TIMEOUT_SECS)
            )
            response = await self._jev.system_one(state=state, questions=cue_questions())
        except TypeSafeError as e:
            logger.warning(f"{self}: no cue for {state['line']!r}: {e}")
            return
        expression = response.choices["expression"]
        reaction = response.choices["reaction"]
        chosen = reaction.choice
        if chosen == "none" or reaction.probabilities[chosen] < MIN_REACTION:
            chosen = None
        elif chosen == self._last_reaction:
            # The same gesture twice in a row reads as a tic.
            chosen = None
        self._last_reaction = chosen
        logger.debug(f"{self}: {state['line']!r} → {expression.choice}, {chosen or 'no reaction'}")
        await self._send_cue(segment, expression.choice, chosen)

    async def _send_cue(self, segment: int, expression: str | None, reaction: str | None):
        data = {
            "type": CUE_MESSAGE_TYPE,
            "segment": segment,
            "expression": expression,
            "reaction": reaction,
        }
        await self.push_frame(RTVIServerMessageFrame(data=data))

    def _customer_said(self) -> str:
        """The customer's last message, with how they sounded at its head."""
        for message in reversed(self._context.get_messages()):
            if not isinstance(message, dict) or message.get("role") != "user":
                continue
            content = message.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return " ".join(
                    part.get("text", "") for part in content if isinstance(part, dict)
                ).strip()
        return ""
