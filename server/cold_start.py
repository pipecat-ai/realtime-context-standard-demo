#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Covers for the LLM while it wakes, as PhoneLLM Mini does on Baseten.

Baseten can scale PhoneLLM Mini's deployment down to no replicas when it's idle,
and the first request after that waits for one to start: about two minutes,
sometimes several. Without cover, the call is silent all that time: Sam's
greeting is the LLM's to write, and the caller is muted until it's spoken.

``ColdStartGuard`` goes right after the LLM, and watches the call's requests
until the LLM first replies. When a reply hasn't started a few seconds after it
was asked for, the guard tells the client the model is waking, in an
``llm-status`` server message, and Sam says so, and again every so often while
the caller waits, which also keeps the call from ending as idle. Her holding
lines stay out of the LLM's context. When the LLM's first output arrives, the
guard tells the client the model is ready, and stands down for the rest of the
call: a replica that has started stays up while it's asked for.
"""

import asyncio
import itertools
import math
import time

from loguru import logger
from pipecat.frames.frames import (
    CancelFrame,
    EndFrame,
    Frame,
    FunctionCallsStartedFrame,
    InterruptionFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMMarkerFrame,
    LLMTextFrame,
    LLMThoughtStartFrame,
    MetricsFrame,
    TTSSpeakFrame,
)
from pipecat.metrics.metrics import TTFBMetricsData
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIServerMessageFrame
from pipecat.services.llm_service import LLMService

LLM_STATUS_MESSAGE_TYPE = "llm-status"

# A warm model starts its reply within a second, or three on a replica that has
# only just started; longer, and it's still starting.
WAKING_AFTER_SECS = 4.0

# The time between Sam's holding lines, at least.
HOLD_EVERY_SECS = 30.0

# Sam's holding lines: the first, then the rest in turn.
FIRST_HOLD = "Hi there, bear with me a moment, my system's just starting up."
HOLDS = [
    "Sorry, I'm still starting up. Thanks for bearing with me.",
    "Still here, my system's taking a little while today.",
    "Thanks for holding, I'll be with you as soon as I'm set up.",
]

# What the LLM pushes once its reply has started: a turn-completion marker comes
# first, and an incomplete turn's marker is all there is.
REPLY_FRAMES = (LLMMarkerFrame, LLMTextFrame, LLMThoughtStartFrame, FunctionCallsStartedFrame)


class ColdStartGuard(FrameProcessor):
    """Tells the caller and the client while the LLM wakes, until it first replies.

    Goes right after the LLM, which it's given to tell its metrics from others'.
    """

    def __init__(self, llm: LLMService):
        super().__init__()
        self._llm = llm
        self._holding: asyncio.Task | None = None
        self._waking = False
        self._replied = False
        self._holds = itertools.chain([FIRST_HOLD], itertools.cycle(HOLDS))
        self._held_at = -math.inf

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)

        if self._replied:
            return
        if isinstance(frame, LLMFullResponseStartFrame):
            # Pushed as the LLM sends the request, before any reply.
            await self._stop_holding()
            self._holding = self.create_task(self._hold(), "hold")
        elif isinstance(frame, REPLY_FRAMES):
            self._replied = True
            await self._stop_holding()
            if self._waking:
                logger.info(f"{self}: the LLM is ready")
                await self._send_status("ready")
        elif self._first_byte(frame) or isinstance(
            frame, (LLMFullResponseEndFrame, InterruptionFrame, EndFrame, CancelFrame)
        ):
            # The request is over, or its reply is coming (the LLM can hold the
            # text back a moment). An interruption also stops the request's
            # time to first byte, so only the reply itself counts as ready.
            await self._stop_holding()

    def _first_byte(self, frame: Frame) -> bool:
        return isinstance(frame, MetricsFrame) and any(
            isinstance(data, TTFBMetricsData) and data.processor == self._llm.name
            for data in frame.data
        )

    async def _hold(self):
        """Once the reply is late: the client told, and Sam's holding lines until it comes."""
        await asyncio.sleep(WAKING_AFTER_SECS)
        if not self._waking:
            self._waking = True
            logger.warning(f"{self}: no reply after {WAKING_AFTER_SECS:.0f}s; the LLM is waking")
            await self._send_status("waking")
        while True:
            await asyncio.sleep(max(0.0, self._held_at + HOLD_EVERY_SECS - time.monotonic()))
            self._held_at = time.monotonic()
            await self.push_frame(TTSSpeakFrame(next(self._holds), append_to_context=False))

    async def _stop_holding(self):
        if self._holding:
            await self.cancel_task(self._holding)
            self._holding = None

    async def _send_status(self, status: str):
        await self.push_frame(
            RTVIServerMessageFrame(data={"type": LLM_STATUS_MESSAGE_TYPE, "status": status})
        )
