# DigitalOcean deployment guide (container-first baseline)

This guide documents the current production packaging for this repository.

## What is ready now

- Backend production image: `backend/Dockerfile`
- Frontend production image: `frontend/Dockerfile`
- Backend startup migration hook: `RUN_DB_MIGRATIONS` + `prisma migrate deploy`
- Health endpoints for probes:
  - Backend: `GET /health` (process up), `GET /ready` (process up + DB reachable)
  - Frontend (nginx): `GET /health`

## Backend deployment (App Platform or Droplet)

### Build

```bash
docker build -t alalouche-backend ./backend
```

### Runtime env (minimum)

- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL` (Managed PostgreSQL connection string, typically with SSL)
- `AUTH_TOKEN_SECRET` (strong unique secret, at least 32 characters)
- `CORS_ALLOWED_ORIGINS` (comma-separated explicit browser origins, e.g. `https://orders.example.com`)
- `MARKETING_EMAIL_PROVIDER=none|resend` (`EMAIL_PROVIDER` remains a marketing-only fallback during transition)
- `RESEND_API_KEY`
- `MARKETING_EMAIL_FROM` or fallback `EMAIL_FROM` when marketing uses Resend
- `TRANSACTIONAL_EMAIL_PROVIDER=none|smtp`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `SMTP_REPLY_TO` (optional)

Optional:
- `RUN_DB_MIGRATIONS=true|false` (default `true`)
- `TENANT_BASE_DOMAIN`
- `DEFAULT_RESTAURANT_ID` (dev fallback only; leave unset in production)

### Run (example)

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL='postgresql://user:pass@db-host:25060/db?sslmode=require' \
  -e AUTH_TOKEN_SECRET='replace-with-a-long-random-secret-of-at-least-32-chars' \
  -e CORS_ALLOWED_ORIGINS='https://orders.example.com' \
  -e MARKETING_EMAIL_PROVIDER=resend \
  -e MARKETING_EMAIL_FROM='marketing@orders.example.com' \
  -e RESEND_API_KEY='replace-with-resend-api-key' \
  -e TRANSACTIONAL_EMAIL_PROVIDER=smtp \
  -e SMTP_HOST='smtp.example.com' \
  -e SMTP_PORT='587' \
  -e SMTP_SECURE='false' \
  -e SMTP_USER='smtp-user' \
  -e SMTP_PASS='smtp-password' \
  -e SMTP_FROM='noreply@orders.example.com' \
  alalouche-backend
```

### Migrations strategy

Current baseline strategy is `prisma migrate deploy` at container startup via entrypoint.

- keep `RUN_DB_MIGRATIONS=true` for simple single-instance deployments
- set `RUN_DB_MIGRATIONS=false` when you introduce a separate pre-deploy/release migration job
- for multiple app replicas, prefer a separate one-off migration job to avoid concurrent startup migration attempts

## Frontend deployment (App Platform or Droplet)

### Build

```bash
docker build \
  --build-arg VITE_API_BASE_URL='https://api.orders.example.com' \
  -t alalouche-frontend ./frontend
```

### Runtime

The frontend image serves static assets via nginx on port `80`.

- Health endpoint: `GET /health`
- SPA fallback is configured (`try_files ... /index.html`)

### Run (example)

```bash
docker run --rm -p 8080:80 alalouche-frontend
```

## Managed PostgreSQL notes

- Prefer managed DB TLS by setting `sslmode=require` in `DATABASE_URL`.
- Ensure the backend app can reach the managed DB network endpoint.
- Run `prisma migrate deploy` against production DB before or during app startup.

## Future DOKS/K8s evolution (not in this slice)

- Split migrations into a dedicated Job/Release phase.
- Add separate liveness/readiness probes in manifests.
- Add secret manager integration and rotation policies.
- Add HPA/autoscaling and rolling update policies.


## First deployment smoke test (operator checklist)

Use the helper script from repo root:

```bash
BACKEND_ENV_FILE=/absolute/path/to/backend.prod.env \
FRONTEND_API_BASE_URL='https://api.orders.example.com' \
./scripts/smoke-test-docker-deploy.sh
```

The env file should include at least:
- `DATABASE_URL`
- `AUTH_TOKEN_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `MARKETING_EMAIL_PROVIDER` / `MARKETING_EMAIL_FROM` / `RESEND_API_KEY` for admin bulk marketing
- `TRANSACTIONAL_EMAIL_PROVIDER` plus SMTP vars for order/reservation emails

The smoke script validates:
- backend image builds
- frontend image builds
- backend container boots and passes `/health` (basic liveness) and `/ready` (DB readiness)
- frontend container serves `/health`
- frontend SPA fallback returns HTTP 200 for non-existent routes

If it fails, inspect container logs:

```bash
docker logs alalouche-backend-smoke
docker logs alalouche-frontend-smoke
```


## Single-server deployment with docker compose (Droplet/EC2)

A root-level `docker-compose.yml` is included for practical single-server orchestration of:
- `frontend` (nginx static SPA)
- `backend` (NestJS + Prisma migrations at startup by default)
- `postgres` (single-server DB container with persistent volume)
- `redis` (internal helper service for narrow caching and rate limiting only)

Redis remains internal to the compose network and is used only as a helper layer. PostgreSQL remains the source of truth.

### Prepare env

```bash
cp deploy/env/compose.env.example deploy/env/compose.env
# then edit deploy/env/compose.env with real production values
```

### Start stack

```bash
docker compose --env-file deploy/env/compose.env up -d --build
```

### Smoke-check endpoints

```bash
curl -fsS http://127.0.0.1:${BACKEND_PORT:-3000}/health
curl -fsS http://127.0.0.1:${BACKEND_PORT:-3000}/ready
curl -fsS http://127.0.0.1:${FRONTEND_PORT:-80}/health
```

### Logs / status

```bash
docker compose --env-file deploy/env/compose.env ps
docker compose --env-file deploy/env/compose.env logs -f backend frontend postgres redis
```

