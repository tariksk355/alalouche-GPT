# Sunmi receiver foundation (lightweight device entry)

This folder now includes a **dedicated lightweight receiver entrypoint** for Sunmi-like handheld usage, separate from the general `frontend/` app.

## Internal structure

- `src/main.js` → receiver app entry/state/polling loop
- `src/api/` → minimal backend API client
  - `http.js`
  - `receiverApi.js`
- `src/services/receiverService.js` → receiver flow orchestration
- `src/storage/tokenStore.js` → swappable token storage adapter boundary
- `src/boundaries/`
  - `orderFormatter.js` (order display mapping boundary)
  - `printerAdapter.js` (placeholder boundary, intentionally not implemented)
- `.env.example` → Sunmi receiver env template
- `package.json` → local dev/build scripts for this lightweight app

## What this app is for

- Device-side receiver experience with minimal dependency surface.
- Uses stored device token only (no query-param token flow).
- Verifies device via backend and polls receiver orders.
- Updates order status from handheld-friendly UI controls.

## What it depends on

- NestJS backend endpoints:
  - `GET /devices/me`
  - `GET /receiver/orders`
  - `POST /receiver/orders/:id/status`
- Browser runtime (`localStorage` fallback) for token storage.

## How it differs from general frontend

- `sunmi/` app is focused only on receiver/device runtime.
- No broad app navigation/auth/menu/admin complexity.
- Minimal JS modules and simple polling state model.

## Local run

```bash
cd sunmi
cp .env.example .env
npm install
npm run dev
```

Default URL: `http://localhost:4174`

Required env:
- `VITE_API_BASE_URL` (example: `http://localhost:3000`)
- `VITE_DEBUG_SUNMI` (`true|false`)

## States handled

- loading
- verifying
- not paired
- server error
- orders loaded

## Intentionally NOT implemented yet

- Printer integration (no real printer code here).
- Native Android bridge bindings.
- QR-based pairing entry.

## Pure web vs native boundary

### Works in pure web now
- Read stored token
- Validate device (`/devices/me`)
- Poll orders (`/receiver/orders`)
- Update status (`/receiver/orders/:id/status`)

### Requires native Android bridge / Sunmi SDK later
- Secure hardware-backed token storage
- Native printer operations
- Device-specific hardware controls

## Future integration boundary

Use `src/storage/tokenStore.js` and `src/boundaries/printerAdapter.js` as swap points for native implementations.
