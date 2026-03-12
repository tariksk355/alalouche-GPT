#!/bin/sh
set -e

if [ "${RUN_DB_MIGRATIONS:-true}" = "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[entrypoint] DATABASE_URL is required when RUN_DB_MIGRATIONS=true" >&2
    exit 1
  fi
  echo "[entrypoint] Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "[entrypoint] Skipping migrations (RUN_DB_MIGRATIONS=${RUN_DB_MIGRATIONS})"
fi

echo "[entrypoint] Starting application..."
exec "$@"
