# Cash payment quarantine runbook

## Scope

This runbook governs the containment in ADR 0009 and the Option B permanent retirement in ADR 0010.
It does not authorize cash collection, cash settlement, manual database correction, live provider actions
or Market activation. CASH is not an active product capability.

## Required configuration

`CASH_PAYMENT_ENABLED=false` is the legacy safety guard in every environment. The API refuses to start if
the value is `true`; omitting it resolves safely to `false`. A configuration flag cannot restore CASH.

The authenticated legacy endpoint `POST /api/payments/cash` remains only for the versioned support window.
Every request returns HTTP `409`, code `CASH_PAYMENT_DISABLED`, `Cache-Control: no-store` and the request
correlation identifier. Rejection happens before reading the booking, writing a payment, changing a
booking or contacting a payment provider. The client does not advertise or invoke this endpoint.

## Operational verification

1. Verify the deployed commit and the successful exact-SHA CI run.
2. Verify `CASH_PAYMENT_ENABLED` is absent or exactly `false` without printing environment values.
3. Send one authenticated request in a non-production environment and verify the stable `409` contract.
4. Confirm logs contain `CASH_PAYMENT_DISABLED` with request correlation and no payment or booking data.
5. Confirm database write metrics and payment-provider traffic do not increase for the request.

## Alert and incident handling

A sustained increase in `CASH_PAYMENT_DISABLED` means an old client is replaying a removed capability.
Operations must identify the client version using bounded telemetry, keep the rejection active and open a
support incident. Do not include payment data or unnecessary personal data in incident evidence.

If any cash request changes `Payment` or `Booking`, treat it as a critical financial-integrity incident:
stop the affected release, preserve evidence, execute the read-only impact inventory and escalate to the
finance and security owners. Never repair affected rows manually; corrections require a reviewed,
transactional and auditable compensating procedure.

## Retirement and re-enablement

Rolling back to the prior mutating controller is prohibited. The legacy route may be removed only in a
separately reviewed breaking-contract release after a minimum client version, support window and approved
communication exist. Cash can return only after a new accepted ADR, application-service workflow,
additive migration when required, authorization, idempotency, immutable financial evidence, audit/outbox
telemetry, PostgreSQL concurrency tests, client rollout plan and explicit production approval.

That future gate also requires provider-hosted card setup, no PAN/CVC storage, current provider usability,
versioned market-specific consent for the fee and later collection, required setup authentication,
idempotent charge commands, signed-webhook reconciliation, limits/retries/notices, insufficient-funds and
authentication-required recovery, debt/suspension handling, legal/privacy/tax review and provider-contract
tests. A registered card alone must never be interpreted as successful collection.
