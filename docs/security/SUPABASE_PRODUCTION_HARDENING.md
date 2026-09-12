# Supabase production default-deny runbook

## Purpose and current status

This runbook closes the repository side of the Supabase Data API exposure finding for the backend-only HomeServices architecture. It does **not** authorize a production deployment.

```text
Repository hardening: VERIFIED LOCALLY
Live migrations: CURRENT THROUGH 202609120001 (verified 2026-09-12)
Live SQL verification: PASS_SQL_CONTROLS_MANUAL_PLATFORM_CHECKS_REMAIN
Manual platform verification: PENDING
Production application deployment: NOT AUTHORIZED
```

The target production project is `qwqvzlhxkolgzyaxacfe`. The value is a project identifier, not a credential. Passwords, connection strings and API keys must remain in the approved secret store or in an untracked operator environment.

## Change classification

```text
Phase: Spain readiness / database-security release gate
Domain: PostgreSQL and Supabase Data API boundary
Risk: CRITICAL
Capability tier: DEEP
Skills: security, database-prisma, release, repo-auditor, architecture-guardian, testing
Escalation triggers: unexpected pending migration, target mismatch, lock timeout, migration drift, backend role without BYPASSRLS, external direct client dependency
Required verification: static security tests, isolated PostgreSQL replay, staging rehearsal, read-only production audit, Dashboard Data API check, Security Advisor rerun
```

## Approved access model

- Mobile, Admin Web and Public Web call backend HTTP APIs only.
- The backend connects directly to PostgreSQL through Prisma.
- `PUBLIC`, `anon`, `authenticated` and `service_role` have no privileges on the application objects in `public`.
- Every application table in `public`, except Prisma's migration metadata table, has RLS enabled and forced.
- No RLS policy exists in `public`; adding one requires a new architecture and security review.
- No client-callable public RPC, view or Supabase Storage path is part of the current contract.

The security catch-all migration is:

`backend/prisma/migrations/202609110003_supabase_current_schema_default_deny/migration.sql`

It is transactional, uses bounded lock/statement timeouts, covers tables created after the original 2026-09-01 hardening, revokes public-schema tables/views/routines/sequences, revokes default privileges for future objects created by the migration role, forces RLS, and removes public-schema policies.

## Go/no-go preflight

All items are mandatory. Any failed or unknown item is a NO-GO.

1. Obtain explicit production-change approval for the exact commit and migration set.
2. Freeze the release candidate and record its commit SHA.
3. Confirm an automated database backup/PITR point exists and record its timestamp. Do not claim restore readiness without a demonstrated restore rehearsal.
4. Rehearse the complete migration history and this audit against an isolated PostgreSQL database, then against staging.
5. Inventory `prisma migrate status`. The deployment command applies **every** pending migration; an unexpected migration is a blocker.
6. Confirm the backend code deployed with the migration is backward compatible with every pending additive change.
7. Confirm the migration connection is a direct Supabase PostgreSQL connection for project `qwqvzlhxkolgzyaxacfe` and the application runtime role can serve the backend with forced RLS.
8. Search all owned applications and external repositories for PostgREST, GraphQL, `supabase-js`, RPC or Supabase Storage client access. Move any dependency to the backend before this change.
9. Define an operator, independent reviewer, monitoring window and abort authority.

## Read-only audit

The audit command performs only `SELECT` statements inside a `REPEATABLE READ READ ONLY` transaction and always rolls it back. It refuses to connect unless both the explicit opt-in and the expected project ref are present, and it never prints the connection string.

From `backend/`, set the production direct URL without echoing or committing it:

```powershell
$env:EXPECTED_SUPABASE_PROJECT_REF='qwqvzlhxkolgzyaxacfe'
$env:ALLOW_LIVE_SECURITY_AUDIT='true'
$env:DIRECT_URL='<secret production direct PostgreSQL URL>'
npm run security:audit-supabase-live
```

Before the migration, `FAIL` is expected and becomes captured baseline evidence. After the migration, the SQL control gate must return:

```text
PASS_SQL_CONTROLS_MANUAL_PLATFORM_CHECKS_REMAIN
```

The audit checks:

- target project identity encoded by the Supabase direct/pooler connection;
- transaction read-only state;
- forced RLS on every application table in `public`;
- absence of policies in `public`;
- absence of schema, table/view, column, routine, sequence and unsafe default grants for Data API roles;
- separation of application-owner defaults from immutable Supabase-managed `supabase_admin` defaults;
- trusted connection role capability for forced RLS;
- views, materialized views and `SECURITY DEFINER` function inventory;
- public Supabase Storage buckets and client-role Storage policies, when the storage schema exists;
- configured PostgREST schema evidence available in PostgreSQL.

The script cannot prove whether the Dashboard Data API toggle is enabled. That remains a manual platform check.
+
Supabase-managed default ACLs owned by `supabase_admin` are retained as evidence rather than treated as an actionable SQL failure. The supported application control is to remove existing object grants, revoke future-object defaults for the application object owner (`postgres` in the hosted project), and disable the Data API. The migration aborts if any owner of current application tables retains an unsafe effective default privilege.

## Production deployment procedure — human authorized only

Do not run this section from an unattended agent session.

1. Capture the preflight evidence and the failing pre-migration read-only audit.
2. In the Supabase Dashboard for the exact target project, open the Data API integration settings. Because HomeServices does not use Supabase client libraries, REST or GraphQL data endpoints, turn **Enable Data API** off.
3. Review the exact list from `npx prisma migrate status`. Stop if it differs from the approved release manifest.
4. During the approved change window, apply the reviewed migrations with `npx prisma migrate deploy` from `backend/` using the secret `DIRECT_URL`.
5. Run `npx prisma migrate status` again and retain the output.
6. Run `npm run security:audit-supabase-live` again. Any reported violation is a NO-GO.
7. In Supabase Dashboard, navigate to Database → Security Advisor, rerun the advisor and retain evidence for every resolved or explicitly reviewed warning.
8. Exercise backend health, authentication and representative read/write API probes. Do not test through direct client table reads.
9. Monitor authorization failures, database errors and latency through the agreed observation window.

Supabase documents that applications which do not use the generated REST/GraphQL endpoints should disable the Data API, and that grants plus RLS must both be controlled for exposed objects:

- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/database-advisors

## Expected application impact

No repository-owned product path should break: the tracked applications contain no Supabase client library, `/rest/v1`, `/graphql/v1`, publishable/anon key or service-role access. They use the backend API.

If an untracked direct client breaks, the correct remediation is to migrate that path to an authorized backend endpoint. Do not restore broad `anon`, `authenticated`, `service_role` or `PUBLIC` grants as an emergency shortcut.

## Abort and recovery

- A lock timeout, statement timeout, migration error or target mismatch is an immediate abort. Do not raise timeouts without investigating the blocking session.
- If the backend cannot read after forced RLS, verify that its runtime URL/role is the approved direct backend identity. Correct the connection or deploy a reviewed forward fix; do not reopen the Data API.
- If the migration transaction fails, PostgreSQL rolls back this migration. Confirm migration status and database state before retrying.
- If a previously unknown direct client fails, keep default deny and move it to the backend. Any temporary exception requires a separate security-approved, least-privilege migration with an expiry and regression tests.
- After a successful migration, prefer roll-forward. Reversing RLS or restoring broad grants reintroduces the vulnerability and is not an acceptable generic rollback.

## Evidence record

Record without secrets:

| Evidence | Required value |
|---|---|
| Commit SHA | This evidence is committed with the release candidate; record the immutable SHA from Git after publication |
| Reviewer / approver | Explicit user authorization in the Codex tasks on 2026-09-11 and 2026-09-12; independent reviewer still pending |
| Backup/PITR timestamp | Not evidenced in this task |
| Isolated migration replay | PASS — PostgreSQL 17, complete 30-migration replay |
| Staging rehearsal | Pending |
| Pre-migration audit result | FAIL baseline — 122 tables; broad existing/default Data API grants; zero unprotected tables and zero public policies |
| Applied migration IDs | `202609110001_booking_schedule_integrity`, `202609110002_customer_identity_security`, `202609110003_supabase_current_schema_default_deny`, `202609120001_remove_legacy_market_defaults` |
| Post-migration audit result | `PASS_SQL_CONTROLS_MANUAL_PLATFORM_CHECKS_REMAIN` — 126 tables, zero SQL violations |
| Data API disabled | Pending Dashboard evidence |
| Security Advisor rerun | Pending Dashboard evidence |
| Repository-owned consumer inventory | PASS — no Supabase client, REST, GraphQL, RPC or Storage data path in the four frontends |
| External consumer inventory owner | Pending human assignment for repositories outside this workspace |
| Monitoring window result | Pending |

The first attempt of `202609110003` aborted because hosted Supabase does not permit `postgres` to alter default ACLs owned by `supabase_admin`. PostgreSQL rolled back the migration. The compatibility fix narrowed the automatic default-ACL gate to owners of application tables, passed 14 focused local tests and a live always-rollback rehearsal, was marked rolled back through Prisma, and then applied successfully. No permissions were elevated.

## Completion rule

The repository fix may be reviewed without production access. The live security finding is complete only when the migration, Dashboard configuration, read-only post-deployment audit, Security Advisor result and external-consumer inventory all have retained evidence.

Until then, report:

```text
REPOSITORY SECURITY FIX: READY FOR REVIEW
LIVE SECURITY FIX: INCOMPLETE
PRODUCTION DEPLOYMENT: NOT AUTHORIZED
```
