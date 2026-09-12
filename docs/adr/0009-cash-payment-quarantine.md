# ADR 0009 — Cash payment quarantine

- Status: Accepted
- Date: 2026-09-12
- Owners: Product, Billing, Marketplace, Security and Operations
- Supersedes: none
- Governing architecture section: [Billing and revenue foundation](../BILLING_SYSTEM.md)

## Context

The legacy authenticated cash-confirmation endpoint can upsert a `Payment` as `PENDING/CASH` and set an
owned booking directly to `CONFIRMED` without enforcing the booking transition machine, professional
acceptance, payment terminal-state protection, durable idempotency or concurrency with card webhooks and
cancellation. It can revive terminal bookings or degrade captured Stripe evidence.

Cash is not equivalent to provider capture. A customer declaration is not settlement and cannot create
professional earnings, ledger entitlement or a confirmed booking. The correct cash collection,
verification, settlement, dispute, refund and reconciliation policy is not yet approved.

## Decision

Cash mutation is quarantined and disabled by default in every environment. The existing route may remain
for public compatibility, but when disabled it returns a stable non-success response before any database
or provider mutation. There is no production fallback that enables it implicitly.

Re-enabling cash requires a separately reviewed workflow owned by an application service. It must define
declaration versus verified settlement, actor-specific transitions, professional acceptance, booking and
payment CAS rules, durable idempotency, audit/outbox evidence, immutable financial correction,
reconciliation, legal/tax consequences and operational exception handling. Captured, refunded, paid-out
or disputed provider evidence can never be overwritten by cash.

Cash may be offered only to an eligible professional who has registered a reusable card through the
payment provider for collection of the platform's approved usage fees. HomeServices stores provider
references and bounded card display metadata only, never PAN or CVC. Eligibility fails closed unless the
provider confirms that the payment method is usable, the professional has accepted the current
market-specific fee and off-session collection terms, any required setup authentication has completed,
and the account has no blocking debt, dispute or risk restriction. Eligibility must be revalidated when
cash is selected and before each fee collection; a card on file reduces collection risk but is not treated
as guaranteed settlement.

The future decision must separately approve when and how the platform fee is authorized or collected,
limits, retries, insufficient-funds handling, card replacement, professional notice, dispute/refund rules,
debt recovery and suspension. Provider commands require stable idempotency and signed-webhook
reconciliation. No fee may be charged merely because a booking was created, cancelled or declared cash
without the versioned Market Policy, accepted terms and the approved charge-trigger evidence.

Cash may be offered only to an eligible professional who has registered a reusable card through the
payment provider for collection of the platform's approved usage fees. HomeServices stores provider
references and bounded card display metadata only, never PAN or CVC. Eligibility fails closed unless the
provider confirms that the payment method is usable, the professional has accepted the current
market-specific fee and off-session collection terms, any required setup authentication has completed,
and the account has no blocking debt, dispute or risk restriction. Eligibility must be revalidated when
cash is selected and before each fee collection; a card on file reduces collection risk but is not treated
as guaranteed settlement.

The future decision must separately approve when and how the platform fee is authorized or collected,
limits, retries, insufficient-funds handling, card replacement, professional notice, dispute/refund rules,
debt recovery and suspension. Provider commands require stable idempotency and signed-webhook
reconciliation. No fee may be charged merely because a booking was created, cancelled or declared cash
without the versioned Market Policy, accepted terms and the approved charge-trigger evidence.

Until that workflow is accepted and fully verified, `CASH_PAYMENT_ENABLED=false` is mandatory and cash
does not qualify as a completion prerequisite or financial entitlement.

## Alternatives considered

- Keep the endpoint while adding only a booking-state check: rejected; it leaves payment overwrite,
  replay, settlement and concurrency defects.
- Delete the route immediately: rejected during compatibility; clients need a stable governed error and
  version migration.
- Treat customer declaration as settlement: rejected as false financial evidence.
- Repair existing records automatically: rejected; impact review is read-only and any correction must be
  case-reviewed and compensatory.

## Consequences and risks

Any client currently attempting cash will receive a stable unavailable response. This is an intentional
safe failure. Product must either remove cash from offered methods or fund the complete governed workflow.
The quarantine reduces immediate integrity risk but does not by itself prove that historical rows are
correct.

## Contracts and data migration

The containment slice needs no schema migration and changes no existing record. The route contract adds a
stable error code and no-store response. A future cash workflow uses additive schema and preserves legacy
records until reconciled; it cannot reinterpret them in place.

## Security, privacy, and financial impact

Authorization and ownership remain required even for a disabled compatibility route to avoid resource
probing. No amount, payment status, ledger row, booking status, notification, audit or outbox record is
mutated on rejection. Production configuration validates that cash is not enabled without an accepted
workflow version.

Future card registration must use provider-hosted/tokenized collection and a setup flow suitable for the
approved later charge model. Consent evidence records professional, market, policy/version, locale,
timestamp and method without copying card data. Legal, privacy, tax, SCA/off-session and card-network
review remain blocking per market; this ADR does not invent their outcome.

Future card registration must use provider-hosted/tokenized collection and a setup flow suitable for the
approved later charge model. Consent evidence records professional, market, policy/version, locale,
timestamp and method without copying card data. Legal, privacy, tax, SCA/off-session and card-network
review remain blocking per market; this ADR does not invent their outcome.

## Observability and verification

Tests prove default-disabled behavior, zero mutation, stable error code, ownership protection and absence
of implicit production enablement. Regression cases cover cancelled/completed bookings, completed Stripe
payments, replay and concurrent requests. A read-only impact query reports counts/categories without
exposing unnecessary personal data.

The future workflow additionally requires provider-contract and PostgreSQL tests for missing/expired
payment methods, revoked consent, authentication-required responses, duplicate fee commands, webhook
replay, insufficient funds, card replacement, concurrent bookings and suspension/debt recovery.

The future workflow additionally requires provider-contract and PostgreSQL tests for missing/expired
payment methods, revoked consent, authentication-required responses, duplicate fee commands, webhook
replay, insufficient funds, card replacement, concurrent bookings and suspension/debt recovery.

## Rollout and rollback

Deploy the deny path first with cash absent from client payment choices. Rollback of the containment is not
automatic: the flag remains off. A future activation is a new reviewed release with sandbox/staging
reconciliation evidence. Existing financial rows are never deleted or rewritten by rollback.

## Approval evidence

Accepted by the user's explicit authorization on 2026-09-12 to apply GOV-01 through GOV-06 and begin the
PRR-0 cash containment. This does not authorize cash settlement, live payments, data correction or
production activation.
