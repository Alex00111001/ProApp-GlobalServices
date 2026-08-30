# HomeServices — Codex Model Routing Policy

## 1. Purpose

This document defines how Codex models should be selected for HomeServices development to balance correctness, risk, development speed, and credit consumption.

The routing policy is part of the project operating model. It does **not** replace engineering judgment, tests, code review, or the acceptance gates in `docs/IMPLEMENTATION_PLAN.md`.

Primary objective:

> Use the least expensive model that can safely and reliably complete the task, and automatically escalate when task risk, uncertainty, failed verification, or repeated attempts justify it.

The target architecture remains fixed up front. Model selection must never be used as a reason to simplify the architecture, bypass acceptance gates, or implement a disposable MVP.

---

## 2. Available routing tiers

The project treats Codex models as three operational tiers:

### Tier L — Luna

Use for low-risk, repetitive, easily verifiable work.

Typical tasks:

- Documentation updates.
- Mechanical refactors.
- Formatting and lint fixes.
- Simple test generation after behavior is already specified.
- Search, inventory and repository analysis.
- Renames and repetitive edits.
- Updating static configuration where the intended value is already decided.
- Changelog, runbook and project-control updates.

Luna must not be the final authority for security-sensitive, financial, schema-critical, migration-critical, or architecture-critical decisions.

### Tier T — Terra

Use as the default implementation model for normal engineering work.

Typical tasks:

- Backend CRUD and application services.
- React/React Native implementation.
- Admin Web implementation.
- API endpoints and validation.
- Integration tests.
- Routine Prisma changes after the schema design is already approved.
- Refactoring controllers into services/repositories.
- Observability implementation.
- Growth, attribution and automation implementation when rules are already specified.

Terra should escalate to Sol when risk triggers are met.

### Tier S — Sol

Use for high-risk, high-complexity, cross-cutting or expensive-to-get-wrong work.

Mandatory or strongly preferred for:

- Architecture decisions.
- Authentication/authorization architecture and privilege boundaries.
- RBAC design.
- Security review.
- Production deployment review.
- Prisma baseline strategy and destructive/complex migrations.
- Financial architecture.
- Pricing, platform fees and professional commissions.
- Ledger design and invariant review.
- Refund policy engine.
- Payouts and disputes.
- Payment/webhook idempotency.
- Reconciliation.
- Concurrency/race-condition analysis.
- Privacy/consent model design.
- AI guardrails and approval controls.
- Final review of production-critical changes.

---

## 3. Default routing matrix

| Task type | Initial model | Escalation |
|---|---|---|
| Documentation / repository inventory | Luna | Terra |
| Mechanical refactor / lint / formatting | Luna | Terra |
| Simple unit tests | Luna | Terra |
| Normal backend feature | Terra | Sol |
| Normal mobile feature | Terra | Sol |
| Admin Web feature | Terra | Sol |
| Integration tests | Terra | Sol if failures expose design issues |
| Observability implementation | Terra | Sol for architecture/security decisions |
| Growth / analytics implementation | Terra | Sol for data-contract or privacy risk |
| Prisma additive migration | Terra | Sol if production data, constraints or compatibility are involved |
| Prisma baseline / risky migration | Sol | — |
| Authentication / authorization | Sol | — |
| Security-sensitive code | Sol | — |
| Pricing / fees / commissions | Sol | — |
| Ledger / refunds / payouts / disputes | Sol | — |
| Stripe idempotency / webhook architecture | Sol | — |
| Production-readiness review | Sol | — |
| AI Operations / approval guardrails | Sol | — |

---

## 4. Automatic escalation rules

A task must escalate one tier when any of the following occurs:

1. **Verification failure**
   - The implementation fails tests twice for reasons not clearly mechanical.
   - Contract tests reveal conflicting expected behavior.
   - CI exposes architectural or dependency problems rather than a simple syntax/lint issue.

2. **Scope expansion**
   - The task unexpectedly touches three or more bounded contexts.
   - The task changes public API contracts used by existing mobile clients.
   - The task changes database semantics, money calculations, permissions, or production configuration.

3. **Risk trigger**
   - Payment, refund, payout, fee, commission or ledger behavior is affected.
   - Authentication, authorization, RBAC, secrets, PII, consent, or audit behavior is affected.
   - Production migrations or irreversible data changes are involved.
   - A race condition, retry, duplicate-event, webhook replay, idempotency or transaction-boundary issue is detected.

4. **Uncertainty trigger**
   - Requirements conflict with `docs/IMPLEMENTATION_PLAN.md`.
   - The current implementation contradicts documented financial/security invariants.
   - The model cannot confidently determine backward compatibility.

5. **Repeated attempt trigger**
   - Luna: escalate after one failed substantive implementation attempt.
   - Terra: escalate after two failed substantive implementation attempts or immediately on a critical-risk trigger.

Escalation is preferred over repeatedly consuming credits with the wrong model.

---

## 5. De-escalation rules

A high-tier model may design or review a task and delegate implementation slices downward when all of these are true:

- The intended behavior is explicit.
- Acceptance tests are defined.
- The task is isolated.
- No new architectural decision is required.
- No sensitive financial/security invariant is being invented or changed.

Example:

1. Sol designs ledger posting invariants and transaction boundaries.
2. Terra implements the approved service/repository/API design.
3. Luna adds repetitive fixtures, documentation and non-critical test cases.
4. Terra runs integration verification.
5. Sol performs final financial invariant review before merge/production.

This is the preferred pattern for expensive areas.

---

## 6. Mandatory pre-task classification

Before implementation, Codex should classify the task using this compact header:

```text
Task classification
- Phase: F1–F10
- Domain: <bounded context>
- Risk: LOW | MEDIUM | HIGH | CRITICAL
- Initial model: Luna | Terra | Sol
- Escalation triggers: <specific triggers>
- Required verification: <tests/checks>
```

Do not spend significant implementation effort before this classification for non-trivial tasks.

---

## 7. Credit-efficiency rules

1. Do not use Sol for repository inventory, documentation, formatting, simple test scaffolding or repetitive edits unless the task contains hidden critical risk.
2. Do not keep retrying a failing low-tier model when escalation is cheaper than repeated failure.
3. Reuse existing repository context instead of repeatedly rediscovering the same architecture.
4. Prefer focused tasks with explicit acceptance criteria over broad prompts that force repeated repository scans.
5. Keep architecture decisions in durable project documentation so cheaper models can implement against an approved design.
6. For high-risk work, use Sol for design/review and Terra for implementation where practical.
7. Record significant routing decisions in PR descriptions when a higher-tier model was required.

---

## 8. Phase-specific routing guidance

### F1 — Foundation

- Sol: architecture, RBAC design, migration baseline strategy, security/config policy.
- Terra: app/server separation, middleware, validation, feature-flag implementation, test harness.
- Luna: docs, mechanical cleanup, test fixtures.

### F2 — Observability

- Sol: telemetry/privacy/redaction architecture when sensitive data is involved.
- Terra: structured logging, health registry, error persistence, tracing implementation.
- Luna: dashboards/docs/runbooks and repetitive tests.

### F3 — Financial Foundation

- Sol is mandatory for the financial model, pricing semantics, fee/commission separation, immutable ledger, refund decisions, idempotency, webhook replay, payouts, disputes and reconciliation.
- Terra may implement approved designs.
- Luna may only handle non-critical documentation, fixtures and repetitive tests.

### F4 — Admin Foundation

- Sol: admin session architecture, RBAC boundaries and high-impact mutation approval policy.
- Terra: Admin Web and APIs.
- Luna: docs, fixtures and low-risk UI cleanup.

### F5 — Operations Control

- Terra default.
- Sol when incident actions can mutate production state or expose sensitive information.

### F6 — Growth Data

- Terra default.
- Sol for canonical event/data contracts that affect attribution or financial reporting.

### F7 — Consent & Attribution

- Sol for consent/privacy model decisions.
- Terra for approved implementation.

### F8 — Referrals & Automation

- Terra default.
- Sol when automation can trigger financial or irreversible actions.

### F9 — Experiments / Content / SEO

- Terra default.
- Luna for content/mechanical tasks.
- Sol if experiments can alter pricing, permissions or high-impact policy.

### F10 — Supply/Demand + AI Operations

- Sol for AI guardrails, approval architecture, recommendation boundaries and production controls.
- Terra for approved analytics/AI integration implementation.
- Luna for documentation and repetitive support work.

---

## 9. Production guardrails

Model routing never overrides these rules:

- AI must not autonomously deploy production changes.
- AI must not autonomously execute high-impact financial actions.
- AI must not bypass four-eyes approval where configured.
- Financial changes require invariant tests and reconciliation evidence.
- Security-sensitive changes require explicit verification.
- Migration changes require forward/rollback analysis and compatibility review.
- Existing mobile contracts remain backward compatible unless a versioned replacement is intentionally introduced.

---

## 10. Relationship to project control

The source of truth for architecture and acceptance gates remains:

- `docs/IMPLEMENTATION_PLAN.md`

This file is the source of truth for model selection and escalation:

- `docs/CODEX_MODEL_ROUTING.md`

Codex should read both before planning or executing substantial repository work.

For each meaningful PR, include when practical:

```text
Phase:
Risk:
Model tier used:
Escalated: yes/no
Reason for escalation:
Tests executed:
Relevant acceptance gate:
```

The goal is measurable engineering quality **and** measurable credit efficiency.