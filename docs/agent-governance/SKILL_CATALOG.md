# HomeServices Skill Pack catalog

Canonical location: `.agents/skills/`. Codex invokes explicitly with `$skill-name`; Claude Code uses `/skill-name` through `.claude/skills/` adapters. Skills can also activate implicitly when their descriptions match.

| Skill | Primary scope | Default minimum tier |
|---|---|---|
| `architecture-guardian` | Architecture, boundaries, ADR need, cross-context design | DEEP |
| `backend-fastapi` | Express backend work; approved FastAPI boundary only | STANDARD |
| `database-prisma` | PostgreSQL/Prisma schema, migration, transactions | STANDARD; DEEP for risky migration |
| `frontend` | Customer/professional mobile and admin web | STANDARD |
| `payments` | Pricing, fees, commission, Stripe, ledger, refunds/payouts | DEEP |
| `booking-engine` | Booking state, availability, ownership, cancellations | STANDARD; DEEP when financial/concurrent |
| `professional-system` | Professional onboarding, approval, availability, earnings | STANDARD |
| `admin-operations` | RBAC admin control center and high-impact workflows | STANDARD; DEEP for privilege/financial controls |
| `observability` | Logs, context, errors, health, incidents, traces | STANDARD |
| `testing` | Unit/integration/contract/invariant/security verification | FAST or STANDARD; DEEP for critical test design |
| `security` | Threat model, auth/RBAC, secrets, uploads, privacy boundaries | DEEP |
| `legal-compliance` | Versioned legal/privacy requirements and evidence | DEEP plus qualified human review |
| `release` | CI/CD, migrations, staged rollout, rollback/readiness | STANDARD; DEEP final production review |
| `repo-auditor` | Read-only architecture-to-code audit and drift | STANDARD; DEEP for critical readiness |

Combine skills when a task crosses domains, but keep one primary owner. Examples: booking cancellation with refund uses `booking-engine` plus `payments`; an admin refund UI uses `admin-operations`, `payments`, `frontend`, `security`, and `testing`.

The name `backend-fastapi` is retained from the requested pack. Its canonical instructions explicitly preserve Express 5/CommonJS and require an ADR before any FastAPI service or migration.
