#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-dev-admin}"

command -v curl >/dev/null || { echo "curl is required"; exit 1; }
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

echo "[1/7] GET /health"
curl -s "$API_URL/health" | jq

echo "[2/7] POST /admin/device-pairing-codes"
PAIRING_CODE_RESP=$(curl -s -X POST "$API_URL/admin/device-pairing-codes" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"deviceName":"Sunmi Local Dev"}')
echo "$PAIRING_CODE_RESP" | jq
PAIRING_CODE=$(echo "$PAIRING_CODE_RESP" | jq -r '.data.code')

echo "[3/7] POST /devices/pairing-requests"
PAIRING_REQUEST_RESP=$(curl -s -X POST "$API_URL/devices/pairing-requests" \
  -H "Content-Type: application/json" \
  -d "{\"pairingCode\":\"$PAIRING_CODE\",\"deviceName\":\"Sunmi Dev Unit\",\"deviceModel\":\"V2\",\"platform\":\"android\",\"appVersion\":\"1.0.0\",\"installId\":\"dev-install-001\"}")
echo "$PAIRING_REQUEST_RESP" | jq
PAIRING_REQUEST_ID=$(echo "$PAIRING_REQUEST_RESP" | jq -r '.data.pairingRequestId')

echo "[4/7] POST /admin/device-pairing-requests/:id/confirm"
curl -s -X POST "$API_URL/admin/device-pairing-requests/$PAIRING_REQUEST_ID/confirm" \
  -H "x-admin-token: $ADMIN_TOKEN" | jq

echo "[5/7] POST /devices/verify"
VERIFY_RESP=$(curl -s -X POST "$API_URL/devices/verify" \
  -H "Content-Type: application/json" \
  -d "{\"pairingRequestId\":\"$PAIRING_REQUEST_ID\"}")
echo "$VERIFY_RESP" | jq
DEVICE_TOKEN=$(echo "$VERIFY_RESP" | jq -r '.data.deviceToken')

echo "[6/7] GET /devices/me"
curl -s "$API_URL/devices/me" \
  -H "Authorization: Bearer $DEVICE_TOKEN" | jq

echo "[7/7] GET /receiver/orders"
curl -s "$API_URL/receiver/orders" \
  -H "Authorization: Bearer $DEVICE_TOKEN" | jq

echo "[done] smoke test succeeded"
