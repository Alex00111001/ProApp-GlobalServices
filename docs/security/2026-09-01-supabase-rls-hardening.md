# Supabase / PostgreSQL RLS hardening audit

- Date: 2026-09-01
- Scope: Supabase/PostgreSQL exposure, RLS, grants, roles, RPC/functions, storage, and service-role handling
- Status: current-schema migration deployed and SQL controls verified on 2026-09-11; Dashboard Data API and Security Advisor evidence remain pending

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
| Functions / RPC | trigger functions exist in later migrations; no client-callable RPC contract exists | n/a | n/a | revoked by final catch-all | revoked by final catch-all | revoked by final catch-all | HIGH until deployed | inventory live objects and revoke routine execution from Data API roles |
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
- Added `202609110003_supabase_current_schema_default_deny` to close every current public table/view/routine/sequence after all later migrations, include `service_role`, force RLS dynamically and remove drift policies in one bounded transaction.
- Added the read-only, project-ref-guarded `backend/scripts/audit-supabase-default-deny.js` live verification gate and the production runbook at `docs/security/SUPABASE_PRODUCTION_HARDENING.md`.
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
- The repository does not contain Supabase Storage configuration or a client-callable RPC contract. The live audit inventories both surfaces because platform-only objects may exist outside Git.
- Project `qwqvzlhxkolgzyaxacfe` was audited read-only, migrated with explicit user authorization and audited again on 2026-09-11. No application deployment or Market activation occurred.
- The Dashboard Data API setting cannot be proven by repository SQL. It must be disabled and evidenced by an authorized human operator for the backend-only architecture.
- Hosted `supabase_admin` default ACLs cannot be changed by the `postgres` migration role. They are recorded as platform-managed evidence; application-owner defaults and every existing application object remain fail-closed.

## Verification

- Security review of Prisma schema and migrations completed.
- Regression test added for the hardening migration shape.
- The RLS regression was extended for the final migration and target guard; the regular backend test run confirms that security directory is already included by the Node test glob.
- Complete clean PostgreSQL 17 replay applied all 30 migrations.
- Focused static security and PostgreSQL tests pass 14/14, including inherited privileges, future types/defaults, idempotency and lock-timeout rollback.
- Backend syntax/build and unit regression pass: 189 JavaScript files and 246/246 tests.
- Full PostgreSQL integration passes 28/28 when the shared database fixture is run sequentially; the package script now enforces that mode.
- Live Prisma status reports all 30 migrations current after `202609120001_remove_legacy_market_defaults` was authorized and applied on 2026-09-12. The post-migration audit reports 126 public tables, zero policies, zero effective Data API-role privileges on application objects and zero SQL violations.

## Final state

REPOSITORY SECURITY FIX VERIFIED; LIVE SQL CONTROLS PASS

The current-schema migration and live read-only audit are complete. The finding remains incomplete until the Dashboard Data API toggle, Security Advisor rerun, external-consumer ownership and monitoring evidence are retained. Production credentials must never be copied into Git or documentation.
