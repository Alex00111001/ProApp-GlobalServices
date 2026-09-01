# Supabase / PostgreSQL RLS hardening audit

- Date: 2026-09-01
- Scope: Supabase/PostgreSQL exposure, RLS, grants, roles, RPC/functions, storage, and service-role handling
- Status: deployed and verified in the Supabase test environment; production activation remains separate

## Root cause

The committed database schema exposed many `public` tables without any Row-Level Security. In Supabase, that leaves the REST/Data API surface open to direct reads and writes whenever `anon` or `authenticated` receive table access. The application backend itself does not use `@supabase/*`; it talks to PostgreSQL through Prisma, so the database was being treated as trusted internally while the public Supabase surface remained underprotected.

## Resources reviewed

| Resource | Type | RLS | Policies | anon | authenticated | service_role | Risk | Action |
|---|---|---:|---|---|---|---|---|---|
| `public.User` | table | missing | none | exposed | exposed | backend only | CRITICAL | RLS enabled, privileges revoked |
| `public.ClientProfile` | table | missing | none | exposed | exposed | backend only | CRITICAL | RLS enabled, privileges revoked |
| `public.ProfessionalProfile` | table | missing | none | exposed | exposed | backend only | CRITICAL | RLS enabled, privileges revoked |
| `public.Booking` | table | missing | none | exposed | exposed | backend only | CRITICAL | RLS enabled, privileges revoked |
| `public.Payment` | table | missing | none | exposed | exposed | backend only | CRITICAL | RLS enabled, privileges revoked |
| `public.Earning` | table | missing | none | exposed | exposed | backend only | HIGH | RLS enabled, privileges revoked |
| `public.Review` | table | missing | none | exposed | exposed | backend only | HIGH | RLS enabled, privileges revoked |
| `public.Notification` | table | missing | none | exposed | exposed | backend only | HIGH | RLS enabled, privileges revoked |
| `public.AdminAuditLog` | table | missing | none | exposed | exposed | backend only | HIGH | RLS enabled, privileges revoked |
| `public.Role`, `Permission`, `RolePermission`, `UserRoleAssignment` | tables | missing | none | exposed | exposed | backend only | HIGH | RLS enabled, privileges revoked |
| `public.AdminSession`, `AdminRoleChangeRequest` | tables | missing | none | exposed | exposed | backend only | CRITICAL | RLS enabled, privileges revoked |
| Legacy `public.profiles` | unmanaged table | enabled only | three stale policies | exposed | exposed | backend only | CRITICAL | forced RLS, policies removed, privileges revoked |
| `public.FeatureFlag`, `AuditLog`, `IdempotencyRecord`, `OutboxEvent`, `IntegrationEvent` | tables | missing | none | exposed | exposed | backend only | HIGH | RLS enabled, privileges revoked |
| `public.MarketingEvent`, `ErrorGroup`, `ErrorEvent`, `Incident`, `IncidentEvent`, `IncidentComment`, `ServiceHealthSnapshot` | tables | missing | none | exposed | exposed | backend only | HIGH | RLS enabled, privileges revoked |
| `public.PricingPolicy`, `RefundPolicy`, `BookingPolicyAcceptance` | tables | missing | none | exposed | exposed | backend only | HIGH | RLS enabled, privileges revoked |
| `public.LedgerAccount`, `LedgerTransaction`, `LedgerEntry`, `Refund`, `RefundDecision`, `Payout`, `Dispute`, `ReconciliationRun`, `ReconciliationItem` | tables | missing | none | exposed | exposed | backend only | CRITICAL | RLS enabled, privileges revoked |
| Views / materialized views | none found | n/a | n/a | n/a | n/a | n/a | INFO | none present in repo |
| Functions / RPC | none found in Prisma schema or migrations | n/a | n/a | n/a | n/a | n/a | INFO | no `SECURITY DEFINER` surface present |
| Storage buckets | none found in repo | n/a | n/a | n/a | n/a | n/a | INFO | no bucket config present |

## Authorization model reconstructed

- Visitor / anonymous: no direct PostgreSQL table access through Supabase.
- Authenticated client: no direct PostgreSQL table access through Supabase; access goes through backend APIs.
- Authenticated professional: no direct PostgreSQL table access through Supabase; access goes through backend APIs.
- Administrator / superuser: backend-only access through Prisma and application RBAC.
- Internal backend processes: full access through the trusted PostgreSQL connection used by Prisma.

## Fix implemented

- Added `backend/prisma/migrations/202609010003_supabase_rls_hardening/migration.sql`.
- Added `202609010004_public_schema_default_deny` after live verification found a legacy `profiles` table, stale policies and grants on Prisma metadata that a static model list could not cover.
- Enabled and forced RLS on every committed `public` table.
- Revoked `PUBLIC`, `anon` and `authenticated` privileges on the `public` schema.
- Revoked existing function/sequence privileges and default table, sequence, function and type privileges from public-facing roles.
- Revoked table privileges from `PUBLIC`, `anon`, and `authenticated` on every table in the schema.
- Dynamically enables and forces RLS for every current public application table and removes legacy public policies; `_prisma_migrations` remains migration-engine managed but has no public grants.
- Added a regression test at `backend/test/security/supabase-rls.test.js` to lock the migration shape.

## Policy outcome

This hardening deliberately does not create public `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies. The correct posture for this codebase is default deny on the Supabase public surface, because the application already mediates access through backend APIs and Prisma.

## Service role handling

- No `SUPABASE_SERVICE_ROLE_KEY` usage was found in committed source.
- No browser bundle exposure of service-role secrets was found.
- No endpoints were found that proxy Supabase secrets.
- No secret values were logged or copied into this report.

## Residual risk

- Direct client access to Supabase tables is denied; any future product path that needs Supabase Data API access requires an explicit architecture/security review and narrowly scoped policies.
- The repository does not contain live Supabase storage or RPC configuration, so those surfaces require a separate audit if introduced.
- This evidence applies to the test environment. Production remains unactivated and must execute the same migration/verification gates during release rehearsal.

## Verification

- Security review of Prisma schema and migrations completed.
- Regression test added for the hardening migration shape.
- All 14 migrations are applied in Supabase test.
- Database integration verifies forced RLS on every public application table, zero policies, no `PUBLIC`/`anon`/`authenticated` table grants, no public schema usage for API roles and an explicit trusted backend bypass role.
- Full Supabase integration passes 11/11, including F1 billing/outbox, F2 observability, F4 admin sessions/four-eyes/dashboard/HTTP 403 and RLS posture.

## Final state

SECURITY FIX VERIFIED IN TEST

The repository and Supabase test environment are aligned. Production deployment is intentionally deferred to the release rehearsal and must not reuse test credentials.
