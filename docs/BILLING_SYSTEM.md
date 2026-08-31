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

Creating a request does **not** invoke `stripe.refunds.create` or move money. Even a policy outcome of `APPROVED` creates a `REQUESTED` record so the privileged review workflow can enforce four-eyes controls.

Administrative review is exposed under `/api/admin/refunds` and requires `refunds.manage`. List/detail endpoints expose the stored decision and evidence; approve/reject mutations are transactional, conditional and audited. The requester cannot approve the same refund, and zero-value/manual-review decisions cannot be approved without a later explicit resolution workflow.

## Stripe refund execution rollout

`POST /api/admin/refunds/:id/execute` also requires `refunds.manage` and is unavailable unless `FINANCIAL_REFUND_EXECUTION_ENABLED=true`. The flag defaults to `false`. Execution accepts only a previously approved request with requester/approver separation, a captured Stripe payment and separated amounts that remain within the captured total, service amount and customer platform fee.

Each request uses the stable Stripe idempotency key `refund:<refundId>:execute`. A conditional five-minute processing lease prevents concurrent execution of the same request; a retry retrieves a previously stored provider refund instead of creating another. Stripe amount, currency, payment intent and internal refund metadata are checked against the approved evidence before internal finalization.

A succeeded provider refund is finalized in one database transaction: the refund becomes `COMPLETED`, the payment refund projection is updated, the platform-fee state is adjusted when appropriate, and the outbox, audit and customer notification records are created. When `FINANCIAL_LEDGER_DUAL_WRITE_ENABLED=true`, finalization additionally requires the original capture ledger transaction and posts one balanced, idempotent reversal linked to the refund. Posted ledger evidence is never edited or deleted.

Stripe responses that are not yet final return HTTP `202` and retain `PROCESSING`. Signed `refund.created`, `refund.updated` and `refund.failed` events enter the same persistent integration inbox used by payment events, then reconcile only when `metadata.refundId`, amount, currency and PaymentIntent match the internal evidence. Webhook replay cannot repeat finalization, failure outbox/audit records, customer notification or ledger reversal. The webhook remains able to reconcile an already accepted provider operation after the execution flag is disabled; disabling a flag is not a substitute for settling in-flight money movement. If no final webhook arrives, retry the same administrative endpoint after the five-minute lease to retrieve the same provider refund.

A provider refund reported as failed/canceled leaves the internal request `FAILED` with its provider identifier and reason. Do not clear that identifier or reuse the record for a different provider operation; investigate and create a separately approved corrective request if another financial attempt is required.

Before enabling either refund flag in a deployed environment:

1. Seed and review country-specific policies and policy acceptances.
2. Shadow-evaluate cancellations and inspect `MANUAL_REVIEW`/missing-policy events.
3. Confirm every request amount against the captured payment and legacy projection.
4. Replay the same approved execution and confirm Stripe receives one operation and internal finalization occurs once.
5. Validate concurrent requests for one payment against isolated PostgreSQL and prove cumulative total/component limits under contention.
6. Verify pending, failed and succeeded provider responses, including recovery after the processing lease.
7. Enable execution only in a controlled test environment while reconciling Stripe, payment projections and ledger debits/credits.

Rollback is application-first: disable `FINANCIAL_REFUND_EXECUTION_ENABLED`, then disable `FINANCIAL_REFUND_REQUESTS_ENABLED` if new requests must also stop. Retain provider identifiers, decisions, requests, inbox events and ledger entries as financial evidence; do not delete or rewrite them. Disabling a flag does not cancel an operation already accepted by Stripe, so pending provider refunds must still be reconciled operationally.
