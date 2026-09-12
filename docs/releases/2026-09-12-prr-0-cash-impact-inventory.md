# PRR-0 cash payment impact inventory — release evidence

- Date: 2026-09-12
- Phase: PRR-0
- Domain: Payments, Booking, Database, Security, Operations
- Risk: CRITICAL
- Capability tier / model: DEEP / operator-selected Codex
- Skills used: payments, booking-engine, security, database-prisma, testing, release
- Escalated: yes; the user explicitly authorized the aggregate-only live read
- Implementation commit: pending publication and exact-SHA CI verification
- Migration: not applicable; the audit performs no schema or data mutation
- Rollback: not applicable to data; remove/disable the audit runner without changing evidence or records

## Audit controls

The repeatable runner validates `DIRECT_URL` against `EXPECTED_SUPABASE_PROJECT_REF` before connecting and
requires the one-run opt-in `ALLOW_CASH_IMPACT_AUDIT=true`. It executes inside `BEGIN ISOLATION LEVEL
REPEATABLE READ READ ONLY`, sets a 30-second statement timeout, emits aggregate counts only and always
rolls back. No payment, booking or user identifiers and no personal data appear in the result.

Automated regression checks reject mutation statements in the inventory query, require aggregate grouping,
require read-only transaction/rollback controls and verify that the summarized output contains no resource
or person identifiers.

## Executed inventory result

Command: `npm run db:audit-cash-impact` with the explicit one-run opt-in.

- Status: `READ_ONLY_INVENTORY_COMPLETE`
- Connection type: configured Supabase pooler
- Database transaction read-only: `true`
- Total cash payments: `0`
- Cash rows retaining provider evidence: `0`
- Cash rows with booking amount/currency mismatch: `0`
- Cash rows linked to ledger transactions: `0`
- Cash rows linked to refunds: `0`
- Cash rows linked to payouts: `0`
- Cash rows linked to disputes: `0`
- Pending cash payments on confirmed bookings: `0`
- Cash payments on completed, cancelled or no-show bookings: `0`
- Aggregate groups returned: none

The result establishes that the configured target contained no `Payment.method=CASH` row at audit time. It
does not prove historical causation or replace future continuous reconciliation. No automated repair is
necessary or authorized from this result.

## Acceptance gate

PRR-003 is satisfied when the runner, regression tests and this bounded evidence are committed, pushed and
the required GitHub CI run succeeds for that exact SHA. PRR-0 may close only after the cash quarantine and
this inventory have both retained their exact-SHA CI evidence in the repository and Notion tracker.
