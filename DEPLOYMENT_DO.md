# DigitalOcean deployment guide (container-first baseline)

This guide documents the current production packaging for this repository.

## What is ready now

- Backend production image: `backend/Dockerfile`
- Frontend production image: `frontend/Dockerfile`
- Backend startup migration hook: `RUN_DB_MIGRATIONS` + `prisma migrate deploy`
- Health endpoints for probes:
  - Backend: `GET /health`, `GET /ready`
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
- `AUTH_TOKEN_SECRET`
- `EMAIL_PROVIDER=none|resend`
- `RESEND_API_KEY` and `EMAIL_FROM` if `EMAIL_PROVIDER=resend`

Optional:
- `RUN_DB_MIGRATIONS=true|false` (default `true`)
- `TENANT_BASE_DOMAIN`
- `DEFAULT_RESTAURANT_ID` (dev fallback only)

### Run (example)

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL='postgresql://user:pass@db-host:25060/db?sslmode=require' \
  -e AUTH_TOKEN_SECRET='replace-me' \
  -e EMAIL_PROVIDER=none \
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
docker build -t alalouche-frontend ./frontend
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
