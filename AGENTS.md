# HomeServices — Agent Instructions

These instructions apply to all AI coding agents working in this repository, including Codex.

## Required reading before substantial work

Before planning or implementing any non-trivial task, read:

1. `docs/IMPLEMENTATION_PLAN.md`
2. `docs/CODEX_MODEL_ROUTING.md`

The first document defines the target architecture, implementation phases, dependencies and acceptance gates.
The second document defines which Codex model tier should handle each task and when escalation is required.

## Architectural rule

Do not deliberately simplify the architecture to produce a quick MVP. The final target architecture is defined first; implementation is sequenced by dependency, risk and verifiability.

Do not skip earlier acceptance gates merely to implement an interesting later-phase feature.

## Model-routing rule

For every non-trivial task, classify it before implementation:

```text
Task classification
- Phase: F1–F10
- Domain: <bounded context>
- Risk: LOW | MEDIUM | HIGH | CRITICAL
- Initial model: Luna | Terra | Sol
- Escalation triggers: <specific triggers>
- Required verification: <tests/checks>
```

Follow `docs/CODEX_MODEL_ROUTING.md` for model selection.

Use the least expensive model that can safely complete the task, but escalate instead of repeatedly retrying the wrong tier.

### Mandatory Sol review/design areas

- Architecture-critical decisions
- Authentication / authorization / RBAC
- Security-sensitive changes
- Production migration strategy
- Pricing, fees and commissions
- Ledger, refunds, payouts and disputes
- Stripe idempotency and webhook architecture
- Reconciliation and financial invariants
- Privacy/consent architecture
- AI guardrails and production approval controls
- Final production-readiness review

Terra should be the normal implementation model. Luna should be used for low-risk repetitive/documentation work when appropriate.

## Verification rule

A capability is not complete merely because code was generated. Respect the global Definition of Done in `docs/IMPLEMENTATION_PLAN.md`.

Relevant work must include the required combination of:

- schema migration
- domain logic
- API authorization/validation
- audit/telemetry
- automated tests
- documentation
- operational runbook
- feature flag / rollback strategy

Financial work additionally requires idempotency, transaction boundaries, reconciliation and immutable correction entries.

## Production safety

AI agents must not autonomously deploy to production or execute high-impact financial/advertising actions. High-impact operations must remain behind explicit authorization/approval controls.

## PR metadata

For meaningful changes, include when practical:

```text
Phase:
Risk:
Model tier used:
Escalated: yes/no
Reason for escalation:
Tests executed:
Relevant acceptance gate:
```
