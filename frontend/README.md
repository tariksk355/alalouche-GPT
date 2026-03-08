# Frontend local setup (migrated pairing/receiver slice)

This frontend is still partly legacy, but the pairing/receiver vertical slice now targets the NestJS backend.

## Required environment

Copy env file:

```bash
cp .env.example .env
```

Required vars:
- `VITE_API_BASE_URL` (NestJS backend URL, example `http://localhost:3000`)
- `VITE_ADMIN_TOKEN` (matches backend `ADMIN_TOKEN`, default `dev-admin`)
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

Still legacy/Base44 elsewhere (not migrated in this step):
- `src/api/base44Client.js`
- many non-slice screens (account/menu/order/admin broader features)
- legacy function files under `frontend/functions/*`
- Base44 Vite plugin still present in `vite.config.js`
