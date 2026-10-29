#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Northwind Outfitters support agent.

A customer service voice agent for an outdoor gear shop, on a cascade pipeline
with Pipecat Tone reading the user and voicing the bot:

    Deepgram Flux (STT) → Tone reader → PhoneLLM Mini on Baseten (LLM)
        → Tone tagger → ElevenLabs v4 Text-to-Dialogue (TTS) → lipsync

The lipsync processor reads the bot's voice for its mouth shapes, which the
client's avatar speaks with (``lipsync/``, from pipecat-visemes), and the
phone timer times the phones of each word, which shape its lips. With a
``TYPESAFE_API_KEY``, Jev reads each line Sam speaks for the avatar's expression
and reaction (``avatar/``).

Three start-time options, read from the ``/start`` request body, swap parts:

- ``tts``: ``"elevenlabs"`` (default) or ``"cartesia"``.
- ``use_tagger``: ``"true"`` (default) or ``"false"``, which drops the tagger
  and has GPT-5.6 Luna write the expression tags itself.
- ``detect_backchannels``: ``"false"`` (default) or ``"true"``, which keeps Sam
  talking through the user's backchannels (``backchannel/``).

Run the bot using::

    uv run bot.py
"""

import importlib.util
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, get_args

from dotenv import load_dotenv
from loguru import logger
from pipecat.evals.transport import EvalTransportParams
from pipecat.expressive.perception import format_perception
from pipecat.expressive.policy import ExpressionGuidance, ExpressionPolicy
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
    UserTurnStoppedMessage,
)
from pipecat.processors.frameworks.rtvi import RTVIFunctionCallReportLevel, RTVIObserverParams
from pipecat.processors.tone.reader import PipecatToneReader
from pipecat.processors.tone.tagger import PipecatToneTagger
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.baseten.llm import BasetenLLMService
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.flux.stt import DeepgramFluxSTTService
from pipecat.services.elevenlabs.dialogue.tts import ElevenLabsDialogueTTSService
from pipecat.services.llm_service import LLMService
from pipecat.services.openai.responses.llm import (
    OpenAIResponsesLLMService,
    OpenAIResponsesReasoningConfig,
)
from pipecat.services.tts_service import TTSService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.turns.user_mute import MuteUntilFirstBotCompleteUserMuteStrategy
from pipecat.workers.runner import WorkerRunner

from avatar import AvatarDirector, PhoneTimer
from backchannel import BackchannelFluxSTTService
from lipsync import LipsyncMessageRelay, LipsyncProcessor
from meter import MoodMeter
from tools import TOOLS, OrderStore

load_dotenv(override=True)


SYSTEM_INSTRUCTION = (
    "You are Sam, a customer service agent on a phone call for Northwind Outfitters, "
    "an online shop for outdoor gear. "
    "Today is {today_spoken} ({today_iso}). "
    "You help customers with their orders: use your tools to look orders up, change an "
    "order's shipping address or shipping speed, and cancel orders. "
    "To find an order, ask for the order number, or for the name it's under if they "
    "don't have it. "
    "An order can be changed or cancelled only while it's processing. Once it has "
    "shipped, say so and offer what you can, such as its tracking number and delivery date. "
    "Before cancelling an order, confirm the customer wants it cancelled. "
    "Only give order details your tools returned: never guess a status, date, price, or "
    "tracking number. "
    "For returns, exchanges, or anything else your tools can't do, tell the customer to "
    "email help@northwind.com. "
    "When the customer says goodbye, or their question is settled and they need nothing "
    "else, say a short goodbye and then call end_call in that same turn. "
    'Don\'t narrate your own tool use — no "let me check" or "one moment". Either answer, '
    "or call the tool and then say what it found. "
    'Say dates the short way a person would on the phone: "tomorrow", "Saturday", or '
    '"the 29th". Never say the year, and never read a YYYY-MM-DD date aloud. '
    'Say prices the way a person would, such as "289 dollars". '
    'Say order and tracking numbers one character at a time, such as "4 8 2 1 3". '
    "Keep responses brief. Your responses are spoken aloud, so use plain sentences: no "
    "emojis, lists, or other formatting that can't be spoken, and never reply with nothing."
)

# What the LLM does with the Tone reader's readings, with or without the tagger.
READING_GUIDANCE = [
    "If the customer sounds angry or frustrated at 0.7 or above, apologize once, "
    "then focus on fixing the problem.",
    "If sarcasm is 0.7 or above, the customer means the opposite of their words: "
    "answer what they mean.",
]

TTSName = Literal["elevenlabs", "cartesia"]


@dataclass(frozen=True)
class BotOptions:
    """Start-time choices, read from the ``/start`` request body."""

    tts: TTSName = "elevenlabs"
    # True: PhoneLLM Mini writes plain words and the Tone tagger voices them.
    # False: GPT-5.6 Luna writes the tags itself.
    use_tagger: bool = True
    # True: the backchannel model hears whether speech over Sam is a backchannel
    # ("mm-hmm"), which leaves Sam talking, or an interruption.
    detect_backchannels: bool = False

    @classmethod
    def from_body(cls, body: Any) -> "BotOptions":
        body = body if isinstance(body, dict) else {}
        tts = body.get("tts", cls.tts)
        if tts not in get_args(TTSName):
            raise ValueError(f"tts must be one of {get_args(TTSName)}, got {tts!r}")
        use_tagger = str(body.get("use_tagger", cls.use_tagger)).lower()
        if use_tagger not in ("true", "false"):
            raise ValueError(f"use_tagger must be 'true' or 'false', got {use_tagger!r}")
        detect_backchannels = str(body.get("detect_backchannels", cls.detect_backchannels)).lower()
        if detect_backchannels not in ("true", "false"):
            raise ValueError(
                f"detect_backchannels must be 'true' or 'false', got {detect_backchannels!r}"
            )
        return cls(
            tts=tts,
            use_tagger=use_tagger == "true",
            detect_backchannels=detect_backchannels == "true",
        )


def ordinal(day: int) -> str:
    """Return a day of the month with its English ordinal suffix, e.g. 1 -> "1st"."""
    suffix = "th" if day in (11, 12, 13) else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def build_system_instruction() -> str:
    """Stamp the system instruction with today's date, per session."""
    now = datetime.now()
    return SYSTEM_INSTRUCTION.format(
        # The spoken form models the phrasing we want back; the ISO form is
        # what the tools return.
        today_spoken=f"{now:%A} the {ordinal(now.day)}",
        today_iso=f"{now:%Y-%m-%d}",
    )


def build_expression_policy(tts: TTSName) -> ExpressionPolicy:
    """The expression policy, the same with or without the tagger.

    With the tagger, the presets steer it and the LLM gets only the reading
    guidance. Without it, the pipeline composes the tags the TTS performs, and
    this policy, into the LLM's system instruction.
    """
    guidance: list[ExpressionGuidance | str] = [
        ExpressionGuidance.MATCH_STYLE,
        ExpressionGuidance.SLOW_FOR_DETAILS,
    ]
    # Cartesia performs no breath.
    if tts == "elevenlabs":
        guidance.append(ExpressionGuidance.BREATHE)
    return ExpressionPolicy(guidance=[*guidance, *READING_GUIDANCE])


def build_llm(options: BotOptions) -> LLMService[Any]:
    """PhoneLLM Mini for the tagger, or GPT-5.6 Luna to write its own tags."""
    if options.use_tagger:
        # PhoneLLM is trained for temperature 0, and Mini runs with thinking off.
        return BasetenLLMService(
            api_key=os.environ["PHONELLM_MINI_API_KEY"],
            base_url=os.environ["PHONELLM_MINI_URL"],
            settings=BasetenLLMService.Settings(
                model="pipecat-ai/phonellm-mini-alpha-2",
                system_instruction=build_system_instruction(),
                temperature=0,
                extra={"extra_body": {"chat_template_kwargs": {"enable_thinking": False}}},
            ),
        )
    # Luna over the Responses API WebSocket, with reasoning off for the lowest
    # time to first token.
    return OpenAIResponsesLLMService(
        api_key=os.environ["OPENAI_API_KEY"],
        settings=OpenAIResponsesLLMService.Settings(
            model="gpt-5.6-luna",
            system_instruction=build_system_instruction(),
            reasoning=OpenAIResponsesReasoningConfig(effort="none"),
        ),
    )


def build_tts(options: BotOptions) -> TTSService:
    """ElevenLabs v4 Text-to-Dialogue, or Cartesia.

    Both keep their default names: the tagger reads the name to tell which TTS
    it tags for.
    """
    # `or`, not a getenv default, so a blank line copied from env.example falls
    # back to the default voice too.
    if options.tts == "cartesia":
        return CartesiaTTSService(
            api_key=os.environ["CARTESIA_API_KEY"],
            settings=CartesiaTTSService.Settings(
                # An "Emotive" voice, which Cartesia recommends for emotion.
                voice=os.getenv("CARTESIA_VOICE_ID") or "57dcab65-68ac-45a6-8480-6c4c52ec1cd1",
            ),
        )
    return ElevenLabsDialogueTTSService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        settings=ElevenLabsDialogueTTSService.Settings(
            model="eleven_v4_turbo",
            # River, a premade voice every account has: gender-neutral like Sam,
            # and one ElevenLabs labels conversational.
            voice=os.getenv("ELEVENLABS_VOICE_ID") or "SAz9YHcvj6GT2YYXdXww",
        ),
    )


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments) -> None:
    """Run the voice bot for this session."""
    options = BotOptions.from_body(runner_args.body)
    logger.info(f"Starting bot: {options}")

    # Flux transcribes and detects the end of each turn with one model, so the
    # pipeline needs no VAD or turn analyzer. With detect_backchannels, the
    # backchannel model holds each turn Flux starts over Sam until it hears
    # whether it's a backchannel, which never becomes a turn.
    flux = BackchannelFluxSTTService if options.detect_backchannels else DeepgramFluxSTTService
    stt = flux(api_key=os.environ["DEEPGRAM_API_KEY"])

    # Reads each final transcription for the user's emotion and sarcasm, with
    # the bot's line before it. The LLM gets the reading at the head of the
    # user's message.
    tone_reader = PipecatToneReader()

    llm = build_llm(options)
    tts = build_tts(options)

    context = LLMContext(tools=TOOLS)
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        # Sam's greeting plays out before the user is heard, so noise or echo
        # as the call connects can't interrupt it or reach the LLM.
        user_params=LLMUserAggregatorParams(
            user_mute_strategies=[MuteUntilFirstBotCompleteUserMuteStrategy()],
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            tone_reader,
            user_aggregator,
            llm,
            # The LLM writes plain words; the tagger voices each sentence with the
            # tags the TTS performs. Without it, the LLM writes them.
            *([PipecatToneTagger()] if options.use_tagger else []),
            tts,
            # The phones of each word spoken, which shape the avatar's lips.
            PhoneTimer(),
            # The avatar's expression and reaction for each line, from Jev.
            *([AvatarDirector(context)] if os.getenv("TYPESAFE_API_KEY") else []),
            # Mouth shapes from the TTS audio, sent ahead of its playout. The relay,
            # after the transport, sends each batch to the client as it's due.
            LipsyncProcessor(),
            transport.output(),
            LipsyncMessageRelay(),
            assistant_aggregator,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
            enable_expressive_conversation=True,
            expression_policy=build_expression_policy(options.tts),
        ),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
        # The client lists each tool call with its arguments and result; the
        # default level sends only the call's ID.
        rtvi_observer_params=RTVIObserverParams(
            function_call_report_level={"*": RTVIFunctionCallReportLevel.FULL},
        ),
        # Shared with the tool handlers as params.app_resources
        app_resources=OrderStore(),
    )

    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)

    await runner.add_workers(worker)

    @worker.rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        context.add_message(
            {
                "role": "developer",
                "content": "Concisely greet the customer and ask how you can help with their order.",
            }
        )
        await worker.queue_frames([LLMRunFrame()])

    # The caller's mood across the call, for the client's mood panel.
    mood = MoodMeter()

    @user_aggregator.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message: UserTurnStoppedMessage):
        if message.perception:
            logger.info(f"Tone: {format_perception(message.perception)}")
            await worker.rtvi.send_server_message(mood.read(message.perception))

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        await runner.cancel()

    await runner.run()


def krisp_filter():
    """Krisp VIVA voice isolation on Pipecat Cloud, whose base image carries its SDK.

    None locally, where the SDK isn't available.
    """
    if importlib.util.find_spec("krisp_audio") is None:
        return None
    from pipecat.audio.filters.krisp_viva_filter import KrispVivaFilter

    return KrispVivaFilter()


async def bot(runner_args: RunnerArguments):
    """Main bot entry point."""
    transport_params = {
        "daily": lambda: DailyParams(
            audio_in_enabled=True, audio_in_filter=krisp_filter(), audio_out_enabled=True
        ),
        "webrtc": lambda: TransportParams(
            audio_in_enabled=True, audio_in_filter=krisp_filter(), audio_out_enabled=True
        ),
        # The `pipecat eval` harness, which connects to the dev runner's /ws route
        "eval": lambda: EvalTransportParams(audio_in_enabled=True, audio_out_enabled=True),
    }

    transport = await create_transport(runner_args, transport_params)

    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
