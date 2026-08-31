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

## Provider map

| Capability | Codex | Claude Code |
|---|---|---|
| FAST | Luna | Workspace-approved fast alias; do not assume availability/cost |
| STANDARD | Terra | `sonnet` alias, subject to workspace availability |
| DEEP | Sol | `opus` alias, subject to workspace availability |

The installed Claude Code 2.1.251 CLI advertises `fable`, `sonnet`, and `opus` aliases, but the repository does not assert subscription availability, price, or quality for `fable`; approve it before mapping FAST. Use explicit full model identifiers in automation when reproducibility matters and record the resolved version.

`docs/CODEX_MODEL_ROUTING.md` remains the detailed Codex phase matrix. If it conflicts with this document, use the stricter risk tier and update both in the same change.

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
