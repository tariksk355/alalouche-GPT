# operations-app

Narrow iPhone-oriented operational companion app for À la Louche.

## Scope
- Admin login (`POST /admin/auth/login`)
- Orders list + order detail
- Order operational actions (`accepted`, `ready`, `completed`)
- Prep time selection on accept (`15`, `30`, `45`, `60`)
- Reservations list + reservation detail
- Reservation actions (`confirmed`, `cancelled`)
- Polling-based refresh against existing backend

## Non-goals
- No device pairing
- No printing
- No customer ordering
- No analytics UI
- No backend logic duplication

## Run
```bash
cd operations-app
npm install
npm run start
```

Optional API override:
```bash
EXPO_PUBLIC_API_BASE_URL=https://app.kodlantis-test.com npm run start
```
