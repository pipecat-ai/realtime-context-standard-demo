"""Backchannel word lists, for transcripts the VAD never reported.

Generated from ``bcdet/labels/lexicon.yaml`` (version 3) in pipecat-vap.
Entries are matched after :func:`normalize`; multi-word entries match as whole
phrases.
"""

import re

VERSION = 3

CONTINUER = (
    "mmhmm",
    "mhmm",
    "mmhm",
    "mhm",
    "mmm",
    "hmmm",
    "uhhm",
    "mmk",
    "mkay",
    "mm",
    "hmm",
    "hm",
    "uhhuh",
    "uhhum",
    "umhum",
    "umhmm",
    "yeah",
    "yea",
    "yep",
    "yup",
    "yes",
    "ya",
    "right",
    "okay",
    "ok",
    "sure",
    "alright",
    "aha",
    "ah",
    "oh",
    "uh",
    "um",
    "true",
    "totally",
    "exactly",
    "absolutely",
    "definitely",
    "of course",
    "oh yeah",
    "yeah yeah",
    "okay yeah",
    "uh huh",
    "mm hmm",
    "i know",
    "i know right",
    "that's true",
    "for sure",
    "go on",
    "got it",
    "gotcha",
    "cool",
)

ASSESSMENT = (
    "oh right",
    "oh okay",
    "oh really",
    "oh wow",
    "oh no",
    "oh god",
    "oh my god",
    "oh my gosh",
    "wow",
    "really",
    "no way",
    "nice",
    "interesting",
    "i see",
    "that's funny",
    "that's crazy",
    "that's wild",
    "that's amazing",
    "that's great",
    "that's awesome",
    "that's good",
    "that's cool",
    "that's nice",
    "that's so true",
    "that's right",
    "that makes sense",
    "makes sense",
    "fair enough",
    "fair",
    "damn",
    "jeez",
    "gosh",
    "god",
    "geez",
    "dang",
    "whoa",
    "cool cool",
    "awesome",
    "amazing",
    "great",
    "good",
    "perfect",
    "lovely",
    "love it",
    "love that",
    "haha",
    "lol",
)

NEGATIVE = (
    "uhuh",
    "nuhuh",
    "mmmm",
    "mmm mm",
    "uh uh",
    "mmmm",
    "no",
    "nope",
    "nah",
    "no no",
    "no no no",
    "not really",
    "i don't think so",
    "hmm no",
)

_PUNCT = re.compile(r"[^a-z' ]+")


def normalize(text: str) -> str:
    """Lower-case, hyphens removed, punctuation stripped: "Mm-hmm." -> "mmhmm"."""
    text = text.lower().replace("-", "").replace("\u2019", "'")
    text = _PUNCT.sub(" ", text)
    return " ".join(text.split())


class Lexicon:
    def __init__(self):
        self.version = VERSION
        self.continuer = {normalize(p) for p in CONTINUER}
        self.assessment = {normalize(p) for p in ASSESSMENT}
        self.negative = {normalize(p) for p in NEGATIVE}
        # Single-word entries only: tokens of multi-word phrases ("love it")
        # must not make "it" a backchannel on its own.
        self.continuer_words = {p for p in self.continuer if " " not in p}
        self.assessment_words = {p for p in self.assessment if " " not in p}
        self.negative_words = {p for p in self.negative if " " not in p}

    def is_backchannel(self, text: str, negative: bool = False) -> bool:
        """Whether a transcript is only backchannel words ("Yeah.", "Uh-huh.", "oh wow").

        ``negative`` also accepts the negative entries ("no", "nope"), for apps
        that pass negatives through. Empty text is not a backchannel.
        """
        phrase = normalize(text)
        if not phrase:
            return False
        phrases = self.continuer | self.assessment
        words = self.continuer_words | self.assessment_words
        if negative:
            phrases |= self.negative
            words |= self.negative_words
        return phrase in phrases or all(t in words for t in phrase.split())
