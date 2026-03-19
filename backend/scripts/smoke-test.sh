#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234}"
PAIRING_RESTAURANT_SLUG="${PAIRING_RESTAURANT_SLUG:-alalouche}"

command -v curl >/dev/null || { echo "curl is required"; exit 1; }
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

echo "[1/9] GET /health"
curl -s "$API_URL/health" | jq

echo "[2/9] GET /ready"
curl -s "$API_URL/ready" | jq

echo "[3/9] POST /admin/auth/login"
ADMIN_LOGIN_RESP=$(curl -s -X POST "$API_URL/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")
echo "$ADMIN_LOGIN_RESP" | jq
ADMIN_BEARER=$(echo "$ADMIN_LOGIN_RESP" | jq -r '.data.token')

if [[ -z "$ADMIN_BEARER" || "$ADMIN_BEARER" == "null" ]]; then
  echo "admin login failed"
  exit 1
fi

echo "[4/9] POST /admin/device-pairing-codes (bearer token)"
PAIRING_CODE_RESP=$(curl -s -X POST "$API_URL/admin/device-pairing-codes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_BEARER" \
  -H "x-restaurant-slug: $PAIRING_RESTAURANT_SLUG" \
  -d '{"deviceName":"Sunmi Local Dev"}')
echo "$PAIRING_CODE_RESP" | jq
PAIRING_CODE=$(echo "$PAIRING_CODE_RESP" | jq -r '.data.code')

echo "[5/9] POST /devices/pairing-requests"
PAIRING_REQUEST_RESP=$(curl -s -X POST "$API_URL/devices/pairing-requests" \
  -H "Content-Type: application/json" \
  -d "{\"pairingCode\":\"$PAIRING_CODE\",\"deviceName\":\"Sunmi Dev Unit\",\"deviceModel\":\"V2\",\"platform\":\"android\",\"appVersion\":\"1.0.0\",\"installId\":\"dev-install-001\"}")
echo "$PAIRING_REQUEST_RESP" | jq
PAIRING_REQUEST_ID=$(echo "$PAIRING_REQUEST_RESP" | jq -r '.data.pairingRequestId')

echo "[6/9] GET /admin/device-pairing-requests"
curl -s "$API_URL/admin/device-pairing-requests" \
  -H "Authorization: Bearer $ADMIN_BEARER" | jq

echo "[7/9] POST /admin/device-pairing-requests/:id/confirm"
curl -s -X POST "$API_URL/admin/device-pairing-requests/$PAIRING_REQUEST_ID/confirm" \
  -H "Authorization: Bearer $ADMIN_BEARER" | jq

echo "[8/9] POST /devices/verify"
VERIFY_RESP=$(curl -s -X POST "$API_URL/devices/verify" \
  -H "Content-Type: application/json" \
  -d "{\"pairingRequestId\":\"$PAIRING_REQUEST_ID\"}")
echo "$VERIFY_RESP" | jq
DEVICE_TOKEN=$(echo "$VERIFY_RESP" | jq -r '.data.deviceToken')

echo "[9/9] GET /devices/me + /receiver/orders"
curl -s "$API_URL/devices/me" -H "Authorization: Bearer $DEVICE_TOKEN" | jq
curl -s "$API_URL/receiver/orders" -H "Authorization: Bearer $DEVICE_TOKEN" | jq

echo "[done] smoke test succeeded"
