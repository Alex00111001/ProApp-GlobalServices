---
name: backend-fastapi
description: Implement or review HomeServices backend APIs and service boundaries. Use for backend endpoints, services, validation, provider adapters, or an explicitly approved FastAPI service; preserve the current Express 5/CommonJS backend unless an ADR authorizes migration.
---

# Backend and FastAPI Boundary

The requested skill name is retained for compatibility. The repository currently uses Express 5, CommonJS, Prisma 7, and PostgreSQL. Do not introduce FastAPI or rewrite the backend merely because this skill is active.

## Required context

Read `docs/IMPLEMENTATION_PLAN.md`, `backend/API_DOCUMENTATION.md`, the relevant contract, and any applicable domain skill. For a proposed Python/FastAPI service, first read the approving ADR.

## Existing Express work

- Keep `backend/src/app.js` composable and separate process lifecycle from HTTP composition.
- Keep controllers/routes thin; place policy, transaction, idempotency, and provider orchestration in services.
- Validate at the edge with Zod and return stable error codes plus correlation IDs.
- Authenticate before authorization; enforce ownership as well as role/permission checks.
- Preserve accepted legacy request aliases and response fields during compatibility phases.
- Pass request context into logs, audits, outbox events, and provider operations.
- Do not make unrelated framework or module-system conversions.

## Approved FastAPI work

Only after an ADR defines the service boundary:

- Define Pydantic request/response models and publish a versioned OpenAPI contract.
- Reuse canonical identity, authorization, idempotency, money, event, and error semantics.
- Keep database ownership explicit; avoid two services writing the same aggregate.
- Use dependency injection for authentication, database sessions, and provider adapters.
- Add contract and integration tests proving compatibility with existing consumers.

## Completion evidence

Report changed routes/services, authorization rules, validation, persistence/transaction behavior, telemetry/audit coverage, compatibility evidence, tests, and rollback or feature-flag strategy.
