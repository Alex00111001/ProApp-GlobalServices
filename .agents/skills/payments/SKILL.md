---
name: payments
description: Design, implement, or audit HomeServices pricing, fees, commissions, Stripe payments, ledger entries, refunds, payouts, disputes, and reconciliation. Use for any money-moving or financial-state change; treat it as high or critical risk.
---

# Payments

Use the deep/critical model tier for design and final review. Read `docs/BILLING_SYSTEM.md`, the billing sections of `docs/IMPLEMENTATION_PLAN.md`, relevant Prisma migrations, and the full affected service flow.

## Financial invariants

- Distinguish service price, client platform fee, professional commission, taxes, discounts, captured amount, refundable amount, and professional earnings.
- Use Decimal or explicit minor-unit arithmetic; never binary floating point for money.
- Attach one currency to every amount and reject mixed-currency arithmetic.
- Make each external command and webhook replay idempotent with durable unique keys.
- Balance every posted ledger transaction; never update/delete posted entries.
- Use reversals or compensating entries for corrections.
- Prevent captured, refunded, paid-out, or disputed totals from exceeding their legal source amounts.
- Keep provider status, internal state, projections, and ledger state reconcilable.
- Require four-eyes approval where policy marks a mutation high impact.

## Workflow

1. Write the state transition, accounting entries, transaction boundary, retry behavior, and failure recovery before coding.
2. Separate pure policy/calculation from provider I/O and persistence.
3. Persist provider events before processing; record attempts and terminal/non-terminal failures.
4. Audit actor, reason, request/correlation ID, before/after, and policy version.
5. Roll out through shadow comparison, feature flags, and reconciliation.

Never issue live charges, refunds, payouts, disputes, or production configuration changes without explicit user authorization at the moment of action.

Completion requires unit decision tables, integration tests, replay/concurrency cases, ledger invariants, reconciliation evidence, telemetry, and a rollback/runbook.
