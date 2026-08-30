# Billing and revenue foundation

Billing separates four amounts that were previously conflated:

- `serviceAmount`: gross service price.
- `platformFee`: explicit fee charged to the customer in addition to the service.
- `professionalCommission`: amount deducted from professional gross earnings.
- `professionalEarnings`: payout projection after commission.

`totalPrice` remains the customer payment total for API compatibility. New quotes calculate all amounts in integer minor units and persist a pricing snapshot. Commercial percentages are read centrally from `CLIENT_PLATFORM_FEE_PERCENTAGE` and `PROFESSIONAL_COMMISSION_PERCENTAGE`; the customer fee defaults to zero, preserving current customer totals until explicitly enabled.

Migration `202608300004_pricing_separation` is strictly additive. It does not reinterpret existing financial records. Legacy bookings retain their original columns, while the new separated fields use safe defaults. A production backfill must first reconcile real payments, earnings and booking values and then be delivered as a separately reviewed migration or resumable job.

Rollback is application-first: disable the new pricing path and continue reading legacy projections. The added columns and enum remain in place because removing them after new bookings exist would discard financial evidence. Corrections are delivered forward; the migration is not reversed by dropping populated columns.

The ledger and refund policy models remain additive foundations. Payment capture posting, reversals and refund execution must use idempotency keys and balanced ledger transactions. No refund policy is treated as universally applicable: unmatched contexts require manual review.

## Payment capture and webhook rollout

Migration `202608310001_integration_event_inbox` adds an immutable-at-ingress integration inbox with a provider event uniqueness key, processing state, attempt count, correlation ID and timestamps. The migration is additive and does not alter existing `Payment`, `Booking` or ledger rows.

`FINANCIAL_LEDGER_DUAL_WRITE_ENABLED` defaults to `false`. The capture journal can shadow-compute both separated pricing and legacy bookings: a booking without `pricingSnapshot` treats the historical `platformFee` as professional commission and never as an added customer fee. Every journal must satisfy both invariants before posting:

- customer total = service amount + customer platform fee;
- service amount = professional payout + professional commission.

Stripe success events are persisted before processing. The webhook and authenticated confirmation endpoint share one conditional payment transition, so a replay cannot create a second notification, outbox event, audit record or ledger transaction. Provider amount, currency, booking metadata and transaction ID must match persisted state. Payment completion, booking confirmation, outbox/audit writes and the optional ledger post run in one database transaction.

The integration is active in application code, but ledger dual-write remains disabled by default. Enabling it in a deployed environment still requires transaction-level integration tests against isolated PostgreSQL and a reviewed rollout.

Operational rollout:

1. Apply the additive migration and confirm inbox indexes exist.
2. Keep dual-write disabled while comparing journal shadow calculations with legacy projections.
3. Send signed Stripe test events twice and confirm only one inbox result and one set of payment side effects exists.
4. Resolve every projection mismatch; do not mutate posted ledger entries or reinterpret legacy rows.
5. Enable dual-write for a controlled environment/market only after replay and concurrency tests pass.
6. Reconcile payment totals, ledger debits/credits and legacy projections before expanding rollout.

Rollback is application-first: turn off `FINANCIAL_LEDGER_DUAL_WRITE_ENABLED`. Retain inbox and ledger evidence. Failed events remain retryable; a `PROCESSING` lease older than five minutes can be reclaimed by a provider replay. Corrections use new reversal/adjustment transactions rather than updates or deletes.
