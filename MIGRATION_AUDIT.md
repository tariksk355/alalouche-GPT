# Base44 Audit and Incremental Migration Plan

## Audit summary (current repository)

The codebase had strong Base44 runtime coupling across frontend and serverless functions.

### Base44 SDK / runtime coupling found

1. Frontend SDK client:
- `frontend/src/api/base44Client.js`
- Uses `@base44/sdk` and app params.

2. Frontend auth and entities coupling:
- `frontend/src/Layout.jsx`
- `frontend/src/pages/Account.jsx`
- `frontend/src/pages/Order.jsx`
- `frontend/src/pages/AdminDashboard.jsx`
- `frontend/src/pages/OrderReceiver.jsx` (pre-migration)
- `frontend/src/components/admin/DeviceProvisioning.jsx` (pre-migration)

3. Base44 function runtime coupling:
- `frontend/functions/deviceProvision.ts`
- `frontend/functions/orderReceiverPage.ts`
- `frontend/functions/orderReceiverUI.ts`
- `frontend/functions/devicePairPage.ts`
- `frontend/functions/adminDashboardPage.ts`
- `frontend/functions/adminLoginPage.ts`
- `frontend/functions/sendOrderNotification.ts`
- `frontend/functions/syncUserToCustomer.ts`
- `frontend/functions/orderNotify.ts`
- `frontend/functions/sendBulkMarketingEmail.ts`
- `frontend/functions/printOrder.ts`

### Device pairing/verification/order-receiver specific dependencies identified

- Pairing generation/activation/polling/confirmation/rejection are currently in `frontend/functions/deviceProvision.ts` using Base44 entities and service-role access.
- Device pair UI route is coupled to Base44 functions endpoint (`/functions/devicePairPage`) in `frontend/functions/devicePairPage.ts` and frontend provisioning component.
- Receiver verification and token acceptance are coupled to Base44 function endpoints and Base44 entity queries in `frontend/functions/orderReceiverPage.ts` / `frontend/functions/orderReceiverUI.ts` and `frontend/src/pages/OrderReceiver.jsx`.
- Order polling/status updates are coupled to `base44.entities.Order` CRUD and subscription APIs in `frontend/src/pages/OrderReceiver.jsx`.

## Target structure

- `frontend/` web app with no mandatory Base44 backend runtime dependency for device flow.
- `backend/` NestJS REST API with Prisma/PostgreSQL.
- `sunmi/` isolated Sunmi device + printer integration architecture.

## First migration slice implemented in this commit

1. Monorepo folder split completed.
2. New NestJS backend created with modules:
   - health
   - device-pairing
   - devices
   - receiver
   - orders
   - device-auth
3. Prisma schema added for:
   - `Restaurant`
   - `Device`
   - `DevicePairingCode`
   - `DevicePairingRequest`
   - `Order`
4. Device pairing and verification endpoints added.
5. Device bearer auth guard added (hashed token lookup).
6. Receiver endpoints for authenticated devices added.
7. Frontend first-slice patch: pairing/provisioning/receiver now call NestJS REST endpoints.
8. Sunmi-specific area created with explicit native/web boundary notes.

## Incremental next steps (TODO)

- Move remaining frontend Base44 entity usage (`Order`, `Customer`, `MenuItem`, `Reservation`, auth) to backend REST endpoints.
- Replace Base44 auth flow with dedicated auth service or OIDC provider.
- Replace Base44 file upload/email integrations with provider-neutral services.
- Add device token rotation/revocation endpoint + audit logs.
- Add database migrations + seed scripts + e2e tests for pairing lifecycle transitions.
