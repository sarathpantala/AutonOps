#!/bin/bash
set -euo pipefail

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-user}"
POSTGRES_DB="${POSTGRES_DB:-autonops}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
UVICORN_RELOAD="${UVICORN_RELOAD:-false}"
UVICORN_WORKERS="${UVICORN_WORKERS:-1}"
APP_PORT="${PORT:-8000}"

# Wait until Postgres accepts connections.
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
  sleep 2
done

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  alembic upgrade head
fi

if [ "$UVICORN_RELOAD" = "true" ]; then
  exec uvicorn app.main:app --host 0.0.0.0 --port "$APP_PORT" --reload
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "$APP_PORT" --workers "$UVICORN_WORKERS"
