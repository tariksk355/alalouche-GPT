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

Admin auth is intentionally stubbed with `x-admin-token` for local flow execution.

---

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
2. `POST /admin/device-pairing-codes`
3. `POST /devices/pairing-requests`
4. `POST /admin/device-pairing-requests/:id/confirm`
5. `POST /devices/verify`
6. `GET /devices/me`
7. `GET /receiver/orders`

You can override defaults:

```bash
API_URL=http://localhost:3000 ADMIN_TOKEN=dev-admin ./scripts/smoke-test.sh
```

### Option B: manual curl sequence

```bash
export API=http://localhost:3000
export ADMIN_TOKEN=dev-admin
```

1) Health

```bash
curl -s "$API/health" | jq
```

2) Create pairing code

```bash
PAIRING_CODE_RESP=$(curl -s -X POST "$API/admin/device-pairing-codes" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
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
  -H "x-admin-token: $ADMIN_TOKEN" | jq
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
