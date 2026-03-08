# Sunmi device app shell (pairing + receiver)

This folder contains a **lightweight device-side Sunmi app shell** that handles first-launch pairing and then transitions into receiver mode.

## Updated internal structure

- `src/main.js` → app shell state flow + screen rendering + polling orchestration
- `src/api/`
  - `http.js` → minimal fetch wrapper + normalized errors
  - `receiverApi.js` → pairing + receiver backend calls
- `src/services/`
  - `pairingService.js` → pairing submit + verify polling checks
  - `receiverService.js` → device validation + receiver order workflow
- `src/storage/tokenStore.js` → swappable token storage adapter boundary
- `src/boundaries/`
  - `orderFormatter.js` → display mapping boundary
  - `printerAdapter.js` → placeholder only (no printer integration yet)

## First-launch flow

1. App boots.
2. If no stored token -> show pairing screen.
3. Operator enters pairing code manually.
4. App submits pairing request to backend.
5. App polls verification status.
6. Once admin confirms, backend returns device token in response body.
7. App stores token through `tokenStore`.
8. App validates device and enters receiver screen.

## Paired flow

1. App boots with stored token.
2. Validates token/device via `/devices/me`.
3. Enters receiver screen and polls `/receiver/orders`.
4. Allows status updates via `/receiver/orders/:id/status`.

## Token storage behavior

- Current implementation: localStorage fallback (`src/storage/tokenStore.js`).
- All token operations go through this abstraction.
- Future Android native secure storage can replace this adapter without rewriting app screens.

## Local reset / unpair

- UI provides “Réinitialiser le token local” in pairing screen and “Désassocier cet appareil” in receiver screen.
- Both actions clear token through storage abstraction and return to not-paired state.

## Local run

```bash
cd sunmi
cp .env.example .env
npm install
npm run dev
```

Default URL: `http://localhost:4174`

Env vars:
- `VITE_API_BASE_URL` (backend URL, e.g. `http://localhost:3000`)
- `VITE_DEBUG_SUNMI` (`true|false` debug logging)

## App states

- `booting`
- `not_paired`
- `pairing_submitting`
- `pairing_waiting`
- `verifying`
- `server_error`
- `receiver_loaded`

## What is intentionally NOT implemented yet

- Printer integration (real print calls).
- Android native bridge integration.
- QR-first pairing UX.

## Pure web vs native boundary

### Works in pure web now
- Manual pairing code submission and verify polling.
- Stored-token validation.
- Receiver order polling/status update.

### Requires Android bridge / Sunmi SDK later
- Hardware-backed secure token storage.
- Native printer execution and status.
- Device hardware APIs.

## Future printer/native boundary

`src/boundaries/printerAdapter.js` remains a placeholder boundary and is intentionally untouched by this step.
