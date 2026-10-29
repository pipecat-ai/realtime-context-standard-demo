#
# Copyright (c) 2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""What Jev is asked about each line Sam speaks.

The expressions and reactions are the client avatar's (client/public/avatar/
animation.json): a held expression for the line, and a brief gesture over it.
"""

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
