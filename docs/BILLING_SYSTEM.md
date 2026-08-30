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

## Refund request rollout

Migration `202608310002_refund_decisions` adds an immutable `RefundDecision`, provider/approval processing fields and an optional ledger link. It is additive: existing refund rows remain valid and no historical amount or status is rewritten.

`FINANCIAL_REFUND_REQUESTS_ENABLED` defaults to `false`. When enabled, the first successful cancellation transition may create one request using the stable key `booking:<bookingId>:cancellation-refund`. A repeated cancellation returns the existing result and does not duplicate notifications, audit records, outbox events or refund requests.

Policy selection prefers the policy recorded in `BookingPolicyAcceptance`; otherwise it selects the newest active policy for the booking country, then a global policy. The decision records the exact policy/version, country, context, matched rule and separated service/platform-fee amounts. Percentages use deterministic basis-point arithmetic and cumulative requests cannot exceed the captured customer amount.

This stage does **not** invoke `stripe.refunds.create` and does not move money. Even a policy outcome of `APPROVED` creates a `REQUESTED` record so a privileged approval/execution workflow can enforce four-eyes controls. Before enabling the flag:

1. Seed and review country-specific policies and policy acceptances.
2. Shadow-evaluate cancellations and inspect `MANUAL_REVIEW`/missing-policy events.
3. Confirm every request amount against the captured payment and legacy projection.
4. Keep provider execution unavailable until approval, retry leases and Stripe idempotency have integration coverage.

Rollback is application-first: disable `FINANCIAL_REFUND_REQUESTS_ENABLED`. Retain decisions and requests as financial evidence; do not delete or rewrite them.
