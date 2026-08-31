# F3 financial foundation release record

- Phase: F3
- Domain: Billing and Revenue, Booking, Admin Operations
- Risk: CRITICAL
- Capability tier / model: DEEP / Sol
- Environment validated: Supabase test only
- Production activation: not authorized; all new financial flags remain disabled
- Governing ADR: [ADR 0001](../adr/0001-stripe-connect-separate-charges-transfers.md)

## Scope

- Stripe capture evidence includes the source charge.
- Booking completion creates one earning and optionally one payout request atomically.
- Payout approval and execution use three distinct actors, RBAC, provider validation, stable idempotency and balanced ledger posting.
- Stripe dispute webhooks persist before processing and optionally recover completed transfers.
- Finance operations can inspect payouts/disputes and run bounded, audited reconciliation.
- Refund execution fails closed when a professional payout needs explicit adjustment or recovery.

## Verification evidence

- Prisma format, validate and client generation: passed with Prisma 7.9.1.
- Baseline audit against Supabase test: passed; later additive objects reported as allowed.
- Migration `202608310003_payout_dispute_reconciliation`: applied successfully to Supabase test.
- Prisma migration status: all migrations applied after deploy.
- RBAC catalog synchronization: passed.
- Backend unit suite: 53/53 passed.
- Supabase concurrency gate: passed; independent connections produced one inbox record, one capture posting, one payout provider call/posting, and one legal refund provider call/posting.
- Live Stripe charges/transfers/refunds: not executed. Provider commands were mocked; feature flags remain disabled.

## Feature flags

- `FINANCIAL_PAYOUT_REQUESTS_ENABLED=false`
- `FINANCIAL_PAYOUT_EXECUTION_ENABLED=false`
- `FINANCIAL_DISPUTE_RECOVERY_ENABLED=false`
- `FINANCIAL_RECONCILIATION_ENABLED=false`
- `FINANCIAL_LEDGER_DUAL_WRITE_ENABLED=false` by default

## Rollback and recovery

Disable execution/recovery/reconciliation flags first. Disable request creation if no new payout queue should be produced. Keep schema, provider identifiers, integration inbox, outbox, audit, reconciliation and ledger evidence. Retry accepted Stripe operations with their existing idempotency keys; do not create replacement financial records or mutate posted entries.

## Remaining production prerequisites

- Configure and verify real connected-account onboarding and required recipient capabilities by market.
- Configure production webhook destinations and secrets under a separately authorized release.
- Run Stripe test-mode end-to-end events against the deployed test API.
- Establish finance owners, reconciliation schedule, alerts and approval staffing before any live activation.
