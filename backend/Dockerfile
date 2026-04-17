FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    postgresql-client \
    libssl3 \
    libffi8 && \
    rm -rf /var/lib/apt/lists/*

FROM base AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    libffi-dev && \
    rm -rf /var/lib/apt/lists/* && \
    python -m venv /opt/venv

# Copy only dependency manifest first so pip layer is cached across code changes
COPY pyproject.toml README.md ./
RUN pip install --upgrade pip && \
    pip install --no-cache-dir hatchling && \
    pip install --no-cache-dir .

# Copy source after deps are installed
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

FROM builder AS dev-builder

RUN pip install --no-cache-dir ".[dev]"

FROM base AS runtime

ENV ENVIRONMENT=production \
    UVICORN_RELOAD=false

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app /app
COPY start.sh /start.sh

RUN chmod +x /start.sh

EXPOSE 8000

CMD ["/start.sh"]

FROM runtime AS dev

ENV ENVIRONMENT=development \
    UVICORN_RELOAD=true

COPY --from=dev-builder /opt/venv /opt/venv
