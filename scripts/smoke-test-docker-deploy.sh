#!/usr/bin/env bash
set -euo pipefail

BACKEND_IMAGE="${BACKEND_IMAGE:-alalouche-backend:smoke}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-alalouche-frontend:smoke}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-}"
FRONTEND_API_BASE_URL="${FRONTEND_API_BASE_URL:-https://api.smoke.invalid}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[smoke] docker not found in PATH" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[smoke] curl not found in PATH" >&2
  exit 1
fi

if [[ -z "$BACKEND_ENV_FILE" ]]; then
  echo "[smoke] BACKEND_ENV_FILE is required (path to env file with DATABASE_URL and AUTH_TOKEN_SECRET at minimum)" >&2
  exit 1
fi

if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
  echo "[smoke] BACKEND_ENV_FILE does not exist: $BACKEND_ENV_FILE" >&2
  exit 1
fi

cleanup() {
  docker rm -f alalouche-backend-smoke >/dev/null 2>&1 || true
  docker rm -f alalouche-frontend-smoke >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[smoke] Building backend image: $BACKEND_IMAGE"
docker build -t "$BACKEND_IMAGE" ./backend

echo "[smoke] Building frontend image: $FRONTEND_IMAGE"
docker build --build-arg VITE_API_BASE_URL="$FRONTEND_API_BASE_URL" -t "$FRONTEND_IMAGE" ./frontend

echo "[smoke] Starting backend container"
docker run -d --name alalouche-backend-smoke \
  --env-file "$BACKEND_ENV_FILE" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -p "$BACKEND_PORT":3000 \
  "$BACKEND_IMAGE" >/dev/null

echo "[smoke] Waiting for backend /health"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
  if [[ "$i" == "60" ]]; then
    echo "[smoke] backend /health did not become ready in time" >&2
    docker logs alalouche-backend-smoke || true
    exit 1
  fi
done

echo "[smoke] Checking backend /ready"
curl -fsS "http://127.0.0.1:${BACKEND_PORT}/ready" >/dev/null

echo "[smoke] Starting frontend container"
docker run -d --name alalouche-frontend-smoke \
  -p "$FRONTEND_PORT":80 \
  "$FRONTEND_IMAGE" >/dev/null

echo "[smoke] Checking frontend /health"
curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/health" >/dev/null

echo "[smoke] Checking frontend SPA fallback"
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${FRONTEND_PORT}/some/non-existent-route")
if [[ "$code" != "200" ]]; then
  echo "[smoke] expected SPA fallback status 200, got $code" >&2
  exit 1
fi

echo "[smoke] PASS: backend and frontend containers responded as expected"
