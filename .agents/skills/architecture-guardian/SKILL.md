---
name: architecture-guardian
description: Guard HomeServices architectural decisions, cross-context designs, dependencies, API compatibility, and implementation sequencing against the approved target architecture. Use for non-trivial design, refactors, new services, or changes spanning multiple modules.
---

# Architecture Guardian

Preserve the target architecture; do not trade it for a disposable MVP.

## Required context

Read, in order:

1. `docs/IMPLEMENTATION_PLAN.md`
2. `docs/agent-governance/GOVERNANCE.md`
3. `docs/agent-governance/MODEL_ROUTING.md`
4. Relevant ADRs, specifications, contracts, and domain skills

Inspect the current code before assuming the implementation-plan baseline is still current. Treat documented target decisions as authoritative and observed code as implementation evidence.

## Workflow

1. Classify the phase, bounded context, risk, model tier, escalation triggers, and verification.
2. Identify the highest-authority artifact governing the change.
3. Map affected contexts, public contracts, data, providers, security boundaries, telemetry, and rollback path.
4. Prefer an incremental slice that advances the final architecture and preserves compatibility.
5. Require an ADR when the proposal changes a target boundary, system of record, provider strategy, public contract policy, financial invariant, or security model.
6. Define acceptance evidence before implementation.

## Invariants

- PostgreSQL remains the system of record; frontends never access it directly.
- Routes are transport adapters; application services own use cases, policies, and transaction boundaries.
- Provider integrations remain behind adapters.
- Existing mobile contracts remain compatible unless a versioned replacement is approved.
- High-impact behavior is feature-flagged, observable, auditable, and reversible.
- Financial history is immutable; corrections use compensating entries.
- Production deployment and high-impact financial actions require explicit human authorization.

If requirements conflict, stop the conflicting implementation and report the exact artifacts and decision needed.
