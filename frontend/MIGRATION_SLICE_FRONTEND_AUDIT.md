# Frontend audit for pairing/receiver vertical slice

## Files currently responsible in this slice

- Admin pairing code generation + confirmation UI:
  - `frontend/src/components/admin/DeviceProvisioning.jsx`
- Device pairing screen:
  - `frontend/src/pages/DevicePair.jsx`
- Receiver screen + order loading:
  - `frontend/src/pages/OrderReceiver.jsx`

## Base44 calls related to this slice (legacy / still present in repo)

- Legacy serverless function route handlers still present under:
  - `frontend/functions/deviceProvision.ts`
  - `frontend/functions/orderReceiverPage.ts`
  - `frontend/functions/orderReceiverUI.ts`
  - `frontend/functions/devicePairPage.ts`
- Base44 SDK client file remains for other non-migrated areas:
  - `frontend/src/api/base44Client.js`

## Scope of this migration step

This patch only migrates backend/runtime calls for the pairing + receiver first vertical slice in the frontend pages/components above. Other Base44 usage in unrelated pages remains intentionally unchanged for incremental migration.
