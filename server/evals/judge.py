#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""The eval judge: an OpenAI model, so the evals need no local Ollama.

Scenarios name it with ``judge: {eval: {factory: evals.judge.openai_judge}}``,
which resolves when ``pipecat eval`` runs from ``server/``.
"""

import os
from typing import Any

from pipecat.services.openai.llm import OpenAILLMService


def openai_judge(config: dict[str, Any]) -> OpenAILLMService:
    """Build the judging LLM from the scenario's ``judge.eval`` block."""
    return OpenAILLMService(
        api_key=os.environ["OPENAI_API_KEY"],
        settings=OpenAILLMService.Settings(model=config.get("model", "gpt-4.1")),
    )
