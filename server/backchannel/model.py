"""Fetch the backchannel model from Hugging Face, once, before the bot needs it.

``ensure_model()`` returns a local path to the ONNX model:

1. ``model_path`` or ``BACKCHANNEL_MODEL`` set: that file, no download.
2. Already cached with the expected SHA-256: the cached file, no network.
3. Otherwise: downloaded from ``pipecat-ai/backchannel-detector`` at a pinned
   revision, checked against its SHA-256 and cached.

Downloads use ``HF_TOKEN`` if set, else the token saved by ``hf auth login``,
else none (anonymous, which works once the repo is public). Standard library
only; no ``huggingface_hub`` needed.
"""

import hashlib
import os
import urllib.error
import urllib.request
from pathlib import Path

from loguru import logger

REPO_ID = "pipecat-ai/backchannel-detector"
REVISION = "4896f4774cdf1a9c5b581b0cd4a0c4000e8bb854"
VARIANTS = {
    "fp32": (
        "backchannel-fp32.onnx",
        "3e5d47740e5f75211cc78c5df701be9afe7b76c4115144212a18598766909240",
    ),
    "int8": (
        "backchannel-int8.onnx",
        "668506592e7d8e115bcd7b9e6cd6bb17b058b1cbfeac33a2996d0a59e80c6d6c",
    ),
}


def default_cache_dir() -> Path:
    """``BACKCHANNEL_CACHE_DIR``, else ``~/.cache/pipecat-backchannel``."""
    env = os.getenv("BACKCHANNEL_CACHE_DIR")
    return Path(env).expanduser() if env else Path.home() / ".cache" / "pipecat-backchannel"


def ensure_model(
    variant: str = "fp32",
    *,
    model_path: str | Path | None = None,
    token: str | None = None,
    cache_dir: str | Path | None = None,
) -> Path:
    """Return a local path to the model, downloading it if needed.

    Args:
        variant: ``"fp32"`` (default) or ``"int8"``.
        model_path: A local .onnx file to use instead; overrides ``BACKCHANNEL_MODEL``.
        token: Hugging Face token; defaults to ``HF_TOKEN``, then the saved login.
        cache_dir: Where downloads go; defaults to :func:`default_cache_dir`.
    """
    local = model_path or os.getenv("BACKCHANNEL_MODEL")
    if local:
        path = Path(local).expanduser()
        if not path.is_file():
            raise FileNotFoundError(f"Backchannel model {path} does not exist")
        return path

    if variant not in VARIANTS:
        raise ValueError(f"variant must be one of {sorted(VARIANTS)}, got {variant!r}")
    filename, sha256 = VARIANTS[variant]
    path = Path(cache_dir or default_cache_dir()).expanduser() / REVISION[:12] / filename
    if path.is_file() and _sha256(path.read_bytes()) == sha256:
        return path

    url = f"https://huggingface.co/{REPO_ID}/resolve/{REVISION}/{filename}"
    logger.info(f"Downloading backchannel model {REPO_ID}/{filename} to {path}")
    data = _download(url, token or _saved_token())
    if _sha256(data) != sha256:
        raise RuntimeError(f"{url} does not match the expected SHA-256; not using it")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{filename}.{os.getpid()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)  # atomic, so concurrent starts never see half a file
    return path


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _saved_token() -> str | None:
    """``HF_TOKEN``, else the token file ``hf auth login`` writes, else None."""
    if os.getenv("HF_TOKEN"):
        return os.environ["HF_TOKEN"]
    hf_home = Path(os.getenv("HF_HOME") or Path.home() / ".cache" / "huggingface").expanduser()
    token_path = Path(os.getenv("HF_TOKEN_PATH") or hf_home / "token").expanduser()
    try:
        return token_path.read_text().strip() or None
    except OSError:
        return None


def _download(url: str, token: str | None) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "pipecat-backchannel"})
    if token:
        # Unredirected: sent to huggingface.co only, never to the CDN it redirects to.
        request.add_unredirected_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 404):
            fix = (
                "check that the token can read the pipecat-ai org"
                if token
                else "set HF_TOKEN to a token that can read the pipecat-ai org"
            )
            raise RuntimeError(
                f"Could not download {url} (HTTP {e.code}): {fix}, "
                "or set BACKCHANNEL_MODEL to a local .onnx file"
            ) from e
        raise
