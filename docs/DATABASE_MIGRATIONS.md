# Database migration procedure

Prisma CLI uses `DIRECT_URL` when configured and falls back to `DATABASE_URL`. Keep the pooled runtime URL in `DATABASE_URL`; reserve the direct connection for migrations, baseline audits and integration gates.

The repository has a versioned additive history beginning with:

- `00000000000000_baseline` reproduces the schema that existed before migration tracking was introduced.
- `202608300001_foundation` and later migrations add RBAC, observability, billing, pricing separation, legal evidence, Stripe inbox and refund decisions.
- `202608310003_payout_dispute_reconciliation` adds Stripe Connect payout, dispute and reconciliation evidence plus ledger links. It is additive and enables RLS without public policies on the new financial tables.
- `202608310003_payout_dispute_reconciliation` adds Stripe Connect payout, dispute and reconciliation evidence plus ledger links. It is additive and enables RLS without public policies on the new financial tables.

## Existing database

Do not reset it and do not execute the baseline SQL against populated tables. Before deployment:

1. Back up the database and capture a schema-only dump.
2. Configure `DIRECT_URL` without committing it.
3. Run `npm run db:audit-baseline`. The command is read-only and fails if any baseline table, column/type/nullability, enum, index or constraint is missing or incompatible. Additional Supabase-managed objects such as `public.profiles` are reported but not modified.
4. Mark only the baseline as applied with `prisma migrate resolve --applied 00000000000000_baseline`.
5. Scan pending SQL for destructive statements and run `prisma migrate deploy`; never execute the generated baseline SQL over existing tables.
6. Run `npm run seed:rbac` to synchronize system roles and permissions.
7. Run `prisma migrate status`, the unit suite and the explicit PostgreSQL integration gate before enabling new flags.

The database integration gate is deliberate and refuses production mode:

```powershell
$env:RUN_DATABASE_INTEGRATION_TESTS='true'
$env:NODE_ENV='test'
npm run test:integration
```

It creates uniquely identified fixtures, tests concurrent inbox/capture/refund behavior and cleans only those fixture IDs.

Any unexpected drift blocks deployment until it has a reviewed reconciliation migration. Never use `prisma db push` for production changes.

The baseline audit treats columns, tables, indexes and constraints introduced by later additive migrations as allowed additions. It still blocks any missing baseline object or any incompatible baseline column type/nullability or enum definition.

The baseline audit treats columns, tables, indexes and constraints introduced by later additive migrations as allowed additions. It still blocks any missing baseline object or any incompatible baseline column type/nullability or enum definition.

## New database

Run `prisma migrate deploy`, then the application seed and `npm run seed:rbac`. All migrations apply in order.

## Rollback stance

Foundation is additive. Prefer a forward correction migration. Do not drop its tables after they contain audit, event or idempotency history. If application rollback is required, disable new entry points with feature flags while retaining the schema.
