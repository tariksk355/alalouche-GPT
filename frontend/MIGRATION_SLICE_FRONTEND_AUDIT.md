# Frontend audit for pairing/receiver vertical slice

## Files responsible for this slice

- Admin pairing code generation + pending request confirmation UI:
  - `frontend/src/components/admin/DeviceProvisioning.jsx`
- Device pairing screen:
  - `frontend/src/pages/DevicePair.jsx`
- Receiver screen + order loading:
  - `frontend/src/pages/OrderReceiver.jsx`
- Slice API layer:
  - `frontend/src/lib/api/config.js`
  - `frontend/src/lib/api/http.js`
  - `frontend/src/lib/api/devicePairing.js`
  - `frontend/src/lib/api/receiver.js`
- Device token storage boundary:
  - `frontend/src/lib/deviceTokenStore.js`

## Legacy/Base44 touchpoints still present (outside or around this slice)

1. Legacy Base44 SDK client remains in repo:
- `frontend/src/api/base44Client.js`

2. Legacy Base44 runtime function files remain in repo:
- `frontend/functions/deviceProvision.ts`
- `frontend/functions/devicePairPage.ts`
- `frontend/functions/orderReceiverPage.ts`
- `frontend/functions/orderReceiverUI.ts`
- and other files under `frontend/functions/*`

3. Base44 Vite plugin remains configured:
- `frontend/vite.config.js`

4. Non-slice pages/components still use Base44 entities/auth and are not migrated in this step.

## Scope note

This migration step intentionally keeps scope limited to the pairing + receiver vertical slice and does not rewrite unrelated frontend areas.
