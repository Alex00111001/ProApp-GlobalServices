# Admin Web Control Center

`admin-web/` is an independent React/TypeScript application. It never connects to PostgreSQL; all data flows through authenticated Core API endpoints.

## Local development

```bash
cd admin-web
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_API_URL` to the backend `/api` base URL. Production deployments must use HTTPS and an allowlisted backend origin.

## Security model

- Tokens are held in `sessionStorage`, so closing the tab ends the local browser session.
- The frontend checks for an administrative account for usability; backend RBAC remains authoritative.
- A 401 response clears the local session automatically.
- Module visibility will be permission-derived when `/api/admin/me` is introduced.
- No database credentials or provider secrets belong in `VITE_*` variables.

## Current routes

The application includes protected route boundaries for Dashboard, Marketplace, Users, Professionals, Bookings, Revenue, Marketing, Operations, Support, Analytics, Audit and Settings. Dashboard reads the existing `/api/admin/dashboard` endpoint. Remaining modules are intentionally explicit integration boundaries rather than fake operational data.

## Verification

Run `npm run build` and `npm run lint`. The login screen has also been verified in the local in-app browser at desktop width. Authentication was not submitted during visual QA; no credentials were transmitted.
