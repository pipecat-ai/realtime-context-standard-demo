#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Times the phones of each word the TTS speaks, for the client avatar's mouth.

The lipsync analyzer hears how open and loud the voice is, but not which sound
it is: lips that meet for "m", round for "oo" or spread for "ee" look alike to
it. The words do say, so each word's phones (CMUdict, from ``lipsync/``) are
placed through the time the TTS gives the word, at their usual durations, and
sent to the client on the lipsync batches' timeline: seconds of the TTS
context's audio from its first sample, keyed by the same context id.
"""

import re

from pipecat.frames.frames import (
    Frame,
    InterruptionFrame,
    TTSAudioRawFrame,
    TTSStoppedFrame,
    TTSTextFrame,
)
from pipecat.processors.frame_processor import (
    FrameDirection,
    FrameProcessor,
    FrameProcessorSetup,
)
from pipecat.processors.frameworks.rtvi import RTVIServerMessageFrame
from pipecat.utils.text.base_text_aggregator import TextType

from lipsync.pronunciation import load_lexicon, pronounce, tokenize

PHONES_MESSAGE_TYPE = "bot-tts-phones"

# Typical phone durations, seconds: a word's phones share its time in these
# proportions. Sam's voice (ElevenLabs River) speaks a word in 0.94 of their sum,
# at the median.
VOWEL_SECONDS = 0.1
DIPHTHONG_SECONDS = 0.13
CONSONANT_SECONDS = 0.07
FRICATIVE_SECONDS = 0.085
VOWELS = frozenset("AA AE AH AO EH ER IH IY UH UW".split())
DIPHTHONGS = frozenset("AW AY EY OW OY".split())
FRICATIVES = frozenset("F S SH TH V Z ZH".split())
# A word given more time than this many times its phones' usual durations is
# followed by a pause: its phones keep their pace and the rest is silence.
MAX_STRETCH = 1.6

ONES = (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
    "fifteen sixteen seventeen eighteen nineteen"
).split()
TENS = "twenty thirty forty fifty sixty seventy eighty ninety".split()


def number_words(n: int) -> list[str]:
    """A whole number as it's read aloud, up to 999,999."""
    if n < 20:
        return [ONES[n]]
    if n < 100:
        return [TENS[n // 10 - 2]] + ([ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        return [ONES[n // 100], "hundred"] + (number_words(n % 100) if n % 100 else [])
    if n < 1_000_000:
        rest = number_words(n % 1000) if n % 1000 else []
        return number_words(n // 1000) + ["thousand"] + rest
    return [ONES[int(d)] for d in str(n)]


def word_phones(text: str) -> tuple[str, ...]:
    """The phones of a word as the TTS reports it, punctuation and all ("289", "it's.")."""
    phones: list[str] = []
    for token in re.findall(r"\d+|[a-zA-Z'’]+", text):
        words = number_words(int(token)) if token.isdigit() else list(tokenize(token))
        for word in words:
            phones.extend(pronounce(word).phones)
    return tuple(phones)


def phone_seconds(phone: str) -> float:
    if phone in DIPHTHONGS:
        return DIPHTHONG_SECONDS
    if phone in VOWELS:
        return VOWEL_SECONDS
    if phone in FRICATIVES:
        return FRICATIVE_SECONDS
    return CONSONANT_SECONDS


def place_phones(
    phones: tuple[str, ...], start: float, end: float | None
) -> list[tuple[float, float, str]]:
    """Each phone's (start, duration, phone), through a word spoken from `start` until `end`.

    With no end (the last word heard so far), the phones keep their usual pace.
    """
    usual = sum(phone_seconds(p) for p in phones)
    if not usual:
        return []
    stretch = 1.0 if end is None else min(MAX_STRETCH, max(0.0, end - start) / usual)
    placed = []
    at = start
    for phone in phones:
        duration = phone_seconds(phone) * stretch
        placed.append((at, duration, phone))
        at += duration
    return placed


class PhoneTimer(FrameProcessor):
    """Sends the phones of each word the TTS speaks, timed on its context's audio.

    Goes after the TTS. Pipecat's word timestamps count from the context's first
    audio (or from the previous context's last word, when that came later): the
    same origin the lipsync processor uses. A word's phones go out when the next
    word, or the end of the context, says how long it lasted.
    """

    def __init__(self, **kwargs):
        """Initialize the timer.

        Args:
            **kwargs: Additional arguments passed to the parent class.
        """
        super().__init__(**kwargs)
        self._origins: dict[str, int] = {}
        self._last_word_pts = 0
        self._pending: dict[str, tuple[str, float]] = {}

    async def setup(self, setup: FrameProcessorSetup):
        await super().setup(setup)
        load_lexicon()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)
        if isinstance(frame, TTSAudioRawFrame) and frame.context_id:
            if frame.context_id not in self._origins:
                now = self.get_clock().get_time()
                self._origins[frame.context_id] = max(now, self._last_word_pts)
        elif isinstance(frame, TTSTextFrame) and frame.text_type == TextType.WORD:
            await self._word(frame)
        elif isinstance(frame, TTSStoppedFrame) and frame.context_id:
            await self._flush(frame.context_id, None)
            self._origins.pop(frame.context_id, None)
        elif isinstance(frame, InterruptionFrame):
            self._origins.clear()
            self._pending.clear()

    async def _word(self, frame: TTSTextFrame):
        if frame.pts is None:
            return
        self._last_word_pts = frame.pts
        ctx = frame.context_id
        origin = self._origins.get(ctx) if ctx else None
        if ctx is None or origin is None:
            return
        start = (frame.pts - origin) / 1e9
        await self._flush(ctx, start)
        self._pending[ctx] = (frame.text, max(0.0, start))

    async def _flush(self, ctx: str, end: float | None):
        pending = self._pending.pop(ctx, None)
        if pending is None:
            return
        text, start = pending
        placed = place_phones(word_phones(text), start, end)
        if not placed:
            return
        data = {
            "type": PHONES_MESSAGE_TYPE,
            "ctx": ctx,
            "phones": [[round(s, 3), round(d, 3), p] for s, d, p in placed],
        }
        await self.push_frame(RTVIServerMessageFrame(data=data))
