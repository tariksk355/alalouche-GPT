#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
TENANT_A_SLUG="${TENANT_A_SLUG:-alalouche}"
TENANT_B_SLUG="${TENANT_B_SLUG:-demo-bistro}"
ADMIN_A_USERNAME="${ADMIN_A_USERNAME:-admin}"
ADMIN_B_USERNAME="${ADMIN_B_USERNAME:-admin_demo_bistro}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-batchb.customer@example.com}"
CUSTOMER_PASSWORD="${CUSTOMER_PASSWORD:-customer1234}"
LEGACY_ADMIN_TOKEN="${ADMIN_TOKEN:-dev-admin}"

command -v curl >/dev/null || { echo "curl is required"; exit 1; }
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

ok() {
  echo "[OK] $1"
}

api() {
  curl -s "$@"
}

extract_token_payload_field() {
  local token="$1"
  local field="$2"
  local payload
  payload=$(echo "$token" | cut -d'.' -f1 | tr '_-' '/+' | base64 -d 2>/dev/null || true)
  echo "$payload" | jq -r --arg field "$field" '.[$field]'
}

echo "[1/9] Verify public config differs between tenant A and tenant B"
CFG_A=$(api "$API_URL/public/restaurants/$TENANT_A_SLUG/config" | jq -c '.data.restaurant')
CFG_B=$(api "$API_URL/public/restaurants/$TENANT_B_SLUG/config" | jq -c '.data.restaurant')
[[ "$CFG_A" != "null" ]] || fail "tenant A config missing"
[[ "$CFG_B" != "null" ]] || fail "tenant B config missing"
[[ "$CFG_A" != "$CFG_B" ]] || fail "tenant configs should differ"
ok "public configs differ"

echo "[2/9] Admin login for tenant A and tenant B"
ADMIN_A_TOKEN=$(api -X POST "$API_URL/admin/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$ADMIN_A_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" | jq -r '.data.token')
ADMIN_B_TOKEN=$(api -X POST "$API_URL/admin/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$ADMIN_B_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" | jq -r '.data.token')
[[ "$ADMIN_A_TOKEN" != "null" && -n "$ADMIN_A_TOKEN" ]] || fail "admin A login failed"
[[ "$ADMIN_B_TOKEN" != "null" && -n "$ADMIN_B_TOKEN" ]] || fail "admin B login failed"

ADMIN_A_RESTAURANT=$(extract_token_payload_field "$ADMIN_A_TOKEN" "restaurantId")
ADMIN_B_RESTAURANT=$(extract_token_payload_field "$ADMIN_B_TOKEN" "restaurantId")
[[ "$ADMIN_A_RESTAURANT" != "null" && -n "$ADMIN_A_RESTAURANT" ]] || fail "admin A restaurant missing"
[[ "$ADMIN_B_RESTAURANT" != "null" && -n "$ADMIN_B_RESTAURANT" ]] || fail "admin B restaurant missing"
[[ "$ADMIN_A_RESTAURANT" != "$ADMIN_B_RESTAURANT" ]] || fail "admin tenant scopes should differ"
ok "admin tenants are distinct"

echo "[3/9] Customer signup/login under tenant A and verify token tenant"
api -X POST "$API_URL/auth/signup" \
  -H 'Content-Type: application/json' \
  -H "x-restaurant-slug: $TENANT_A_SLUG" \
  -d "{\"fullName\":\"Batch B Customer\",\"email\":\"$CUSTOMER_EMAIL\",\"phone\":\"0790000000\",\"password\":\"$CUSTOMER_PASSWORD\"}" >/dev/null || true

CUSTOMER_LOGIN_RESP=$(api -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -H "x-restaurant-slug: $TENANT_A_SLUG" \
  -d "{\"email\":\"$CUSTOMER_EMAIL\",\"password\":\"$CUSTOMER_PASSWORD\"}")
CUSTOMER_TOKEN=$(echo "$CUSTOMER_LOGIN_RESP" | jq -r '.data.token')
[[ "$CUSTOMER_TOKEN" != "null" && -n "$CUSTOMER_TOKEN" ]] || fail "customer login failed"
CUSTOMER_RESTAURANT=$(extract_token_payload_field "$CUSTOMER_TOKEN" "restaurantId")
[[ "$CUSTOMER_RESTAURANT" == "$ADMIN_A_RESTAURANT" ]] || fail "customer token tenant mismatch"
ok "customer auth scoped to tenant A"

echo "[4/9] Capture KPI baseline for tenant A and tenant B"
KPI_A_BEFORE=$(api "$API_URL/admin/kpis" -H "Authorization: Bearer $ADMIN_A_TOKEN")
KPI_B_BEFORE=$(api "$API_URL/admin/kpis" -H "Authorization: Bearer $ADMIN_B_TOKEN")
ORD_A_BEFORE=$(echo "$KPI_A_BEFORE" | jq -r '.data.orderCount')
RES_A_BEFORE=$(echo "$KPI_A_BEFORE" | jq -r '.data.reservationCount')
ORD_B_BEFORE=$(echo "$KPI_B_BEFORE" | jq -r '.data.orderCount')
RES_B_BEFORE=$(echo "$KPI_B_BEFORE" | jq -r '.data.reservationCount')

echo "[5/9] Create reservation under tenant A"
NOW_DATE=$(date -u +%Y-%m-%d)
api -X POST "$API_URL/reservations" \
  -H 'Content-Type: application/json' \
  -H "x-restaurant-slug: $TENANT_A_SLUG" \
  -d "{\"name\":\"Batch B Reservation\",\"email\":\"$CUSTOMER_EMAIL\",\"phone\":\"0790000000\",\"date\":\"$NOW_DATE\",\"time\":\"19:00\",\"guests\":2,\"notes\":\"tenant A check\"}" >/dev/null

sleep 1

echo "[6/9] KPI isolation check after reservation"
KPI_A_AFTER=$(api "$API_URL/admin/kpis" -H "Authorization: Bearer $ADMIN_A_TOKEN")
KPI_B_AFTER=$(api "$API_URL/admin/kpis" -H "Authorization: Bearer $ADMIN_B_TOKEN")
RES_A_AFTER=$(echo "$KPI_A_AFTER" | jq -r '.data.reservationCount')
RES_B_AFTER=$(echo "$KPI_B_AFTER" | jq -r '.data.reservationCount')

[[ "$RES_A_AFTER" -ge "$RES_A_BEFORE" ]] || fail "tenant A reservation count did not increase as expected"
[[ "$RES_B_AFTER" == "$RES_B_BEFORE" ]] || fail "tenant B reservation count should remain unchanged"
ok "reservation and KPI isolation verified"

echo "[7/9] Device-pairing legacy path must fail without explicit tenant scope"
LEGACY_NO_SCOPE=$(api -X POST "$API_URL/admin/device-pairing-codes" -H 'Content-Type: application/json' -H "x-admin-token: $LEGACY_ADMIN_TOKEN" -d '{"deviceName":"Legacy No Scope"}')
LEGACY_NO_SCOPE_OK=$(echo "$LEGACY_NO_SCOPE" | jq -r '.ok')
[[ "$LEGACY_NO_SCOPE_OK" == "false" ]] || fail "legacy admin token without tenant scope should fail"
ok "legacy no-scope request rejected"

echo "[8/9] Device-pairing legacy path succeeds with explicit tenant scope (non-production compatibility)"
LEGACY_WITH_SCOPE=$(api -X POST "$API_URL/admin/device-pairing-codes" \
  -H 'Content-Type: application/json' \
  -H "x-admin-token: $LEGACY_ADMIN_TOKEN" \
  -H "x-restaurant-id: $ADMIN_A_RESTAURANT" \
  -d '{"deviceName":"Legacy Scoped"}')
LEGACY_WITH_SCOPE_OK=$(echo "$LEGACY_WITH_SCOPE" | jq -r '.ok')
[[ "$LEGACY_WITH_SCOPE_OK" == "true" ]] || fail "legacy scoped request should succeed in non-production"
ok "legacy scoped compatibility works"

echo "[9/9] Explicit invalid tenant hint must not silently fallback"
INVALID_HINT=$(api -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -H 'x-restaurant-slug: does-not-exist' \
  -d "{\"email\":\"$CUSTOMER_EMAIL\",\"password\":\"$CUSTOMER_PASSWORD\"}")
INVALID_OK=$(echo "$INVALID_HINT" | jq -r '.ok')
INVALID_CODE=$(echo "$INVALID_HINT" | jq -r '.error')
[[ "$INVALID_OK" == "false" ]] || fail "invalid tenant hint should fail"
[[ "$INVALID_CODE" == "TENANT_NOT_RESOLVED" ]] || fail "expected TENANT_NOT_RESOLVED, got $INVALID_CODE"
ok "invalid explicit tenant hint does not fallback"

echo "[done] multi-tenant smoke test passed"
echo "       tenant A reservation count: $RES_A_BEFORE -> $RES_A_AFTER"
echo "       tenant B reservation count: $RES_B_BEFORE -> $RES_B_AFTER"
