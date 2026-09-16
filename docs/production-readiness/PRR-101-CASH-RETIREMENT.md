# PRR-101 — Option B CASH compatibility-retirement plan

- Phase: PRR-1 / PRR-101
- Domain: Billing, customer checkout and legacy API compatibility
- Risk: HIGH
- Capability tier: DEEP
- Decision: Option B — permanently remove CASH from the product
- Authority: Alejandro's explicit repository instruction, 2026-09-16; organizational role is not independently asserted
- Governing decision: [ADR 0010](../adr/0010-governed-cash-payment-workflow.md)
- Schema/migration: none
- Production/Markets/live money: OFF / not authorized

## Contract retirement

1. The supported customer checkout offers only provider-backed card payment. It has no CASH selector,
   action or client API call.
2. `POST /api/payments/cash` is a legacy compatibility rejection, not a payment capability. It remains
   authenticated, returns `409 CASH_PAYMENT_DISABLED` with `Cache-Control: no-store`, and performs no
   database or provider operation.
3. The compatibility window has no public sunset date yet because no approved minimum client version,
   support communication or qualified Legal/Privacy review exists. Route deletion is therefore blocked
   until a separately reviewed breaking-contract release.
4. `CASH_PAYMENT_ENABLED=true` is a startup error. A configuration value cannot reactivate a product
   capability; a future return requires a new accepted ADR and complete governed-CASH gates.

## Historical evidence and non-destructive boundary

Existing `Payment.method = CASH` remains a read-only historical value in storage and mobile receipt types.
No historical payment, booking, audit, ledger, retention policy or database schema is deleted, rewritten
or reclassified. There is no backfill and no provider command.

## Acceptance evidence

The implementation must prove all of the following for its exact delivery SHA:

- checkout no longer advertises or calls CASH;
- the legacy endpoint is authenticated and returns the stable denial before any database/provider access;
- an attempted `CASH_PAYMENT_ENABLED=true` fails startup validation;
- card checkout typecheck/regression, backend unit/contract tests, secret scan and required remote CI pass;
- release evidence links the exact SHA and CI run.

## Residual release blockers

Qualified Legal/Privacy review must approve any public removal communication and legacy-evidence treatment.
Support must name the minimum client version and support window before the legacy endpoint is deleted.
Neither pending item permits CASH, a Market activation, a production deploy or any money movement.

## Rollback

Application rollback may correct presentation defects while preserving the denial route. It must never
restore a mutating cash command or offer. Reintroducing CASH is a new product and financial decision,
requiring a new accepted ADR and the complete Option A workflow.
