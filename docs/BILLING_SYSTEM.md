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
