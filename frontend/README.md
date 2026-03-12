# Frontend local setup (migrated pairing/receiver slice)

This frontend targets the NestJS backend for active storefront/admin flows.

## Required environment

Copy env file:

```bash
cp .env.example .env
```

Required vars:
- `VITE_API_BASE_URL` (NestJS backend URL, example `http://localhost:3000`)
- `VITE_ADMIN_TOKEN` (legacy pairing compatibility only; backend bearer auth is preferred)
- `VITE_DEBUG_PAIRING` (`true|false`, optional debug logs for this slice)

## Install and run

```bash
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Backend requirement

Run backend first and ensure it is reachable at `VITE_API_BASE_URL`.

## Manual flow test (migrated slice)

### 1) Admin pairing flow
1. Open admin dashboard and the device provisioning section.
2. Generate a pairing code.
3. Confirm the pending pairing request once the device submits it.

### 2) Device pairing flow
1. Open `/DevicePair` on the device browser/webview.
2. Enter pairing code manually.
3. Wait for confirmation state.
4. Device stores token locally and shows link to `/OrderReceiver`.

### 3) Receiver flow
1. Open `/OrderReceiver`.
2. Receiver verifies stored token with backend.
3. Receiver polls orders every 5 seconds.
4. Update order status using action buttons.

## Notes on current migration scope

Migrated to NestJS backend in this slice:
- `src/components/admin/DeviceProvisioning.jsx`
- `src/pages/DevicePair.jsx`
- `src/pages/OrderReceiver.jsx`
- `src/lib/api/*`
- `src/lib/deviceTokenStore.js`

Legacy function files under `frontend/functions/*` remain in-repo but are not part of the active Vite runtime path.

## Tenant bootstrap (Batch C)

The frontend now bootstraps tenant configuration from backend public endpoints before shared shell render:
- `GET /public/restaurant-config` (host/subdomain or tenant hint)
- fallback `GET /public/restaurants/:restaurantSlug/config` when explicit slug hint exists

Tenant hint sources (in order):
- query (`?restaurantSlug=` or `?slug=`)
- route fallback (`/r/:slug`)
- cached local hint

If tenant bootstrap fails or tenant is inactive, the app shows a dedicated "restaurant unavailable" state instead of a blank screen.

## Tenant-scoped browser storage keys

Shared session/cart persistence now uses tenant-scoped keys:
- `saas:{restaurantSlug}:customer_session`
- `saas:{restaurantSlug}:admin_session`
- `saas:{restaurantSlug}:cart`

Legacy keys are dual-read/migrated forward on first access (`alalouche_*`) to preserve local compatibility during transition.
