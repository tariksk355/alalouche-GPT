# Backend local bootstrap (NestJS + Prisma + PostgreSQL)

This document is for reproducible local setup of the backend only.

## What this backend includes

- `GET /health`
- `GET /ready`
- Device pairing flow endpoints:
  - `POST /admin/device-pairing-codes`
  - `POST /devices/pairing-requests`
  - `GET /admin/device-pairing-requests`
  - `POST /admin/device-pairing-requests/:id/confirm`
  - `POST /devices/verify`
- Device-auth endpoints:
  - `GET /devices/me`
  - `GET /receiver/orders`
  - `POST /receiver/orders/:id/status`

Admin bearer auth is the intended admin path. The deprecated `x-admin-token` compatibility path is disabled in production and only works in non-production when `ALLOW_LEGACY_ADMIN_HEADERS=true`, and it still requires explicit tenant context via `x-restaurant-id`.


## Tenant resolution (Batch A)

Request-driven customer auth and reservation flows now resolve tenant context by:
- `primaryDomain` match from request host
- subdomain slug match (`TENANT_BASE_DOMAIN` optional)
- slug fallback (`:restaurantSlug`, `?restaurantSlug=...`, or `x-restaurant-slug`)

`DEFAULT_RESTAURANT_ID` is now reserved for local seed/dev fallback only, and the seed default primary restaurant id is `alalouche`.

Public config bootstrap endpoint:
- `GET /public/restaurant-config`
- `GET /public/restaurants/:restaurantSlug/config`

## Production hardening basics (Batch G)

### Required runtime env vars

- `DATABASE_URL` (always required)
- `AUTH_TOKEN_SECRET` (required in `NODE_ENV=production`)
- `MARKETING_EMAIL_PROVIDER` (`none` or `resend`; falls back to `EMAIL_PROVIDER` only for marketing backward compatibility)
- `MARKETING_EMAIL_FROM` (optional override; falls back to `EMAIL_FROM` for marketing)
- `RESEND_API_KEY` (required when marketing uses Resend)
- `TRANSACTIONAL_EMAIL_PROVIDER` (`none` or `smtp`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `SMTP_REPLY_TO` (optional)

For admin menu image upload (`POST /admin/menu-catalog/images/upload`), also configure:
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Optional upload/storage envs:
- `S3_PUBLIC_BASE_URL` (preferred stable public base; falls back to `https://<bucket>.<endpoint>/<key>`)
- `S3_FORCE_PATH_STYLE` (`true|false`, default `false`)
- `S3_UPLOAD_MAX_BYTES` (default `5242880` = 5MB)
- `S3_OBJECT_ACL` (default `public-read`)
- `S3_CACHE_CONTROL` (default `public, max-age=31536000, immutable`)

### Health endpoints

- Liveness: `GET /health`
  - returns HTTP 200 when the NestJS process is up
  - does **not** hit the database
  - response is concise and machine-friendly (`status`, `service`, `uptimeSeconds`, `timestamp`)
- Readiness: `GET /ready`
  - returns HTTP 200 only when the API can successfully execute a lightweight `SELECT 1` against PostgreSQL
  - returns HTTP 503 with a generic `NOT_READY` error if the database is unavailable
  - response stays concise and does not expose secrets or internal connection details

### Request correlation + logging

- Incoming `x-request-id` is accepted and echoed; if missing, server generates one.
- Responses include `x-request-id`.
- Structured request logs (`event=http_request`) are emitted with method/path/status/duration.
- Exception logs (`event=http_exception`) include requestId/method/path/status/error.

### Error response shape

Global exception filter now includes:
- `ok: false`
- `error`
- `message`
- `requestId`
- `timestamp`
- `path`

In production, 5xx messages are sanitized to avoid leaking internals.

---


## Email delivery provider (current slice)

- Backend email delivery boundary is `NotificationService` only.
- Admin bulk marketing emails use Resend via `MARKETING_EMAIL_PROVIDER` (`none` or `resend`).
- For backward compatibility during transition, marketing falls back to `EMAIL_PROVIDER` / `EMAIL_FROM` only when `MARKETING_EMAIL_PROVIDER` is unset.
- Transactional customer emails for order/reservation creation + status notifications use `TRANSACTIONAL_EMAIL_PROVIDER` (`none` or `smtp`).
- Transactional flow does **not** read `EMAIL_PROVIDER`; once split, SMTP config is the only active provider path for transactional sends.


## Production container usage

### Docker image behavior

- `backend/Dockerfile` builds and runs the NestJS app from `dist/`.
- Container entrypoint (`scripts/docker-entrypoint.sh`) runs `prisma migrate deploy` by default before starting the app.
- Set `RUN_DB_MIGRATIONS=false` to skip migrations at container startup (for dedicated migration/release jobs).

### Required production env vars

- `DATABASE_URL`
- `AUTH_TOKEN_SECRET`
- `NODE_ENV=production`
- `MARKETING_EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + (`MARKETING_EMAIL_FROM` or `EMAIL_FROM`) for admin bulk marketing
- `TRANSACTIONAL_EMAIL_PROVIDER=smtp` + `SMTP_HOST` + `SMTP_PORT` + `SMTP_SECURE` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` for transactional emails
- `RESTAURANT_CONTACT_EMAIL` when you want `npm run prisma:seed` to provision/update the primary restaurant contact email in DB (`Restaurant.contactInfo.email`) for restaurant notification recipients
- `INITIAL_ADMIN_USERNAME` + `INITIAL_ADMIN_PASSWORD` to explicitly bootstrap the first admin user during production seeding; `INITIAL_ADMIN_DISPLAY_NAME` is optional

### Example local container run

```bash
docker build -t alalouche-backend ./backend
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL='postgresql://user:pass@host:25060/db?sslmode=require' \
  -e AUTH_TOKEN_SECRET='change-me' \
  -e MARKETING_EMAIL_PROVIDER=resend \
  -e MARKETING_EMAIL_FROM='marketing@example.com' \
  -e RESEND_API_KEY='replace-me' \
  -e TRANSACTIONAL_EMAIL_PROVIDER=smtp \
  -e SMTP_HOST='smtp.example.com' \
  -e SMTP_PORT='587' \
  -e SMTP_SECURE='false' \
  -e SMTP_USER='smtp-user' \
  -e SMTP_PASS='smtp-pass' \
  -e SMTP_FROM='noreply@example.com' \
  alalouche-backend
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker + Docker Compose
- `curl` + `jq` (for smoke test)

---

## Copy-paste local setup (fresh machine)

Run all commands from `backend/`.

### 1) Start local PostgreSQL

```bash
npm run db:up
```

This starts `postgres:16-alpine` using `backend/docker-compose.yml` and exposes port `5432`.

### 2) Copy environment variables

```bash
cp .env.example .env
```

Defaults in `.env.example` are already aligned with local docker-compose PostgreSQL.

### 3) Install dependencies

```bash
npm install
```

### 4) Generate Prisma client

```bash
npm run prisma:generate
```

### 5) Apply schema migration/bootstrap on fresh DB

```bash
npm run prisma:migrate
```

> Script uses: `prisma migrate dev --name init`.

### 6) Seed local test data

```bash
npm run prisma:seed
```

To provision the primary restaurant notification email into the DB without manual editing:

```bash
RESTAURANT_CONTACT_EMAIL=operations@your-restaurant.tld npm run prisma:seed
```

To explicitly bootstrap the first production admin user during seed:

```bash
INITIAL_ADMIN_USERNAME=owner INITIAL_ADMIN_PASSWORD=choose-a-strong-password-here RESTAURANT_CONTACT_EMAIL=operations@your-restaurant.tld npm run prisma:seed
```

Seed creates:
- one primary restaurant (`DEFAULT_RESTAURANT_ID` when explicitly set for local/dev fallback, otherwise `alalouche`)
- an extra demo tenant only outside production by default (`SEED_INCLUDE_DEMO_TENANT=true` can force it)
- optional sample orders when `SEED_SAMPLE_ORDERS=true` (non-production only)

### 7) Start backend

```bash
npm run dev
```

Backend runs at `http://localhost:3000` by default.

---

## Local pairing smoke test

### Option A: one-command smoke script

With backend running in another terminal:

```bash
./scripts/smoke-test.sh
```

This executes:
1. `GET /health`
2. `GET /ready`
3. `POST /admin/auth/login`
4. `POST /admin/device-pairing-codes` (bearer auth)
5. `POST /devices/pairing-requests`
6. `GET /admin/device-pairing-requests`
7. `POST /admin/device-pairing-requests/:id/confirm`
8. `POST /devices/verify`
9. `GET /devices/me` and `GET /receiver/orders`

You can override defaults:

```bash
API_URL=http://localhost:3000 ADMIN_USERNAME=admin ADMIN_PASSWORD=admin1234 ./scripts/smoke-test.sh
```

### Option B: multi-tenant smoke script

With backend running in another terminal:

```bash
./scripts/smoke-test-multitenant.sh
```

This validates tenant isolation across two restaurants for:
- public config
- customer signup/login
- reservation + KPI isolation
- admin tenant scopes
- pairing legacy compatibility constraints
- explicit invalid tenant hint no-fallback behavior

> Note: the legacy pairing compatibility checks require the backend to be started with `ALLOW_LEGACY_ADMIN_HEADERS=true` in non-production.

---

## Legacy order customer-link backfill (safe, optional)

Orders created before `Order.customerId` linkage may only have `customerEmail`.

Use this script to backfill `Order.customerId` **only when mapping is unambiguous**
within the same tenant (`restaurantId + email`).

Dry-run (default):

```bash
npm run orders:backfill-customer-link
```

Apply updates:

```bash
npm run orders:backfill-customer-link -- --apply
```

Scope to one tenant:

```bash
npm run orders:backfill-customer-link -- --apply --restaurant-id=demo-restaurant
```

### Option B: manual curl sequence

```bash
export API=http://localhost:3000
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=admin1234
```

1) Liveness

```bash
curl -s "$API/health" | jq
```

2) Readiness

```bash
curl -s "$API/ready" | jq
```

3) Admin login + create pairing code

```bash
ADMIN_LOGIN_RESP=$(curl -s -X POST "$API/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"'$ADMIN_USERNAME'","password":"'$ADMIN_PASSWORD'"}')

ADMIN_BEARER=$(echo "$ADMIN_LOGIN_RESP" | jq -r '.data.token')

PAIRING_CODE_RESP=$(curl -s -X POST "$API/admin/device-pairing-codes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_BEARER" \
  -d '{"deviceName":"Sunmi Local Dev"}')

echo "$PAIRING_CODE_RESP" | jq
PAIRING_CODE=$(echo "$PAIRING_CODE_RESP" | jq -r '.data.code')
```

3) Create pairing request

```bash
PAIRING_REQUEST_RESP=$(curl -s -X POST "$API/devices/pairing-requests" \
  -H "Content-Type: application/json" \
  -d "{\"pairingCode\":\"$PAIRING_CODE\",\"deviceName\":\"Sunmi Dev Unit\",\"deviceModel\":\"V2\",\"platform\":\"android\",\"appVersion\":\"1.0.0\",\"installId\":\"dev-install-001\"}")

echo "$PAIRING_REQUEST_RESP" | jq
PAIRING_REQUEST_ID=$(echo "$PAIRING_REQUEST_RESP" | jq -r '.data.pairingRequestId')
```

4) Confirm pairing request

```bash
curl -s -X POST "$API/admin/device-pairing-requests/$PAIRING_REQUEST_ID/confirm" \
  -H "Authorization: Bearer $ADMIN_BEARER" | jq
```

5) Verify device and get token

```bash
VERIFY_RESP=$(curl -s -X POST "$API/devices/verify" \
  -H "Content-Type: application/json" \
  -d "{\"pairingRequestId\":\"$PAIRING_REQUEST_ID\"}")

echo "$VERIFY_RESP" | jq
DEVICE_TOKEN=$(echo "$VERIFY_RESP" | jq -r '.data.deviceToken')
```

6) Device self endpoint

```bash
curl -s "$API/devices/me" \
  -H "Authorization: Bearer $DEVICE_TOKEN" | jq
```

7) Receiver orders

```bash
curl -s "$API/receiver/orders" \
  -H "Authorization: Bearer $DEVICE_TOKEN" | jq
```

---

## Useful commands

```bash
npm run db:up
npm run db:down
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
npm run build
```
