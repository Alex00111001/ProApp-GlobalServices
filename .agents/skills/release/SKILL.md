---
name: release
description: Plan, verify, and document HomeServices CI/CD, staging, migrations, feature-flag rollout, production readiness, rollback, and release evidence. Use for releases or deployment preparation; never deploy production without explicit authorization.
---

# Release

Treat a release as a reviewed change set with reproducible evidence, not merely a successful build.

## Preflight

- Identify commit/branch, environment, owner, affected contexts, risk, dependencies, schema changes, contracts, flags, secrets/config, observability, and rollback authority.
- Confirm clean separation from unrelated local changes.
- Install from lockfiles and run Prisma format/validate/generate, syntax/type checks, unit/integration/contract/security tests, migration drift review, and secret scan as applicable.
- Review migration forward compatibility, backfill, constraint timing, rollback/roll-forward, backup, and reconciliation.
- Confirm dashboards, alerts, runbooks, support communication, and ownership.

## Rollout

Use staged environments, additive migrations, backward-compatible code, shadow/dual-write comparison where required, feature flags by environment/market/cohort, canary exposure, explicit go/no-go gates, and monitored expansion.

Define abort thresholds for error rate, latency, payment reconciliation, duplicate events, booking conversion, permission denials, and data drift. Prefer roll-forward when rollback would corrupt or discard data.

AI agents may prepare commands and evidence but must not deploy to production, rotate production secrets, or execute high-impact financial/advertising actions without explicit authorization at the moment of action.

Produce a release record containing versions, approvals, commands/results, migrations, flags, monitoring window, anomalies, rollback decision, and post-release reconciliation.
