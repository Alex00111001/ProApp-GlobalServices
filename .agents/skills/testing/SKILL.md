---
name: testing
description: Design, implement, and run HomeServices unit, integration, contract, frontend, invariant, migration, and security tests. Use for test strategy, regression coverage, acceptance gates, or verification failures.
---

# Testing

Select tests from risk and observable behavior, not from file count.

## Current harnesses

- Backend: Node test runner via `npm test`; PostgreSQL integration tests via `npm run test:integration`.
- Customer mobile: Jest/Expo test script; inspect configuration before assuming non-interactive CI behavior.
- Professional mobile: TypeScript `typecheck` is currently the explicit verification script.
- Admin web: TypeScript/Vite build and oxlint.

## Test layers

- Unit: policy tables, money, transitions, permissions, redaction, taxonomy.
- Integration: Prisma transactions, idempotency races, webhook replay, outbox, audit, ledger, migration compatibility.
- Contract: accepted legacy mobile payloads/responses and versioned admin APIs.
- Frontend: critical journeys, permissions, validation, loading/error/empty states, accessibility.
- Invariant/property: balanced ledger, no duplicate financial action, legal transitions, bounded refunds/payouts.
- Security: ownership, privilege escalation, malformed inputs/metadata, upload boundaries, rate limits, secret/PII redaction.

## Execution safety

Use lockfile installs and an isolated test database. Identify `DATABASE_URL` before any migration/reset command. Never point destructive tests at shared, staging, or production data.

When a test fails, distinguish implementation defect, stale test, environment issue, and architectural conflict. Do not weaken assertions merely to pass. Report exact commands, scope, pass/fail/skip counts, prerequisites, and unverified areas.
