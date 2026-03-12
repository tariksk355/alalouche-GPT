# Backend local bootstrap (NestJS + Prisma + PostgreSQL)

This document is for reproducible local setup of the backend only.

## What this backend includes

- `GET /health`
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

Admin bearer auth is required in production paths. `x-admin-token` remains as a deprecated non-production compatibility path and always requires explicit tenant context (`x-restaurant-id`).


## Tenant resolution (Batch A)

Request-driven customer auth and reservation flows now resolve tenant context by:
- `primaryDomain` match from request host
- subdomain slug match (`TENANT_BASE_DOMAIN` optional)
- slug fallback (`:restaurantSlug`, `?restaurantSlug=...`, or `x-restaurant-slug`)

`DEFAULT_RESTAURANT_ID` is now reserved for local seed/dev fallback only.

Public config bootstrap endpoint:
- `GET /public/restaurant-config`
- `GET /public/restaurants/:restaurantSlug/config`

## Production hardening basics (Batch G)

### Required runtime env vars

- `DATABASE_URL` (always required)
- `AUTH_TOKEN_SECRET` (required in `NODE_ENV=production`)
- `EMAIL_PROVIDER` (`none` or `resend`; defaults to `none`)
- `RESEND_API_KEY` (required when `EMAIL_PROVIDER=resend`)
- `EMAIL_FROM` (required when `EMAIL_PROVIDER=resend`)

### Health endpoints

- Liveness: `GET /health`
- Readiness: `GET /ready` (includes a lightweight DB check)

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
- Supported `EMAIL_PROVIDER` values: `none` and `resend`.
- Legacy webhook provider path has been removed in favor of explicit Resend-only provider wiring for active sends.
- Marketing sends and transactional status notifications both use Resend when enabled.

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

Seed creates:
- one default restaurant (`DEFAULT_RESTAURANT_ID`)
- optional sample orders when `SEED_SAMPLE_ORDERS=true`

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
2. `POST /admin/auth/login`
3. `POST /admin/device-pairing-codes` (bearer auth)
4. `POST /devices/pairing-requests`
5. `GET /admin/device-pairing-requests`
6. `POST /admin/device-pairing-requests/:id/confirm`
7. `POST /devices/verify`
8. `GET /devices/me` and `GET /receiver/orders`

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

1) Health

```bash
curl -s "$API/health" | jq
```

2) Admin login + create pairing code

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
