---
name: admin-operations
description: Build or audit the HomeServices admin control center, operational APIs, RBAC, review queues, incidents, refunds, configuration, and high-impact approval workflows.
---

# Admin Operations

Read `docs/ADMIN_WEB.md`, the Admin and Operations sections of `docs/IMPLEMENTATION_PLAN.md`, and the identity permission catalog before changing admin behavior.

## Rules

- Treat backend permission checks as authoritative; navigation visibility is only a usability aid.
- Use narrow permissions and explicit ownership/scope checks; do not infer authorization from `User.role` alone where RBAC is authoritative.
- Audit sensitive reads and all mutations with actor, permission, target, reason, before/after, request context, and outcome.
- Require four-eyes approval for policy-defined high-impact refunds, payouts, role changes, global pricing/commission, and production controls.
- Separate proposal, approval, execution, and reconciliation identities when policy requires it.
- Paginate/filter admin lists server-side and prevent PII leakage in exports, errors, or logs.
- Display metric definition, time range, timezone, currency, freshness, and partial-data state.
- Keep `admin-web` independent and API-only; do not introduce direct database access.

The target plan proposed Next.js, while the current implementation is React/Vite. Do not migrate frameworks incidentally; require an explicit architectural decision and migration plan.

Verify the permission matrix (including 401/403), approval separation, audit evidence, replay/idempotency, accessible UI states, failure recovery, and feature-flag/rollback behavior.
