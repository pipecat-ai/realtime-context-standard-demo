"""Decision layer: per-frame intent probabilities -> verdict events.

Pure Python, no numpy. A copy of ``bcdet/runtime/decision.py`` in pipecat-vap,
which the offline evaluator uses; ``tests/test_dropin.py`` there keeps the two
in step.

Two commit policies (``BackchannelAnalyzerParams.backchannel_commit``):

- ``on_stop`` (default): while the user talks, only a floor-take can commit.
  A backchannel is called once the user stops, from what the model heard by
  then; still talking at ``max_backchannel_secs`` is a floor-take. There is no
  decision deadline, so nothing is handed to the transcript mid-segment.
- ``early``: a backchannel commits as soon as the model is confident, which in
  practice is ~120 ms after onset, before the first word ends. "Yeah, but..."
  then stays a backchannel until the backstop. Kept for comparison.
"""

from dataclasses import dataclass, field
from enum import Enum

# The model's intent head, in output order.
INTENT_CLASSES = ("continuer", "assessment", "negative", "floor_take", "non_speech")
INTENT_INDEX = {name: i for i, name in enumerate(INTENT_CLASSES)}
BACKCHANNEL_CLASSES = ("continuer", "assessment")
FLOOR_CLASSES = ("negative", "floor_take")


class Verdict(str, Enum):
    UNDECIDED = "undecided"
    BACKCHANNEL = "backchannel"
    FLOOR_TAKE = "floor_take"


@dataclass(frozen=True)
class BackchannelAnalyzerParams:
    # When to evaluate
    bot_tail_secs: float = 0.3
    # Timing
    min_onset_secs: float = 0.08
    decision_deadline_secs: float = 0.35  # early only
    max_backchannel_secs: float = 1.2  # still talking this long after onset -> floor-take
    # Thresholds
    floor_take_threshold: float = 0.7
    backchannel_threshold: float = 0.7  # early: commit a backchannel mid-segment
    stop_backchannel_threshold: float = 0.7  # on_stop: swallow the segment when the user stops
    confirm_frames: int = 2  # consecutive model frames (20 ms each)
    # Policy
    backchannel_commit: str = "on_stop"  # on_stop | early
    passthrough_types: frozenset[str] = frozenset(BACKCHANNEL_CLASSES)
    undecided: str = "defer"  # defer | interrupt | continue
    smoothing: float = 0.5  # EMA over frames; 1.0 = no smoothing


@dataclass
class Decision:
    verdict: Verdict
    intent: str | None
    confidence: float
    secs_since_onset: float
    revoked: bool = False  # a BACKCHANNEL verdict withdrawn by the backstop
    reason: str = "model"  # model | user_stopped | backstop | deadline


@dataclass
class _Pending:
    onset: float
    user_speaking: bool = True
    verdict: Verdict = Verdict.UNDECIDED
    intent: str | None = None
    floor_run: int = 0
    bc_run: int = 0
    smoothed: list[float] = field(default_factory=lambda: [0.0] * len(INTENT_CLASSES))
    committed_at: float | None = None
    deadline_fired: bool = False


class DecisionState:
    """State machine for one analyzer. Times are seconds on the audio clock."""

    def __init__(self, params: BackchannelAnalyzerParams | None = None):
        self.params = params or BackchannelAnalyzerParams()
        if self.params.backchannel_commit not in ("on_stop", "early"):
            raise ValueError(
                f"backchannel_commit must be 'on_stop' or 'early', got {self.params.backchannel_commit!r}"
            )
        self._pending: _Pending | None = None
        self._bot_speaking = False
        self._bot_stopped_at: float | None = None

    @property
    def pending(self) -> bool:
        return self._pending is not None

    def reset(self):
        self._pending = None

    def set_bot_speaking(self, speaking: bool, t: float):
        if self._bot_speaking and not speaking:
            self._bot_stopped_at = t
        self._bot_speaking = speaking

    def _bot_context(self, t: float) -> bool:
        if self._bot_speaking:
            return True
        return (
            self._bot_stopped_at is not None
            and t - self._bot_stopped_at <= self.params.bot_tail_secs
        )

    def user_onset(self, t: float) -> bool:
        """Start a pending decision if the onset overlaps bot speech. Returns whether it did."""
        if not self._bot_context(t):
            self._pending = None
            return False
        self._pending = _Pending(onset=t)
        return True

    def user_offset(self, t: float) -> Decision | None:
        p = self._pending
        if p is None:
            return None
        p.user_speaking = False
        if p.verdict != Verdict.UNDECIDED:
            return None
        if self.params.backchannel_commit == "early":
            if p.bc_run > 0 and self._passes(p.intent):
                # Went quiet with a backchannel-looking segment: commit it.
                return self._commit(p, Verdict.BACKCHANNEL, t, "user_stopped")
            return None
        if p.intent is None:
            return None  # stopped before the model had a say
        _, p_bc = self._masses(p.smoothed)
        if p_bc >= self.params.stop_backchannel_threshold:
            return self._commit(p, Verdict.BACKCHANNEL, t, "user_stopped")
        if p.intent == "non_speech":
            return None  # a cough or a click: let the caller's undecided path handle it
        # Short, and not confidently a backchannel ("no", "wait"): interrupt now.
        d = self._commit(p, Verdict.FLOOR_TAKE, t, "user_stopped")
        self._pending = None
        return d

    def _passes(self, intent: str | None) -> bool:
        return intent is not None and intent in self.params.passthrough_types

    def _masses(self, smoothed: list[float]) -> tuple[float, float]:
        """(p_floor, p_backchannel) of a smoothed frame under the passthrough policy."""
        p_floor = sum(smoothed[INTENT_INDEX[c]] for c in FLOOR_CLASSES)
        p_bc = sum(smoothed[INTENT_INDEX[c]] for c in self.params.passthrough_types)
        # Negative counts as a floor-take unless the app passes it through.
        if "negative" in self.params.passthrough_types:
            p_floor -= smoothed[INTENT_INDEX["negative"]]
        return p_floor, p_bc

    def _commit(self, p: _Pending, verdict: Verdict, t: float, reason: str = "model") -> Decision:
        p.verdict = verdict
        p.committed_at = t
        conf = max(p.smoothed) if p.smoothed else 0.0
        return Decision(verdict, p.intent, conf, t - p.onset, reason=reason)

    def update(self, t: float, probs: list[float]) -> Decision | None:
        """Feed one model frame ending at time ``t``. Returns a decision event or None."""
        p = self._pending
        if p is None:
            return None
        a = self.params.smoothing
        p.smoothed = [a * x + (1 - a) * s for x, s in zip(probs, p.smoothed)]
        since = t - p.onset

        on_stop = self.params.backchannel_commit == "on_stop"
        # Backstop: still talking long after onset, after a backchannel verdict
        # (early) or without any verdict (on_stop). Backchannels are short.
        if (
            p.user_speaking
            and since >= self.params.max_backchannel_secs
            and (p.verdict == Verdict.BACKCHANNEL or (on_stop and p.verdict == Verdict.UNDECIDED))
        ):
            revoked = p.verdict == Verdict.BACKCHANNEL
            p.verdict = Verdict.FLOOR_TAKE
            d = Decision(
                Verdict.FLOOR_TAKE, "floor_take", 1.0, since, revoked=revoked, reason="backstop"
            )
            self._pending = None
            return d
        if p.verdict != Verdict.UNDECIDED or since < self.params.min_onset_secs:
            return None

        best = max(range(len(p.smoothed)), key=lambda i: p.smoothed[i])
        p.intent = INTENT_CLASSES[best]
        p_floor, p_bc = self._masses(p.smoothed)

        p.floor_run = p.floor_run + 1 if p_floor >= self.params.floor_take_threshold else 0
        p.bc_run = p.bc_run + 1 if p_bc >= self.params.backchannel_threshold else 0

        if p.floor_run >= self.params.confirm_frames:
            d = self._commit(p, Verdict.FLOOR_TAKE, t)
            self._pending = None
            return d
        if on_stop:
            return None  # backchannels wait for the user to stop; no deadline
        if p.bc_run >= self.params.confirm_frames:
            return self._commit(p, Verdict.BACKCHANNEL, t)

        if since >= self.params.decision_deadline_secs and not p.deadline_fired:
            p.deadline_fired = True
            if self.params.undecided == "interrupt":
                d = self._commit(p, Verdict.FLOOR_TAKE, t, "deadline")
                self._pending = None
                return d
            if self.params.undecided == "continue":
                return self._commit(p, Verdict.BACKCHANNEL, t, "deadline")
            return Decision(Verdict.UNDECIDED, p.intent, max(p.smoothed), since, reason="deadline")
        return None
