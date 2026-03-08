# Backend (NestJS + Prisma)

First migration slice endpoints:
- `GET /health`
- `POST /admin/device-pairing-codes`
- `POST /devices/pairing-requests`
- `GET /admin/device-pairing-requests`
- `POST /admin/device-pairing-requests/:id/confirm`
- `POST /devices/verify`
- `GET /devices/me`
- `GET /receiver/orders`
- `POST /receiver/orders/:id/status`

## Admin auth (v1 stub)
Admin endpoints currently use `x-admin-token` and compare against `ADMIN_TOKEN`.
This keeps pairing flow unblocked while clearly marking future auth hardening boundary.
