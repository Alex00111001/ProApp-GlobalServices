# F4 admin foundation release record

- Phase: F4
- Domain: Admin Control Center, Identity and Access
- Risk: HIGH
- Environment validated: Supabase test, isolated PostgreSQL CI and local production builds
- Production activation: not authorized; `ADMIN_ROLE_CHANGES_ENABLED` remains disabled by default

## Delivered capability

- Independent React/TypeScript `admin-web` with no database SDK or credentials.
- Dedicated administrative authentication: short audience-bound access JWT, opaque rotating refresh cookie, CSRF verifier, hashed session material and immediate server-side revocation checks.
- Persisted least-privilege RBAC without the legacy `ADMIN` wildcard, permission-derived navigation and matching API enforcement.
- Dashboard, users, professionals, bookings, audit, sessions and four-eyes role administration backed by real server data.
- Server pagination/filtering, masked collection PII and additional `users.pii.read` enforcement for sensitive detail APIs.
- Audited 403 denials, sensitive reads and mutations with actor, reason, request/correlation/trace context and before/after evidence.
- Strict professional status transitions, user deactivation session revocation and idempotent row-locked role decisions.
- Dashboard metric definitions, timezone/currency period contract, freshness markers and proportional commission reversal in net platform revenue.
- Production-safe same-origin admin API default, explicit HTTPS validation and bounded trusted-proxy configuration.

## Database and Supabase security

- `202609010002_admin_foundation`: additive `AdminSession` and `AdminRoleChangeRequest` models, indexes, foreign keys and initial RLS.
- `202609010003_supabase_rls_hardening`: revokes public/API-role privileges and forces RLS for the modeled public schema.
- `202609010004_public_schema_default_deny`: dynamically closes unmanaged legacy tables, removes stale public policies and revokes grants on Prisma metadata while preserving it for the migration engine.

All 14 migrations are applied in Supabase test. Live verification found and closed an unmanaged `profiles` exposure that a static Prisma-only audit missed. The trusted backend connection explicitly bypasses forced RLS; `PUBLIC`, `anon` and `authenticated` retain no direct table grants or public-schema usage. No public policies remain.

## Verification evidence

- Root `npm run verify`: passed.
- Backend generated/linted 103 JavaScript files; unit/contract suite passed 86/86, including full F1/F2 regression.
- Admin web lint, Vitest 4/4 and TypeScript/Vite production build passed.
- Customer mobile typecheck/Jest contract and professional mobile typecheck passed.
- Supabase/PostgreSQL integration passed 11/11: refresh rotation/revocation, concurrent four-eyes approval, dashboard SQL, real HTTP login/allowed/403 audit, billing/outbox concurrency, observability grouping/readiness and RLS/grant posture.
- Prisma format, validate, generate, baseline compatibility audit and migrate status passed; 14/14 migrations applied.
- Root, backend and admin dependency audits report 0 vulnerabilities. Mobile graphs retain only the previously accepted 15/13 moderate Expo toolchain advisories; no high or critical finding remains.
- Secretlint passed with no findings; GitHub Actions additionally performs a full-history Gitleaks scan.
- `git diff --check` passed with repository line-ending notices only.

## Activation and rollback

Before production, configure separate `JWT_SECRET` and `ADMIN_SESSION_PEPPER`, exact `CORS_ORIGINS`/`TRUST_PROXY_HOPS`, shared ingress authentication throttling and two distinct super administrators. Apply migrations, synchronize RBAC, test session revocation and rehearse one requested/approved role change before enabling `ADMIN_ROLE_CHANGES_ENABLED`.

Rollback is application-first: disable role changes, revoke active admin sessions, restore the previous backend/admin-web build and retain additive tables plus audit evidence. Never reset Supabase or drop migration/audit history; schema corrections use forward migrations.

## Residual risk

- Store-signed mobile builds and physical-device payment/notification regression remain release-rehearsal gates unrelated to F4.
- The legacy `profiles` table remains physically present because deletion was not authorized; it is default-deny, has forced RLS, no policies and no public/API-role grants.
- External WAF/ingress rate limiting and production secrets require deployment-environment configuration and cannot be embedded in the repository.
