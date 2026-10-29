FROM dailyco/pipecat-base:latest

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy

# Install the project's dependencies using the lockfile and settings
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

# The models each call would otherwise download from Hugging Face as it starts,
# holding Sam's greeting: the Tone reader and tagger, and the backchannel model.
# Calls load these copies and never ask Hugging Face.
ENV HF_HOME=/app/models/huggingface \
    BACKCHANNEL_CACHE_DIR=/app/models/backchannel
COPY ./backchannel backchannel
COPY ./prefetch.py prefetch.py
RUN /app/.venv/bin/python prefetch.py
ENV HF_HUB_OFFLINE=1

# Copy the application code: the bot and the modules it imports
COPY ./bot.py bot.py
COPY ./tools.py tools.py
COPY ./meter.py meter.py
COPY ./demo.py demo.py
COPY ./cold_start.py cold_start.py
COPY ./avatar avatar
COPY ./lipsync lipsync
