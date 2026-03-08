# Backend (NestJS + Prisma)

This backend is a standalone NestJS service for the first migration slice:
- health
- device pairing lifecycle
- device verification + token issuance
- device-authenticated receiver endpoints

## 1) Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 14+

## 2) Environment variables

Copy `.env.example` to `.env` and adjust values:

```bash
cp .env.example .env
```

Required variables:

- `PORT` — API port (default `3000`)
- `DATABASE_URL` — PostgreSQL connection string
- `ADMIN_TOKEN` — temporary admin stub token used via `x-admin-token` header
- `DEFAULT_RESTAURANT_ID` — default restaurant id for locally generated pairing codes

## 3) Local database setup

Example with local PostgreSQL:

```sql
CREATE DATABASE alalouche;
```

No manual table SQL is required; Prisma creates schema via `db push`.

## 4) Install + Prisma + build + run

From `backend/`:

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run build
npm run start:dev
```

- `start:dev` runs `ts-node src/main.ts`
- API base URL: `http://localhost:3000`

## 5) Endpoints in this slice

- `GET /health`
- `POST /admin/device-pairing-codes`
- `POST /devices/pairing-requests`
- `GET /admin/device-pairing-requests`
- `POST /admin/device-pairing-requests/:id/confirm`
- `POST /devices/verify`
- `GET /devices/me`
- `GET /receiver/orders`
- `POST /receiver/orders/:id/status`

## 6) Local smoke test plan (curl)

Export common values:

```bash
export API=http://localhost:3000
export ADMIN_TOKEN=dev-admin
```

### A. Health

```bash
curl -s "$API/health" | jq
```

### B. Create pairing code (admin)

```bash
PAIRING_CODE_RESP=$(curl -s -X POST "$API/admin/device-pairing-codes" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"deviceName":"Sunmi Caisse Local"}')

echo "$PAIRING_CODE_RESP" | jq
CODE=$(echo "$PAIRING_CODE_RESP" | jq -r '.data.code')
```

### C. Create pairing request (device enters code manually)

```bash
PAIRING_REQUEST_RESP=$(curl -s -X POST "$API/devices/pairing-requests" \
  -H "Content-Type: application/json" \
  -d "{\"pairingCode\":\"$CODE\",\"deviceName\":\"Sunmi V2\",\"deviceModel\":\"V2\",\"platform\":\"android\",\"appVersion\":\"1.0.0\",\"installId\":\"local-install-1\"}")

echo "$PAIRING_REQUEST_RESP" | jq
PAIRING_REQUEST_ID=$(echo "$PAIRING_REQUEST_RESP" | jq -r '.data.pairingRequestId')
```

### D. Confirm pairing request (admin)

```bash
curl -s -X POST "$API/admin/device-pairing-requests/$PAIRING_REQUEST_ID/confirm" \
  -H "x-admin-token: $ADMIN_TOKEN" | jq
```

### E. Device verify/poll and receive token

```bash
VERIFY_RESP=$(curl -s -X POST "$API/devices/verify" \
  -H "Content-Type: application/json" \
  -d "{\"pairingRequestId\":\"$PAIRING_REQUEST_ID\"}")

echo "$VERIFY_RESP" | jq
DEVICE_TOKEN=$(echo "$VERIFY_RESP" | jq -r '.data.deviceToken')
```

### F. Device identity endpoint

```bash
curl -s "$API/devices/me" \
  -H "Authorization: Bearer $DEVICE_TOKEN" | jq
```

### G. Receiver order list (device auth)

```bash
curl -s "$API/receiver/orders" \
  -H "Authorization: Bearer $DEVICE_TOKEN" | jq
```

### H. Receiver order status update (if an order exists)

```bash
ORDER_ID="<put-order-id-here>"
curl -s -X POST "$API/receiver/orders/$ORDER_ID/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -d '{"status":"accepted"}' | jq
```

## Notes

- Admin auth is intentionally stubbed for v1 using `x-admin-token`.
- Token storage is hash-at-rest in DB (`sha256` hash stored, raw token returned once via verify response).
- This is intentionally limited to the first migration slice; no additional product features were added.
