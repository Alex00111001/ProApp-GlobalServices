# ADR 0001 — Stripe Connect separate charges and transfers

- Status: Accepted
- Date: 2026-08-31
- Owners: Platform Engineering, Finance Operations
- Supersedes: none
- Governing architecture section: [Implementation plan — Billing](../IMPLEMENTATION_PLAN.md#7-proposed-prisma-evolution)

## Context

HomeServices captures the customer's payment before service delivery and only owes the professional after the booking is completed. The platform needs an auditable delay between capture and professional payment, explicit approval controls, dispute recovery, and reconciliation without changing the existing customer payment API.

## Decision

Use Stripe Connect with separate charges and transfers. The customer PaymentIntent is created on the platform account. A transfer tied to the captured charge through `source_transaction` is created only after the booking is `COMPLETED`, the payment is `COMPLETED`, the professional earning is `PENDING`, the connected recipient capability is active, and a finance administrator has approved the request.

The requester, approver, and executor must be three distinct identities. Provider commands use durable idempotency keys. Stripe remains the provider record; PostgreSQL is the platform system of record. Provider events enter the persistent integration inbox before processing.

## Alternatives considered

- Destination charges: rejected because the professional destination is not known as part of the existing customer capture contract and the transfer must be delayed until service completion.
- Direct charges on connected accounts: rejected because they would change merchant responsibility, customer payment ownership, and the existing platform PaymentIntent flow.
- Immediate transfer at capture: rejected because it creates recovery risk before the service is delivered.
- Manual payouts outside the platform: rejected because it cannot provide durable idempotency, four-eyes approval, ledger linkage, or automated reconciliation.

## Consequences and risks

The platform is responsible for Stripe fees, refunds, disputes, and negative-balance exposure for platform charges. Refund execution is blocked once a non-cancelled professional payout exists until an explicit recovery or adjustment workflow resolves the professional side. An active dispute blocks payout execution. When dispute recovery is enabled, HomeServices reverses at most the unpaid portion of the related transfer using a stable idempotency key.

Stripe account onboarding and collection of verification requirements remain a separate professional-system capability. F3 stores the connected account reference and verifies recipient transfer capability at execution; it does not enable money movement by default.

## Contracts and data migration

Migration `202608310003_payout_dispute_reconciliation` is additive. It adds connected-account evidence, provider charge identity, `Payout`, `Dispute`, `ReconciliationRun`, `ReconciliationItem`, and ledger links. Existing payment, booking, earning, refund, and ledger rows are not rewritten.

Current mobile endpoints remain compatible. New administrative endpoints are mounted under `/api/admin` and protected by RBAC.

## Security, privacy, and financial impact

Connected account IDs and provider financial IDs are stored server-side and never treated as authorization evidence. Payout approval and execution require `payouts.manage`; dispute reads require `disputes.read`; reconciliation requires `reconciliation.run`. Sensitive mutations record actor, request/correlation/trace context, before/after state, and provider identifiers. New financial tables enable RLS with no public policies.

Posted ledger transactions are immutable. A payout posts debit Professional Payable and credit Payment Clearing. A dispute-driven transfer reversal posts the compensating debit Payment Clearing and credit Professional Payable. No dispute evidence submitted by a customer is copied into logs; only bounded status and evidence summary fields are persisted.

## Observability and verification

Required evidence is:

- unit decision tables for payout approval/execution, provider validation, disputes, and reconciliation;
- replay and concurrent execution proving one provider transfer and one ledger post;
- balanced debit/credit assertions;
- migration status, baseline audit, Prisma validation/generation, RBAC synchronization, and secret scan;
- reconciliation records containing sanitized expected/actual evidence and mismatch categories.

## Rollout and rollback

All four flags default to disabled: payout request, payout execution, dispute recovery, and reconciliation. Enable request creation first in test, then reconciliation, then execution with Stripe test accounts. Dispute recovery is enabled only after transfer-reversal replay has been verified.

Rollback is application-first: disable execution and recovery, then request creation if needed. Do not remove financial tables, provider IDs, inbox events, audit records, reconciliation evidence, or posted ledger entries. In-flight provider operations must be reconciled even after a flag is disabled.

## Approval evidence

The repository owner authorized implementation and publication of the Stripe webhook, payment confirmation, balanced ledger, duplicate-event protection, and continuation/completion of F3 in the Codex task on 2026-08-31. Production activation and live money movement remain separately gated.
