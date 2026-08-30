# Database migration procedure

The repository now has a two-step Prisma history:

- `00000000000000_baseline` reproduces the schema that existed before migration tracking was introduced.
- `202608300001_foundation` adds RBAC, feature flags, generalized audit, idempotency, outbox and marketing events.

## Existing database

Do not reset it and do not execute the baseline SQL against populated tables. Before deployment:

1. Back up the database and capture a schema-only dump.
2. Run `prisma migrate diff --from-url <database> --to-schema prisma/schema.prisma --script` in a protected environment and review drift.
3. Confirm the existing database matches the baseline schema.
4. Mark only the baseline as applied with `prisma migrate resolve --applied 00000000000000_baseline`.
5. Run `prisma migrate deploy`; this applies Foundation.
6. Run `npm run seed:rbac` to synchronize system roles and permissions.
7. Run smoke tests and verify the migration and audit tables before enabling new flags.

Any unexpected drift blocks deployment until it has a reviewed reconciliation migration. Never use `prisma db push` for production changes.

## New database

Run `prisma migrate deploy`, then the application seed and `npm run seed:rbac`. Both migrations apply in order.

## Rollback stance

Foundation is additive. Prefer a forward correction migration. Do not drop its tables after they contain audit, event or idempotency history. If application rollback is required, disable new entry points with feature flags while retaining the schema.
