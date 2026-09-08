# ADR 0003: Versioned referrals and PostgreSQL-backed durable automation

- Status: accepted for F8 test/staging implementation
- Date: 2026-09-08
- Production activation: not authorized

## Context

F1 provides authoritative domain events and a transactional outbox; F2 provides safe correlation/telemetry; F3 owns all financial state; F4 owns admin identity/RBAC/audit; F5 exposes operational failures; F6/F7 provide first-party growth and consent boundaries. F8 needs referrals and automation without turning promotion codes into identity authority, competing with the outbox publisher, executing untrusted code or moving money from Growth.

## Decision

Use immutable program/automation versions and PostgreSQL as the durable state machine. A restricted database trigger fans every F1 `OutboxEvent` into one `AutomationEventDelivery`. The original outbox state remains owned by its publisher. Workers lease delivery/step rows with `SKIP LOCKED`; unique constraints and transactional actions provide exactly-once-effect semantics under retry.

Referral qualification consumes only authoritative events and links rather than duplicates F6/F3 facts. Reward calculation is versioned, but monetary fulfillment is rejected and any future financial request must be an idempotent F3-owned command.

Conditions and actions use closed code registries with bounded schemas. There is no arbitrary JavaScript, expression language, HTTP action or persistent timer. Delays and retries are database timestamps. Current F7 consent is re-evaluated immediately before purpose-bound notification actions.

All F8 tables use restrictive foreign keys, uniqueness/check constraints, forced RLS and default-deny Supabase API grants. Admin access uses F4 sessions and narrow permissions. Manual dead-letter replay has no endpoint.

## Invariants

1. A referred user has at most one referral per program.
2. A code owner and referred user must differ, and a reverse relationship blocks circular claims.
3. A source domain event creates at most one referral conversion.
4. A referral/beneficiary side creates at most one reward.
5. A version/source event creates at most one automation execution.
6. An execution/action and its deterministic idempotency key create at most one step/effect.
7. Historical program/automation versions and execution references never change silently.
8. F8 never writes `LedgerTransaction`, payment, payout, refund, revenue or balance state.
9. Consent-dependent actions use the latest valid F7 state and skip closed after withdrawal.
10. No public API accepts owner, beneficiary, reward amount, qualified or converted authority from clients.

## Alternatives rejected

- Promotional-code-only model: lacks authoritative lifecycle, versions, anti-fraud and reward evidence.
- Cron jobs or `setTimeout`: lose state on process restart and cannot safely coordinate workers.
- Reusing the F1 outbox status as an automation consumer offset: creates competing-consumer data loss.
- Redis/BullMQ: introduces infrastructure not otherwise approved; PostgreSQL already satisfies durable scheduling and locking requirements.
- General expression/JavaScript or HTTP actions: creates code execution, SSRF, secret and nondeterminism risks.
- Direct Growth ledger writes: violates F3 authority and accounting invariants.
- Automatic heuristic account blocking: signals are insufficient for irreversible enforcement and may create unfair outcomes.

## Consequences

The system gains replay-safe, inspectable executions and deterministic historical results without a new infrastructure dependency. Database fan-out increases one row per domain event and requires retention/capacity monitoring. Adding event/action types requires a deployment rather than an admin-only edit, which is an intentional safety boundary. Reward fulfillment and controlled replay remain future separately reviewed capabilities, not F8 stubs.

## Rollout and rollback

Deploy migrations first, synchronize RBAC, keep all flags false, validate Admin visibility, enable program flags, then enable referrals and finally worker execution in a bounded test cohort. Roll back by disabling flags and stopping workers while retaining data. Never roll back by deleting evidence or weakening RLS.
