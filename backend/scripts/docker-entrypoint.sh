#!/bin/sh
set -e

if [ "${RUN_DB_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "[entrypoint] Skipping migrations (RUN_DB_MIGRATIONS=${RUN_DB_MIGRATIONS})"
fi

echo "[entrypoint] Starting application..."
exec "$@"
