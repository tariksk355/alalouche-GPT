# Restaurant Monorepo (platform-agnostic migration)

This repository is now structured as a monorepo with clear separation of concerns:

- `frontend/` → web frontend (Vercel-friendly)
- `backend/` → standalone NestJS + Prisma backend (VM/container friendly)
- `sunmi/` → Sunmi-specific device/printing integration area

## Deployment strategy

- Frontend: deploy `frontend/` to Vercel.
- Backend: deploy `backend/` as Docker/container/VM service.
- Database: PostgreSQL on DigitalOcean Managed PostgreSQL or AWS RDS.

## Environment variables

### Frontend (`frontend/.env`)
- `VITE_API_BASE_URL` (e.g. `http://localhost:3000`)
- `VITE_ADMIN_TOKEN` (temporary admin stub token for pairing admin actions)

### Backend (`backend/.env`)
- `PORT` (default `3000`)
- `DATABASE_URL` (PostgreSQL connection string)
- `ADMIN_TOKEN` (temporary admin auth stub)
- `DEFAULT_RESTAURANT_ID` (fallback restaurant id for pairing-code creation)

## Local development

1. Install frontend dependencies and run Vite:
   - `cd frontend && npm install && npm run dev`
2. Install backend dependencies and run NestJS:
   - `cd backend && npm install`
   - `cd backend && npx prisma generate`
   - `cd backend && npm run start:dev`
3. Open frontend and configure `VITE_API_BASE_URL` to backend URL.

See `MIGRATION_AUDIT.md` for Base44 dependency audit and migration plan.
