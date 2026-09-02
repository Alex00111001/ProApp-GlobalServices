# F5 Operations Control release record

## Scope

- Versioned administrative operations API under `/api/v1/admin/operations`.
- Least-privilege read/manage permissions and RBAC role grants.
- Error Explorer, Incident Center, readiness/history, jobs, integrations, alerts and read-only financial monitoring.
- Durable support cases, events and comments with assignment and lifecycle controls.
- Admin Web Operations and Support surfaces.
- Additive migration `202609020001_operations_support_control` with forced RLS/default deny.

## Safety decisions

- Dedicated F4 admin sessions are mandatory; the legacy administrative JWT cannot access versioned endpoints.
- Provider/worker errors and payloads are replaced by a `hasError` signal.
- Financial monitoring performs no money movement.
- Dead-letter replay is not exposed until a separate idempotency/approval contract exists.
- Production remains inactive.

## Verification

- Prisma 7.10 format, validate and generate: passed.
- Supabase test: migration applied; 15/15 migrations current; RBAC synchronized.
- Backend build plus unit/contract/security tests: 95/95 passed.
- Admin Web lint/test/build: passed; 5/5 UI/contract tests passed.
- PostgreSQL/Supabase integration: 11/11 passed after migration, including F1–F4 regression and F5 HTTP/support/RLS coverage.
- Root verification: passed for backend, Admin Web, customer mobile and professional mobile.
- Prisma baseline audit: passed with no missing or mismatched baseline objects.
- Secret scan: passed with no findings.
- Dependency audits: root, backend and Admin Web have zero findings; mobile workspaces have no high/critical findings and retain documented moderate Expo transitive advisories whose automatic fixes require breaking downgrades.
- RBAC catalog bootstrap was converted from sequential per-row upserts to bounded bulk synchronization after the Supabase pooler exposed the prior latency risk.
- Remote CI: [Platform verification 33612091154](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/33612091154) passed all three jobs for implementation commit `78536bd`.

## Rollback

Rollback application code first and retain F5 support/event/audit tables. Do not reverse or delete operational history. Use a forward migration for schema defects. Production activation requires a separate go/no-go review.
