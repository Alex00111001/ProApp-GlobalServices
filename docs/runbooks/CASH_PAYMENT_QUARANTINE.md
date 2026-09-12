# Cash payment quarantine runbook

## Scope

This runbook governs the containment introduced by ADR 0009. It does not authorize cash collection,
cash settlement, manual database correction, live provider actions or Market activation.

The approved product requirement for a future workflow is that cash may be offered only to professionals
with a reusable provider-tokenized card registered for collection of platform usage fees. This requirement
does not lift the quarantine and does not authorize any fee charge.

## Required configuration

`CASH_PAYMENT_ENABLED=false` is mandatory in every environment. The API validates this at startup and
refuses to start if the value is `true`. Omitting the variable also resolves safely to `false`.

The authenticated legacy endpoint `POST /api/payments/cash` remains present for mobile contract
compatibility. Every request returns HTTP `409`, code `CASH_PAYMENT_DISABLED`, `Cache-Control: no-store`
and the request correlation identifier. Rejection happens before reading the booking, writing a payment,
changing a booking or contacting a payment provider.

## Operational verification

1. Verify the deployed commit and the successful exact-SHA CI run.
2. Verify `CASH_PAYMENT_ENABLED` is absent or exactly `false` without printing environment values.
3. Send one authenticated request in a non-production environment and verify the stable `409` contract.
4. Confirm logs contain `CASH_PAYMENT_DISABLED` with request correlation and no payment or booking data.
5. Confirm database write metrics and payment-provider traffic do not increase for the request.

## Alert and incident handling

A sustained increase in `CASH_PAYMENT_DISABLED` means a client still offers cash or is replaying an old
request. Operations must identify the client version using bounded telemetry, keep the quarantine active,
remove the option from the client and open a product incident. Do not include payment data or unnecessary
personal data in incident evidence.

If any cash request changes `Payment` or `Booking`, treat it as a critical financial-integrity incident:
stop the affected release, preserve evidence, execute the read-only impact inventory and escalate to the
finance and security owners. Never repair affected rows manually; corrections require a reviewed,
transactional and auditable compensating procedure.

## Rollback and re-enablement

Rolling back to the prior mutating controller is prohibited. A rollback must preserve the deny response or
disable the route at an earlier trusted layer. Cash can be re-enabled only after a separate accepted ADR,
application-service workflow, additive migration when required, authorization, idempotency, immutable
financial evidence, audit/outbox telemetry, PostgreSQL concurrency tests, client rollout plan and explicit
production approval.

That future gate also requires provider-hosted card setup, no PAN/CVC storage, current provider usability,
versioned market-specific consent for the fee and later collection, required setup authentication,
idempotent charge commands, signed-webhook reconciliation, limits/retries/notices, insufficient-funds and
authentication-required recovery, debt/suspension handling, legal/privacy/tax review and provider-contract
tests. A registered card alone must never be interpreted as successful collection.
