#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""The caller's mood across the call, moved by the Tone reader's reading of each turn.

A simple version of the Tone garage demo's feelings: one value, 0 to 100, starting at
50. Each turn's likeliest emotions move it by their effects, weighted by how sure the
reader is of each. Losing ground is easier than winning it, and sarcasm counts
against the mood whatever the words say.
"""

from dataclasses import dataclass
from typing import Any

from pipecat.expressive.perception import PerceptionSignal

# Points for a sure reading of each of the reader's emotions.
EFFECTS = {
    "happy": 8,
    "amused": 6,
    "surprised": 0,
    "neutral": 0,
    "sad": -6,
    "afraid": -6,
    "angry": -12,
    "disgusted": -12,
    "contemptuous": -12,
}

# At or above this sarcasm, a turn means the opposite of its words: a warm reading
# costs what it would have gained, and a flat one still costs SARCASM_COST.
SARCASTIC = 0.5
SARCASM_COST = 6

# The mood in a word, below each limit.
WORDS = [(25, "upset"), (45, "wary"), (60, "neutral"), (80, "warm")]


def mood_word(value: int) -> str:
    return next((word for limit, word in WORDS if value < limit), "delighted")


@dataclass
class MoodMeter:
    """One call's mood, sent to the client after every user turn."""

    value: int = 50

    def read(self, perception: list[PerceptionSignal]) -> dict[str, Any]:
        """Move the mood by one turn's reading, and return it as a server message."""
        signals = {signal.name: signal for signal in perception}
        # The reader's likeliest emotions, each weighted by its confidence.
        emotion = signals.get("emotion")
        labels = emotion.labels if emotion else []
        effect = sum(EFFECTS.get(label, 0) * confidence for label, confidence in labels)

        sarcasm = signals.get("sarcasm")
        if sarcasm and sarcasm.value is not None and sarcasm.value >= SARCASTIC:
            effect = -max(abs(effect), SARCASM_COST * sarcasm.value)

        was = self.value
        self.value = max(0, min(100, round(was + effect)))
        return {
            "type": "mood",
            "value": self.value,
            "change": self.value - was,
            "word": mood_word(self.value),
        }
