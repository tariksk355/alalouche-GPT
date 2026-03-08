# Pairing screen integration

Expected flow:
1. Device user manually enters pairing code.
2. App calls `POST /devices/pairing-requests`.
3. App polls `POST /devices/verify` using `pairingRequestId`.
4. Once confirmed, app receives `deviceToken` and stores it securely.
5. Future requests include `Authorization: Bearer <device_token>`.
