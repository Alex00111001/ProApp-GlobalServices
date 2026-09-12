# Database migration procedure

The reviewed history contains 30 migrations after the Spain database/domain slice. `202609100001_supply_demand_ai_operations` is additive: 20 forced-RLS/default-deny tables, restrictive foreign keys, lifecycle/value/four-eyes constraints, immutable evidence triggers and no cascade deletes. Rollback is application-first; never delete the migration or drop evidence tables after deployment.

The Spain-readiness slice adds `202609110001_booking_schedule_integrity`, `202609110002_customer_identity_security` and the security catch-all `202609110003_supabase_current_schema_default_deny`. All three were applied with explicit authorization to project `qwqvzlhxkolgzyaxacfe` on 2026-09-11. The catch-all transactionally reasserts the backend-only boundary after every preceding schema change: public Data API roles (including `service_role`) lose current access to application objects and future-object defaults owned by application table owners, every application table is forced-RLS, and public policies are removed. Supabase-managed defaults remain platform evidence and require the Data API to be disabled. See `docs/security/SUPABASE_PRODUCTION_HARDENING.md` for the complete evidence and remaining manual gates.

`202609120001_remove_legacy_market_defaults` is a non-destructive expand/contract correction. It only drops the `MX`/`MXN`/legacy `EUR` defaults from `ClientProfile.country`, `Booking.currency`, and `Payment.currency`; it does not update historical rows. New writes must provide values from registration market or booking commercial context. It was applied with explicit authorization to project `qwqvzlhxkolgzyaxacfe` on 2026-09-12; Prisma reports all 30 migrations current and the post-deployment SQL audit passes with zero violations.

Prisma CLI uses `DIRECT_URL` when configured and falls back to `DATABASE_URL`. Keep the pooled runtime URL in `DATABASE_URL`; reserve the direct connection for migrations, baseline audits and integration gates.

The repository has a versioned additive history beginning with:

- `00000000000000_baseline` reproduces the schema that existed before migration tracking was introduced.
- `202608300001_foundation` and later migrations add RBAC, observability, billing, pricing separation, legal evidence, Stripe inbox and refund decisions.
- `202608310003_payout_dispute_reconciliation` adds Stripe Connect payout, dispute and reconciliation evidence plus ledger links. It is additive and enables RLS without public policies on the new financial tables.
- `202609020002_growth_data` adds Campaign, Lead and Conversion plus backward-compatible MarketingEvent idempotency/context fields. It is additive, default-deny/RLS protected and contains no data deletion.
- `202609080001_referrals_automation` adds the versioned referral and automation domains, lifecycle/idempotency/check constraints, query indexes, restrictive evidence relations and independent `OutboxEvent` fan-out.
- `202609080002_referrals_automation_force_rls` forces RLS for all fourteen F8 tables. Supabase API roles remain default-deny and the backend role must explicitly bypass RLS.
- `202609090001_markets_identity_geography` adds Country, Market, versioned MarketPolicy, official geography import/change evidence, hierarchical divisions, protected identity documents, normalized addresses, professional service areas and F6/F7/F8/F3-compatible nullable market relations. It seeds ES/BR/CL as `DISABLED`, performs only explicit compatibility backfills and forces default-deny RLS on all eleven new tables.

## Existing database

Do not reset it and do not execute the baseline SQL against populated tables. Before deployment:

1. Back up the database and capture a schema-only dump.
2. Configure `DIRECT_URL` without committing it.
3. Run `npm run db:audit-baseline`. The command is read-only and fails if any baseline table, column/type/nullability, enum, index or constraint is missing or incompatible. Additional Supabase-managed objects such as `public.profiles` are reported but not modified.
4. Mark only the baseline as applied with `prisma migrate resolve --applied 00000000000000_baseline`.
5. Scan pending SQL for destructive statements and run `prisma migrate deploy`; never execute the generated baseline SQL over existing tables.
6. Run `npm run seed:rbac` to synchronize system roles and permissions.
7. Run `prisma migrate status`, the unit suite and the explicit PostgreSQL integration gate before enabling new flags.
8. For Supabase production, run the project-ref-guarded read-only `npm run security:audit-supabase-live`, disable the Dashboard Data API for the backend-only architecture, and retain the rerun Security Advisor evidence. Never infer those platform settings from migration files alone.

The database integration gate is deliberate and refuses production mode. F8.5 requires both the full suite and its isolated market/identity/geography fixture:

```powershell
$env:RUN_DATABASE_INTEGRATION_TESTS='true'
$env:NODE_ENV='test'
npm run test:integration
```

It creates uniquely identified fixtures, tests concurrent inbox/capture/refund behavior plus official geography import, four-eyes policy activation, dynamic registration, protected identity persistence, normalized address hierarchy, masked RBAC reads and audit evidence, and cleans only those fixture IDs.

Any unexpected drift blocks deployment until it has a reviewed reconciliation migration. Never use `prisma db push` for production changes.

The baseline audit treats columns, tables, indexes and constraints introduced by later additive migrations as allowed additions. It still blocks any missing baseline object or any incompatible baseline column type/nullability or enum definition.

## New database

Run `prisma migrate deploy`, then the application seed and `npm run seed:rbac`. All migrations apply in order.

## Rollback stance

Foundation is additive. Prefer a forward correction migration. Do not drop its tables after they contain audit, event or idempotency history. If application rollback is required, disable new entry points with feature flags while retaining the schema.
