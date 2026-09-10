# ADR 0007: Production Control Plane and Go-Live Orchestrator

- Status: Proposed for F11 implementation
- Date: 2026-09-11
- Decision owners: Product, Security, Privacy/Legal, Platform/SRE and Release Management
- Supersedes: none
- Depends on: F1-F10, especially F2 observability, F4 administrative identity/RBAC/audit, F5 durable operations, F8 automation, F8.5 Market policy and F10 governed recommendations

## Context

HomeServices has production-oriented domain controls, but production and Markets remain inactive. Runtime switches currently live in environment configuration or individual feature-flag records, while GitHub Actions verifies source quality and migrations. There is no authoritative, durable workflow that binds a release revision, configuration digest, approvals, preflight evidence, deployment execution, verification and rollback into one auditable operation.

A browser button that directly changes `NODE_ENV`, edits many flags, calls a hosting API or activates Markets would create an unsafe second authority. It would also make partial activation, double execution, stale approval, privilege escalation and rollback ambiguity likely.

## Decision

F11 will introduce a bounded **Production Control Plane**. Its primary Admin Web action is intentionally simple, but the button initiates a governed change request; it never performs an immediate global toggle.

PostgreSQL stores immutable intent, approvals and evidence. The approved deployment/GitOps provider remains authoritative for observed runtime deployment state. `MarketPolicyVersion` remains the authority for Market activation, F3 remains the financial authority, F9 remains the content-publication authority and the F10 AI provider gate remains independent.

The control plane will reconcile an approved desired state through a closed adapter registry. It will not expose arbitrary shell, SQL, HTTP, filesystem, GitHub, Notion or infrastructure actions.

## State model

The request lifecycle is:

`DRAFT -> PREFLIGHT -> PENDING_APPROVAL -> APPROVED -> SCHEDULED -> APPLYING -> VERIFYING -> ACTIVE`

Explicit side or terminal states are `PREFLIGHT_FAILED`, `REJECTED`, `EXPIRED`, `CANCELLED`, `FAILED`, `ROLLING_BACK`, `ROLLED_BACK` and `EMERGENCY_STOPPED`.

Transitions are server-side, row-locked, idempotent and audit-backed. Approval binds the exact request digest. Any change to release SHA, image digest, configuration, migration set, targets, flags, provider policies, rollout plan or rollback plan invalidates prior approval and creates a new revision.

## Separation of responsibilities

- The proposer defines a bounded desired-state revision and reason.
- Independent approvers review the immutable digest and preflight evidence.
- A durable executor invokes only approved adapter operations.
- A reconciler compares desired and observed state and records drift.
- A verifier evaluates health, smoke, SLO and business guardrails.
- An emergency operator may stop traffic or workers through a distinct, narrow permission and mandatory incident reason.

Production promotion requires step-up authentication and four-eyes approval. The proposer cannot approve or execute their own request. Security-sensitive or Market/provider-affecting changes may require policy-configured additional approvers. Approval expires and is single-use.

## Environment and scope model

`TEST`, `STAGING` and `PRODUCTION` are distinct targets with separate credentials, provider projects, databases, domains and telemetry. A request declares exact components and targets; it cannot mean “everything currently configured.” Production rollback is a new governed request linked to the original, except for the bounded emergency-stop path.

Market activation, AI provider activation, financial execution, content publication and generic application deployment are separate change types with separate policy gates. A global release may compose them only as explicitly ordered steps whose authorities remain intact.

## Preflight contract

Preflight is a versioned closed registry. Required checks include immutable artifact provenance, CI success for the exact revision, dependency and secret scans, clean migration compatibility, backup/restore evidence, environment configuration validation, RBAC sync, readiness/health, open incidents, observability/alert routing, rollback availability, legal/privacy evidence, Market policy evidence, provider go-live evidence and financial safeguards where applicable.

Checks return `PASS`, `FAIL`, `WARN` or `NOT_APPLICABLE`, with an evidence reference, observed timestamp, expiry and safe reason. Missing or stale mandatory evidence fails closed. Warnings require an explicitly permitted, reasoned exception and never waive non-overridable controls.

## Rollout and rollback

The default production strategy is progressive: deploy inactive, verify infrastructure, enable a canary, observe bounded gates, then increase traffic or capability by approved stages. Automatic abort thresholds are deterministic and versioned. A failed stage stops advancement and may start the approved rollback plan; it never silently falls forward.

Planned deactivation uses the same request/approval machinery as activation. Emergency stop is intentionally faster but cannot delete evidence, rewrite history, drop migrations, move money or activate a different revision. Reactivation after emergency stop requires a fresh request and incident review.

## Security and privacy

- Admin Web never receives provider credentials or direct database/deployment access.
- Production credentials live only in an approved secret manager and are used by a least-privilege executor identity.
- Session validity, narrow RBAC, CSRF protection and step-up MFA/WebAuthn are checked at the decision moment.
- Request, approval and artifact digests use canonical serialization and collision-resistant hashing.
- Logs, traces, evidence and adapters use allowlists and centralized redaction.
- Callback/webhook evidence is authenticated, replay-protected and correlated.
- Production actions are rate-limited, concurrency-limited and protected by environment-scoped advisory/row locks.

## Consequences

The operator receives a clear production action and a comprehensible progress surface, but production cannot be changed with an unaudited single HTTP request. Initial implementation requires selecting a deployment provider, secret manager, step-up authentication mechanism and environment topology. Until those decisions and go-live evidence exist, F11 may be implemented and verified in test/staging while production remains inactive.

## Rejected alternatives

- **Direct global feature flag:** cannot deploy artifacts, validate migrations or represent partial failure safely.
- **Browser-to-hosting API:** exposes excessive authority and weakens audit/idempotency boundaries.
- **One generic automation action:** violates F8's closed action registry and permits arbitrary infrastructure mutation.
- **GitHub Actions workflow dispatch as the system of record:** useful as an adapter, but insufficient for domain approvals, evidence expiry, reconciliation and environment state.
- **AI-directed release:** F10 recommendations are untrusted and cannot approve or execute production changes.

## Implementation reference

The complete dependency plan, contracts, slices, security cases and acceptance gates are defined in [Production Control Plane plan](../PRODUCTION_CONTROL_PLANE.md). Actual go-live remains a separate explicit human authorization.
