# À la Louche Mobile (React Native)

Customer-facing mobile app, isolated under `mobile/` to avoid impacting existing production web/backend runtime.

## Features included
- Login / Signup
- Forgot password / Reset password
- Browse categories and products
- Product detail + option selections
- Cart
- Checkout
- Order history
- Profile / Settings
- OneSignal initialization + permission/click handling + user identity association
- Sentry initialization + error boundary

## Setup
1. Copy `.env.example` to `.env` and fill values.
2. Install deps:
   ```bash
   cd mobile
   npm install
   ```
3. Run:
   ```bash
   npm run start
   ```

## Manual integration steps
- OneSignal:
  - set `EXPO_PUBLIC_ONESIGNAL_APP_ID`
  - configure iOS/Android native OneSignal keys/capabilities
- Sentry:
  - set `EXPO_PUBLIC_SENTRY_DSN`
  - connect project release pipeline as needed
- API:
  - set `EXPO_PUBLIC_API_BASE_URL` to backend API origin

## Notes
- No backend contract changes required for this initial mobile client.
- Reuses existing web/backend API contracts where possible.
