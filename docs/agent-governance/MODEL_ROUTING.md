# Cross-provider model routing

## Principle

Choose capability from task risk and uncertainty, then map that capability to an available provider model. Model choice affects cost and confidence, never authority or acceptance criteria.

## Capability tiers

| Tier | Use | Examples |
|---|---|---|
| FAST | Low-risk, mechanical, cheaply verified | inventory, formatting, documentation synchronization, repetitive fixtures |
| STANDARD | Normal implementation with clear contracts | ordinary backend/frontend features, approved Prisma additions, integration tests, observability implementation |
| DEEP | Cross-cutting, ambiguous, security/financial/privacy/migration critical | architecture, auth/RBAC, ledger/refunds/payouts, risky migrations, legal-control design, production-readiness review |

Use STANDARD by default. Use DEEP immediately for CRITICAL risk or when a wrong design can cause unauthorized access, financial loss, unrecoverable data change, regulatory exposure, or cross-context incompatibility.

Country/market architecture, identity documents, legal or tax interpretation, cross-market authorization, official geography ingestion, and changes that couple market currency to financial policy require DEEP design and final review. Isolated implementation slices may use STANDARD only after the accepted Market/Identity/Geography ADR and versioned contracts remove the ambiguity.

## Provider map

| Capability | Codex | Claude Code |
|---|---|---|
| FAST | Luna | Workspace-approved fast alias; do not assume availability/cost |
| STANDARD | Terra | `sonnet` alias, subject to workspace availability |
| DEEP | Sol | `opus` alias, subject to workspace availability |

The installed Claude Code 2.1.251 CLI advertises `fable`, `sonnet`, and `opus` aliases, but the repository does not assert subscription availability, price, or quality for `fable`; approve it before mapping FAST. Use explicit full model identifiers in automation when reproducibility matters and record the resolved version.

`docs/CODEX_MODEL_ROUTING.md` remains the detailed Codex phase matrix. If it conflicts with this document, use the stricter risk tier and update both in the same change.

## Task-specific selection layer

Before substantive work, split a delivery into independently verifiable sub-tasks and record a routing
decision for each one. The objective is to use the least costly eligible model, not the least capable one.
Unknown provider pricing must never be guessed; the tier map and observed verification effort are the
cost-control inputs.

| Sub-task shape | Required model | Credit-efficient use |
|---|---|---|
| Read-only inventory, deterministic documentation, formatting, repetitive fixture or mechanical rename | Luna / `gpt-5.6-luna` | Use only after the contract and acceptance check are explicit. |
| Isolated implementation, bounded validation, ordinary test or compatible API work with approved design | Terra / `gpt-5.6-terra` | Keep the scope to one bounded context and reuse the established tests/contracts. |
| Security, payments, privacy, authorization, public compatibility, migration, production-readiness design or final review | Sol / `gpt-5.6-sol` | Use Sol for the design/final review; hand a fully specified, non-sensitive mechanical slice down only when its gate remains unchanged. |
| A Sol review cannot resolve an exceptional cross-cutting ambiguity after its escalation criteria are met | Astra / `gpt-6-astra` | Exceptional escalation only; record why Sol was insufficient and what evidence is required. |

For every meaningful sub-task, record:

```text
Model routing decision
- Task and bounded context:
- Risk and mandatory tier:
- Selected model and reasoning effort:
- Why a lower-cost model is insufficient or safe:
- Escalation trigger and failure budget:
- Required evidence:
- Resolved execution model: <actual model, or NOT SELECTABLE BY THIS RUNNER>
```

The task owner must distinguish the **selected/required** model from the **resolved execution** model.
If the runner cannot choose a model for the current turn, it records the required model and does not claim
that it switched models. A higher-tier design/review can still define a later lower-tier implementation
slice, but the higher-tier acceptance gate remains mandatory.

Do not mix unrelated sub-tasks merely to save a model invocation. It hides risk, increases rework, and
usually consumes more credits than an explicit handoff. Reuse the prior task's audited context and tests
instead of repeating broad repository discovery.

## Escalation

Escalate one tier or to DEEP when:

- Verification fails twice for a non-mechanical reason.
- Requirements or contracts conflict.
- Scope expands across three or more bounded contexts.
- Public API, database semantics, money, permissions, privacy, or production configuration changes.
- Concurrency, replay, duplicate events, idempotency, transaction boundaries, or irreversible migration risk appears.
- The selected model cannot establish backward compatibility or safe recovery.

Do not repeatedly retry a model that is below the task's risk tier. A DEEP design/review may hand a fully specified, isolated implementation slice to STANDARD; final critical review remains DEEP.

## Required record

Record phase, domain, risk, capability tier, provider/model, skills, escalation, tests/evidence, acceptance gate, and rollback/flag. If the runner cannot select a model, record the required tier and let the operator choose an eligible model.
