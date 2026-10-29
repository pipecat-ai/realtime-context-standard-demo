#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""What Jev is asked about each line Sam speaks, and about what the customer says as Sam listens.

The expressions and reactions are the client avatar's (client/public/avatar/
animation.json): a held expression, and a brief gesture over it.
"""

from pipecat.processors.aggregators.llm_context import LLMContext
from typesafe_sdk import Choice

SAM = (
    "Sam, a friendly customer service agent for Northwind Outfitters, an outdoor gear "
    "shop, talking with a customer on a voice call. Sam's face is shown while Sam speaks."
)

EXPRESSIONS = {
    "neutral": "Plain and attentive: asking for details, or giving facts with no feeling either way.",
    "happy": "Warm and friendly: a greeting, thanks, a goodbye, or good news said calmly.",
    "excited": "Bright and enthusiastic: news Sam is delighted to share, said with energy.",
    "thinking": (
        "Working something out: weighing options, unsure, or asking which of several things "
        "the customer means."
    ),
    "upset": "Sympathetic or apologetic: sorry for a problem, or giving news the customer won't like.",
    "lose": "Deflated: disappointed along with the customer about something that went wrong.",
    "scheming": "Sly and playful: teasing, or hinting at a nice surprise.",
    "angry": "Indignant on the customer's behalf. Sam is never angry at the customer.",
    "win": "Triumphant: celebrating that something is done or solved.",
}

REACTIONS = {
    "none": "No gesture, as for most lines.",
    "nod": "A nod: agreeing, confirming, or saying yes or that something is done.",
    "shake": "A shake of the head: saying no, can't, or that something isn't possible.",
    "laugh": "A laugh: Sam is amused, or laughing along with the customer's joke.",
    "shocked": "A start of surprise: Sam is taken aback, as in 'oh no!' or 'wow'.",
    "sigh": "A sigh: weary sympathy, or resignation about bad news.",
    "wink": "A wink: a playful, knowing aside.",
}

NOTHING_SAID = "(nothing yet: Sam is starting the call)"
FIRST_LINE = "(nothing: this is the first line of Sam's reply)"


def last_said(context: LLMContext, role: str) -> str:
    """The conversation's last message from `role` ("user" or "assistant"), as text.

    The customer's starts with how they sounded, which the Tone reader adds.
    """
    for message in reversed(context.get_messages()):
        if not isinstance(message, dict) or message.get("role") != role:
            continue
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            ).strip()
    return ""


def cue_state(customer_said: str, said_before: list[str], line: str) -> dict:
    """The call as Jev sees it when Sam is about to say `line`."""
    return {
        "sam": SAM,
        "customer_said": customer_said or NOTHING_SAID,
        "sam_said_before": " ".join(said_before) or FIRST_LINE,
        "line": line,
    }


def cue_questions() -> dict[str, Choice]:
    """The expression Sam's face holds for the line, and a gesture over it."""
    situation = (
        "Sam is about to say `line` aloud, after `sam_said_before` in the same reply, "
        "answering `customer_said`, which may start with how the customer sounded. "
    )
    return {
        "expression": Choice(
            instructions=situation + "Which expression should Sam's face show while saying `line`?",
            criteria=EXPRESSIONS,
        ),
        "reaction": Choice(
            instructions=situation
            + "Should Sam's face also make a brief gesture while saying `line`, and which?",
            criteria=REACTIONS,
        ),
    }


LISTENER = (
    "Sam, a friendly customer service agent for Northwind Outfitters, an outdoor gear shop, "
    "on a voice call. The customer is talking and Sam is listening; Sam's face is shown."
)

# What a listener's face does at what was just said: for most of it, nothing.
LISTENING_REACTIONS = {
    "none": "Nothing beyond listening, as for almost everything a customer says.",
    "shocked": (
        "A start of alarm or astonishment: the newest words reveal something startling, "
        "dangerous or wildly wrong, like a fire, an injury, an accident, or something absurd."
    ),
    "laugh": "A laugh: the newest words are a joke, or something the customer means to be funny.",
    "shake": (
        "A slow, sympathetic shake of the head: the newest words tell of something unfair or "
        "unacceptable done to the customer, like being charged twice or ignored for weeks."
    ),
}

LISTENING_FACES = {
    "neutral": "Attentive: the customer explains, asks for something, or gives details.",
    "happy": "Warm: the customer is friendly, thanks Sam, jokes, or shares good news.",
    "upset": "Concerned: the customer describes a real problem, a loss, or a frustration.",
    "thinking": (
        "Concentrating: the customer asks something Sam will have to work out, or reels off "
        "numbers and details to take in."
    ),
}

NOTHING_BEFORE = "(nothing: these are the first words of the customer's turn)"


def listen_state(sam_said: str, heard_before: str, newest: str) -> dict:
    """The call as Jev sees it while the customer is saying `newest`."""
    return {
        "sam": LISTENER,
        "sam_said": sam_said or NOTHING_SAID,
        "customer_said_before": heard_before or NOTHING_BEFORE,
        "newest": newest,
    }


def listen_questions() -> dict[str, Choice]:
    """A reaction to the customer's newest words, and the face Sam listens with."""
    situation = (
        "The customer is still talking, answering `sam_said`. They have said "
        "`customer_said_before`, and just now `newest`. "
    )
    return {
        "reaction": Choice(
            instructions=situation
            + "Should Sam's face react to `newest` right now, as a listener would, and how?",
            criteria=LISTENING_REACTIONS,
        ),
        "face": Choice(
            instructions=situation + "Which expression should Sam's face hold while listening?",
            criteria=LISTENING_FACES,
        ),
    }
