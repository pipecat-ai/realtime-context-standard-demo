"""Streaming backchannel analyzer: ONNX model + decision layer, numpy only.

This is the runtime that the Pipecat strategy wraps. Feed it audio and bot/VAD
events; it returns ``Decision`` events. A copy of ``bcdet/runtime/analyzer.py``
in pipecat-vap.

All timing is on the *audio clock* (seconds of audio consumed), not wall
clock, so offline evaluation and live behaviour match.
"""

from pathlib import Path

import numpy as np
import onnxruntime as ort

from .decision import BackchannelAnalyzerParams, Decision, DecisionState
from .model import ensure_model

SAMPLE_RATE = 16_000  # the model's input rate; other rates are resampled


class OnnxStreamingModel:
    def __init__(self, path: str | Path, threads: int = 1):
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
        self.inputs = self.session.get_inputs()
        self.input_names = [i.name for i in self.inputs]
        self.output_names = [o.name for o in self.session.get_outputs()]
        self.chunk_samples = int(self.inputs[0].shape[1])
        self.frames_per_chunk = int(self.inputs[1].shape[1])
        self.bot_state_dim = int(self.inputs[1].shape[2])
        self._state_shapes = [tuple(i.shape) for i in self.inputs[2:]]
        self.reset()

    def reset(self):
        self._state = [np.zeros(s, dtype=np.float32) for s in self._state_shapes]

    def step(
        self, chunk: np.ndarray, bot_state: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        feed = dict(
            zip(
                self.input_names,
                [
                    chunk[None, :].astype(np.float32),
                    bot_state[None].astype(np.float32),
                    *self._state,
                ],
            )
        )
        out = self.session.run(None, feed)
        self._state = out[3:]
        return out[0][0], out[1][0], out[2][0]


class BackchannelAnalyzer:
    """Audio in, verdicts out. Mirrors the training-time bot-state features online."""

    def __init__(
        self,
        model_path: str | Path | None = None,
        params: BackchannelAnalyzerParams | None = None,
        sample_rate: int = SAMPLE_RATE,
        threads: int = 1,
    ):
        self.model = OnnxStreamingModel(model_path or ensure_model(), threads)
        self.params = params or BackchannelAnalyzerParams()
        self.decision = DecisionState(self.params)
        self.frame_secs = self.model.chunk_samples / self.model.frames_per_chunk / SAMPLE_RATE
        self.set_sample_rate(sample_rate)
        self._buffer = np.zeros(0, dtype=np.float32)
        self._received = 0  # samples at 16 kHz appended so far (the audio clock)
        self._consumed = 0  # samples at 16 kHz fed to the model
        # Bot timeline (audio clock)
        self._bot_speaking = False
        self._bot_onset = None
        self._bot_stop = None
        self._bot_pause_end = None
        self._filler = False
        self.last_decision: Decision | None = None

    # -- clock & state ------------------------------------------------------

    @property
    def now(self) -> float:
        """Seconds of audio received: the time VAD and bot events refer to."""
        return self._received / SAMPLE_RATE

    def set_sample_rate(self, sample_rate: int):
        self._in_rate = sample_rate

    @property
    def pending(self) -> bool:
        """Whether an onset is awaiting a verdict."""
        return self.decision.pending

    @property
    def chunk_secs(self) -> float:
        return self.model.chunk_samples / SAMPLE_RATE

    def cancel_pending(self):
        """Drop the pending decision (e.g. a turn started by other means); keep model context."""
        self.decision.reset()

    def reset(self):
        """Full reset: model context, decision state and buffered audio."""
        self.model.reset()
        self.decision.reset()
        self._buffer = np.zeros(0, dtype=np.float32)

    def set_bot_speaking(self, speaking: bool):
        t = self.now
        if speaking and not self._bot_speaking:
            if self._bot_stop is not None and t - self._bot_stop >= 0.2:
                self._bot_pause_end = t
            self._bot_onset = t
        elif not speaking and self._bot_speaking:
            self._bot_stop = t
        self._bot_speaking = speaking
        self.decision.set_bot_speaking(speaking, t)

    def set_filler_playing(self, playing: bool):
        self._filler = playing

    def user_onset(self, backdate_secs: float = 0.0) -> bool:
        """VAD says the user started speaking ``backdate_secs`` ago. Returns whether a decision is pending."""
        return self.decision.user_onset(self.now - backdate_secs)

    def user_offset(self, backdate_secs: float = 0.0) -> Decision | None:
        d = self.decision.user_offset(self.now - backdate_secs)
        if d is not None:
            self.last_decision = d
        return d

    # -- audio --------------------------------------------------------------

    def _bot_state_row(self, t: float) -> np.ndarray:
        row = np.zeros(self.model.bot_state_dim, dtype=np.float32)
        clip = lambda x: min(x, 5.0) / 5.0
        if self._bot_speaking and self._bot_onset is not None:
            row[0] = 1.0
            row[1] = clip(t - self._bot_onset)
            row[2] = clip(t - self._bot_pause_end) if self._bot_pause_end is not None else 1.0
            row[3] = 0.0
        else:
            row[2] = clip(t - self._bot_pause_end) if self._bot_pause_end is not None else 1.0
            row[3] = clip(t - self._bot_stop) if self._bot_stop is not None else 1.0
        row[4] = 1.0 if self._filler else 0.0
        return row

    def append_audio(self, pcm: bytes | np.ndarray, num_channels: int = 1) -> list[Decision]:
        """Feed int16 PCM (bytes or array, interleaved if multi-channel) at the configured sample rate."""
        x = (
            np.frombuffer(pcm, dtype=np.int16)
            if isinstance(pcm, (bytes, bytearray))
            else np.asarray(pcm)
        )
        x = x.astype(np.float32) / 32768.0
        if num_channels > 1:
            x = x[: len(x) - len(x) % num_channels].reshape(-1, num_channels).mean(axis=1)
        if self._in_rate != SAMPLE_RATE:
            n_out = round(len(x) * SAMPLE_RATE / self._in_rate)
            x = np.interp(
                np.linspace(0, len(x), n_out, endpoint=False), np.arange(len(x)), x
            ).astype(np.float32)
        self._buffer = np.concatenate([self._buffer, x])
        self._received += len(x)
        decisions = []
        n = self.model.chunk_samples
        while len(self._buffer) >= n:
            chunk, self._buffer = self._buffer[:n], self._buffer[n:]
            t_start = self._consumed / SAMPLE_RATE
            bot = np.stack(
                [
                    self._bot_state_row(t_start + i * self.frame_secs)
                    for i in range(self.model.frames_per_chunk)
                ]
            )
            intent, _vad, _vap = self.model.step(chunk, bot)
            self._consumed += n
            for i in range(self.model.frames_per_chunk):
                t = t_start + (i + 1) * self.frame_secs
                d = self.decision.update(t, [float(v) for v in intent[i]])
                if d is not None:
                    self.last_decision = d
                    decisions.append(d)
        return decisions
