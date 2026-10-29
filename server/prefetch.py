#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""The models each call loads, and their download ahead of the call.

Each call loads the Tone reader and tagger, from Hugging Face, and the
backchannel model, downloading them the first time, which holds Sam's greeting.
The Pipecat Cloud image runs this module as it's built (``Dockerfile``), and its
calls load what it fetched, with Hugging Face offline. So the bot builds its
processors from these settings too: a model the build didn't fetch can't load.

Run it with::

    uv run prefetch.py
"""

from typing import Any

from pipecat.processors.tone.reader.model import TONE_REVISION, PipecatToneReaderModel
from pipecat.processors.tone.tagger.model import TAGGER_REVISION, PipecatToneTaggerModel

from backchannel.model import ensure_model

# Taken alike by the Tone processors and their models' downloads.
READER: dict[str, Any] = {"revision": TONE_REVISION, "precision": "fp16"}
TAGGER: dict[str, Any] = {"revision": TAGGER_REVISION, "size": "17m"}


def prefetch() -> None:
    """Download the models each call loads, and the backchannel model."""
    PipecatToneReaderModel.download(**READER)
    PipecatToneTaggerModel.download(**TAGGER)
    ensure_model()


if __name__ == "__main__":
    prefetch()
