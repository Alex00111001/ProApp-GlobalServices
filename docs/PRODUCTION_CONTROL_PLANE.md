# F11 — Production Control Plane and Go-Live Orchestrator

## 1. Planning status

- Phase: F11 (proposed next phase)
- Status: `PENDIENTE — PLAN APROBABLE, IMPLEMENTACION NO INICIADA`
- Baseline: F10 branch `feature/supply-demand-ai-operations-phase-10`, SHA `afd1c19db94053795c75e64138090745739725d8`
- Delivery branch: `feature/production-control-plane-phase-11`
- Risk: CRITICAL
- Capability tier: DEEP
- Production activated: NO
- Markets activated: NO

This document turns the requested “one-click production button” into a safe product capability. The single visible action starts a governed workflow. It does not immediately alter an environment, Market, financial setting, content publication or AI provider.

## 2. Task classification and routing

| Field | Decision |
| --- | --- |
| Primary domain | Release / Operations / Security / Admin Control Plane |
| Primary skill | architecture-guardian |
| Supporting skills | admin-operations, security, release, testing, legal-compliance, observability, repo-auditor |
| Preferred model tier | DEEP; operator-selected eligible model under repository routing policy |
| Human escalation | production configuration/deployment, credentials, MFA/RBAC, destructive migration, Market activation, payments, external provider activation |
| Verification | ADR, contracts, unit/integration/security/concurrency, clean migrations, RBAC sync, staging/canary/rollback rehearsal, scans, audits and remote CI |

## 3. Objective

Provide one administrative control plane for requesting, approving, applying, verifying, stopping and rolling back bounded environment changes while preserving every existing domain authority.

The result must make the safe path easy for an authorized operator:

1. Select a known release and an explicit target.
2. Review a generated manifest of exactly what would change.
3. Run preflight checks.
4. Submit the immutable request for independent approval.
5. Apply it progressively through a durable executor.
6. Observe verification and automatic stop/rollback gates.
7. Retain a complete audit and evidence record.

## 4. Non-goals

- No production or Market activation during F11 implementation.
- No generic shell, SQL, HTTP, cloud-console, GitHub, Notion or filesystem runner.
- No storage of provider credentials in PostgreSQL, the browser, logs or evidence payloads.
- No replacement of CI, Market policy, feature flags, F3 financial controls, F9 publication or F10 AI governance.
- No autonomous production decision by AI, readiness scores or automation.
- No destructive rollback or database downgrade.
- No claim that the overall product is live or production-ready merely because F11 passes.

## 5. Dependency map and preserved authorities

| Existing phase | F11 consumes | Authority that remains unchanged |
| --- | --- | --- |
| F1 | taxonomy, outbox, idempotency | canonical events and durable delivery |
| F2 | logs, metrics, traces, readiness, incidents, alerts | telemetry and incident lifecycle |
| F3 | financial flags and invariants | ledger, pricing, payouts and refunds |
| F4 | Admin sessions, RBAC, audit, four-eyes pattern | identity and authorization |
| F5 | durable jobs, leases, retries, dead-letter, Operations Control | execution visibility |
| F6/F7 | growth, consent, privacy | lawful collection and privacy boundary |
| F8 | closed automation registries | product automation, not infrastructure authority |
| F8.5 | Market and MarketPolicyVersion | Market activation and territorial policy |
| F9 | content publication and public rendering | editorial/SEO publication |
| F10 | readiness evidence and governed AI recommendations | recommendation only; no execution authority |

## 6. Core invariants

1. **Intent is not execution.** A click creates a request; it does not mutate production.
2. **Readiness is not activation.** F10 evidence can satisfy a check but cannot activate a Market.
3. **Approval is not execution.** Approval authorizes one exact digest and bounded time window.
4. **Observed state is not inferred.** It comes from signed/read-only provider adapters and health evidence.
5. **Every effect is idempotent.** A request revision and step key can produce at most one durable effect.
6. **No partial success is hidden.** Each step and component has an explicit observed state.
7. **Rollback preserves evidence.** It never resets the database or erases audit history.
8. **Missing evidence fails closed.** No “best effort” production promotion.
9. **Production credentials never cross into Admin Web or database values.** Only secret references are persisted.
10. **Human authorization is contemporaneous.** Past chat consent or a green CI run is not go-live approval.

## 7. Bounded contexts and conceptual data model

Names may be adapted to repository conventions during implementation, but responsibilities must remain separate.

### Release catalog

- `ReleaseArtifact`: immutable Git SHA/image digest, provenance, build and scan evidence.
- `EnvironmentTarget`: TEST/STAGING/PRODUCTION metadata and adapter references; never credentials.
- `DeploymentManifest`: versioned component/config/migration/flag target state with canonical digest.

### Change control

- `GoLiveRequest`: change type, target, reason, lifecycle, active revision and requester.
- `GoLiveRequestRevision`: immutable manifest, rollout plan, rollback plan, evidence digest and expiry.
- `GoLiveApprovalPolicy`: versioned required roles/counts, separation rules, step-up requirements and expiry.
- `GoLiveApproval`: approver, decision, exact revision digest, reason, authentication assurance and timestamp.
- `GoLiveException`: optional policy-bounded warning waiver; no override for secrets, authorization, destructive migrations or missing rollback.

### Verification and execution

- `PreflightDefinition` / `PreflightResult`: versioned closed checks and immutable evidence.
- `DeploymentExecution`: durable request attempt with lease, status and correlation context.
- `DeploymentStepExecution`: idempotent adapter step, attempts, safe failure and observed result.
- `EnvironmentObservation`: provider-reported revision/config/health and drift status.
- `RolloutStage`: canary percentages or capability stages with deterministic pass/abort thresholds.
- `RollbackExecution`: linked compensation workflow and evidence.

All tables use restrictive foreign keys, unique effect keys, lifecycle checks, query-driven indexes, forced RLS/default deny and minimum grants. Financial, audit and release evidence never cascades destructively.

## 8. Lifecycle

| State | Meaning | Allowed next states |
| --- | --- | --- |
| DRAFT | editable request, no authority | PREFLIGHT, CANCELLED |
| PREFLIGHT | checks executing against immutable revision | PENDING_APPROVAL, PREFLIGHT_FAILED, CANCELLED |
| PREFLIGHT_FAILED | required evidence failed/stale | DRAFT, CANCELLED |
| PENDING_APPROVAL | digest frozen and awaiting policy | APPROVED, REJECTED, EXPIRED, CANCELLED |
| APPROVED | approvals satisfied and still valid | SCHEDULED, APPLYING, EXPIRED, CANCELLED |
| SCHEDULED | approved execution window pending | APPLYING, EXPIRED, CANCELLED |
| APPLYING | durable adapter steps running | VERIFYING, FAILED, ROLLING_BACK, EMERGENCY_STOPPED |
| VERIFYING | smoke/SLO/business gates observing | ACTIVE, FAILED, ROLLING_BACK, EMERGENCY_STOPPED |
| ACTIVE | exact desired state reconciled and verified | ROLLING_BACK, EMERGENCY_STOPPED |
| ROLLING_BACK | approved compensation applying | ROLLED_BACK, FAILED, EMERGENCY_STOPPED |
| ROLLED_BACK | prior safe state verified | terminal; new request for reactivation |
| EMERGENCY_STOPPED | bounded kill action completed | terminal; incident review and new request required |

Row locks and optimistic revision numbers protect every transition. Concurrent requests for the same environment/scope are serialized. Stale clients receive a conflict rather than overwriting state.

## 9. Change types

The first closed registry should support only explicitly implemented types:

- `APPLICATION_RELEASE`: deploy an immutable backend/web/mobile-service artifact set.
- `CAPABILITY_ACTIVATION`: change a bounded allowlisted feature configuration after deployment.
- `MARKET_ACTIVATION`: orchestrate, but never bypass, an approved `MarketPolicyVersion` transition.
- `AI_PROVIDER_ACTIVATION`: require every item in the independent [AI provider go-live gate](runbooks/AI_PROVIDER_GO_LIVE_GATE.md).
- `PLANNED_DEACTIVATION`: drain/disable an exact scope safely.
- `ROLLBACK`: restore a previously verified immutable revision/configuration.
- `EMERGENCY_STOP`: stop traffic/workers/capabilities through narrowly preapproved operations.

Financial execution and content publication are not included in the initial registry. They retain their own domain workflows.

## 10. Preflight registry

Each check is typed, versioned, time-bounded and safe to rerun. Results include status, evidence URI/reference, observed timestamp, expiry, source digest and redacted reason.

### Non-overridable checks

- Exact release revision/image provenance and successful remote CI.
- Zero unresolved HIGH/CRITICAL dependency advisories.
- Tracked-tree and full-history secret scans.
- Prisma schema, complete clean migration replay, migration status and baseline compatibility.
- Destructive/irreversible migration detection and application-first compatibility.
- RBAC catalog synchronization and two eligible independent approvers.
- Required production secret references and rotation evidence, never values.
- Backup and tested restore point compatible with the release.
- Liveness, readiness, outbox/jobs and critical dependency health.
- No unresolved blocking incident or security/privacy breach.
- Rollback artifact and runbook availability.
- Signed manifest digest and environment/provider binding.

### Scope-dependent checks

- Market readiness evidence plus approved Market policy.
- Privacy/legal/consent and data-residency approvals.
- Payment provider, webhook and financial reconciliation readiness.
- F9 published/approved content and SEO readiness.
- F10 provider/model/evaluation/cost/load/soak gate.
- Capacity, rate limits, domain/DNS/CDN/TLS and observability alert routing.

Warnings require a reason, owner, expiry and policy permission. No UI path can waive a non-overridable failure.

## 11. Approval and authentication

- New permissions: `release.read`, `release.propose`, `release.preflight`, `release.approve`, `release.execute`, `release.rollback`, `release.emergencyStop`, `release.audit.read`, `release.adapter.read`, `release.adapter.manage`.
- No generic `ADMIN` role is sufficient. Wildcard super-admin compatibility must still pass separation-of-duties checks.
- Production approval and execution require a recent step-up factor. Preferred target is WebAuthn/passkey or an enterprise identity-provider MFA assertion; exact mechanism is an architecture dependency to select.
- At least two distinct people: proposer and approver. Production policy should normally require an independent executor or service identity as a third principal.
- The requester, target owner and approver constraints are evaluated server-side at decision time.
- Approval expires, is revocable before execution and becomes invalid if any digest-bound input changes.
- Break-glass emergency stop requires a distinct role, recent MFA, incident/reason and post-action review; it cannot promote a release.

## 12. Execution adapter contract

Adapters are registered in code and configured by secret reference. An adapter declares:

- provider/type and supported environment/change operations;
- request/response schemas and payload limits;
- least-privilege credential reference;
- deterministic idempotency key support;
- timeout, retry, rate and concurrency policy;
- observed-state/readiness methods;
- callback signature/replay validation where used;
- safe errors and redaction policy;
- rollback/stop capabilities;
- health and circuit-breaker behavior.

The registry explicitly forbids arbitrary URL, shell, SQL and user-authored executable input. A future GitHub Actions, Cloudflare, container-host, Kubernetes or other adapter is implemented separately and tested against the same contract. No provider will be chosen by this planning commit.

## 13. Durable execution and exactly-once effects

- Reuse PostgreSQL-backed outbox/job leases and F5 Operations visibility.
- Unique effect key: `requestRevisionId + rolloutStageId + adapterOperation`.
- Persist intent before dispatch; persist authenticated callback/poll observations separately.
- Bounded exponential retry only for classified retryable failures.
- Worker crash, timeout, callback duplication and database reconnect must not duplicate provider effects.
- Exhausted execution enters an observable terminal/dead-letter state; manual replay is disabled unless a dedicated reasoned, permissioned, idempotency-checked workflow is implemented.
- Queue age, lease age and provider reconciliation are monitored.

## 14. Progressive rollout

Default application-release stages:

1. Validate immutable artifact and configuration without traffic.
2. Deploy to staging and execute smoke/contract/migration compatibility checks.
3. Deploy production artifact inactive or at zero traffic when provider supports it.
4. Canary to an approved bounded cohort/percentage.
5. Observe a configured minimum window.
6. Advance through explicit stages only if every gate passes.
7. Mark `ACTIVE` only after desired and observed state match and verification is current.

Versioned abort gates cover error rate, p95/p99 latency, readiness, queue age, payment/webhook health, database saturation, incident creation, privacy/security signals and configured business guardrails. Unknown data or telemetry gaps stop advancement.

## 15. Deactivation, rollback and emergency stop

### Planned deactivation

Uses the ordinary lifecycle, four-eyes approval, impact preview, drain plan and post-change verification. It is not a casual reverse toggle.

### Rollback

Links to a verified prior manifest; disables incompatible new writes/capabilities first; applies the previous application artifact; validates forward-compatible schema; preserves all evidence. Database schema rollback is not automatic.

### Emergency stop

May invoke only predeclared stop operations such as traffic isolation or worker/capability disable. It requires current step-up authentication, an incident/reason and full audit. It never deletes records, changes Market policy to ACTIVE, selects a new release, runs arbitrary commands or performs financial effects.

## 16. API contract

Proposed versioned endpoints, adapted to final conventions:

```text
GET/POST   /api/v1/admin/releases/artifacts
GET/POST   /api/v1/admin/releases/manifests
GET/POST   /api/v1/admin/go-live/requests
POST       /api/v1/admin/go-live/requests/:id/revisions
POST       /api/v1/admin/go-live/requests/:id/preflight
POST       /api/v1/admin/go-live/requests/:id/submit
POST       /api/v1/admin/go-live/requests/:id/approve
POST       /api/v1/admin/go-live/requests/:id/reject
POST       /api/v1/admin/go-live/requests/:id/execute
POST       /api/v1/admin/go-live/requests/:id/cancel
POST       /api/v1/admin/go-live/requests/:id/rollback
POST       /api/v1/admin/go-live/emergency-stop
GET        /api/v1/admin/go-live/executions
GET        /api/v1/admin/go-live/environments
GET        /api/v1/admin/go-live/drift
GET        /api/v1/admin/go-live/preflight-definitions
GET        /api/v1/admin/go-live/adapters
```

All reads are paginated and environment-scoped. Mutation bodies are strict and bounded. Responses expose safe state, evidence references, actor projections and correlation/trace IDs, never secrets or raw provider payloads.

## 17. Admin Web experience

The production control is placed on a dedicated **Release & Go-Live** page, not mixed into general settings.

### Request experience

- Prominent environment badge and immutable release SHA/image digest.
- Exact change manifest grouped by application, migrations, flags, Markets and providers.
- Impact and rollback preview.
- “Prepare production request” primary action; wording never implies immediate activation.
- Typed confirmation using the target environment plus recent step-up authentication.
- Preflight checklist with current/stale/failed evidence.
- Submit-for-approval action only after mandatory preflight passes.

### Approval experience

- Independent reviewer sees the digest, diff, evidence, risks, rollout and rollback.
- UI refuses self-approval and explains the policy.
- Required reason and explicit expiry.
- A changed revision is visibly unapproved.

### Execution experience

- Final “Execute approved rollout” appears only for eligible operators while approvals are valid.
- Live durable timeline shows stages, health, observations and stop criteria.
- Rollback and emergency stop are visually distinct, require reasons and never share the activation confirmation.
- Loading, empty, failure, stale-data and disconnected-provider states are explicit and accessible.

The backend remains authoritative even when controls are hidden. No optimistic UI may claim production is active before reconciliation completes.

## 18. Observability and audit

Metrics (no PII labels): request counts by state/type/environment; preflight duration/failure reason; approval latency/expiry; execution and stage duration; retries/exhaustion; provider latency/errors; rollback/stop counts; observed-state drift; verification/SLO failures; stale evidence; queue/lease age.

Every event carries requestId, correlationId, traceId, goLiveRequestId, revisionId and executionId where applicable. Audit records include actor/service principal, exact digest, prior/new lifecycle, permission, authentication assurance, reason, evidence references, adapter/provider identity, safe result and timestamps.

Alerts cover stuck approval/execution, expired evidence, drift, callback replay/signature failure, provider outage, failed rollback, verification regression, unauthorized attempts and emergency-stop use.

## 19. Security threat model and required tests

### Authorization and approval

- 401/403 matrix for every endpoint.
- Forged role/permission, stale session and revoked session.
- Missing/old MFA assertion and CSRF failure.
- Self-approval, proposer-as-executor, colluding duplicate identity and approval-count manipulation.
- Approval replay, expiry, revocation and digest substitution.

### Input and environment binding

- Forged environment/Market/provider/release.
- Cross-environment credential reference or observed-state confusion.
- Configuration/manifest canonicalization ambiguity and hash mismatch.
- Oversized input, pagination/date-range/filter abuse and malicious metadata.
- Path traversal, URL injection, open redirect, shell/SQL/tool injection.

### Concurrency and durability

- Concurrent request revisions/transitions and double execution.
- Duplicate outbox/callback/poll response.
- Crash before dispatch, after provider effect and before persistence.
- Timeout followed by late success, database reconnect and worker restart.
- Rollout/rollback collision and emergency stop during apply/verify.

### Secrets and privacy

- Secret values rejected from all APIs and database evidence.
- Credential, token, PII and provider payload redaction in logs/traces/audit/errors.
- Callback signature/replay and SSRF protections.
- Full-history secret scan and negative controls.

### Safety boundaries

- Readiness cannot activate Market.
- AI recommendation/approval cannot execute a release.
- Content approval cannot become deployment approval.
- Financial flags/effects cannot be changed without their own authority.
- Planned disable and emergency stop cannot promote a different revision.

## 20. Database, Prisma and RLS

Starting from the 26 F10 migrations, add reviewed additive migrations only. Required gates:

- Prisma format/validate/generate.
- Clean PostgreSQL replay of the entire history.
- Supabase role emulation, forced RLS/default deny and minimum grants.
- Lifecycle/check/unique constraints and restrictive foreign keys.
- Concurrency/advisory-lock tests against PostgreSQL.
- Baseline compatibility and application-first rollback.
- No `db push`, production reset, destructive cascade or evidence deletion.

## 21. Implementation slices by dependency

Each slice is production-grade within its boundary; none is an MVP shortcut.

### A. Architecture and provider decisions

- Accept ADR 0007 and threat model.
- Select deployment/GitOps provider, secret manager, step-up MFA mechanism and environment topology through separate reviewed decisions.
- Define manifest, adapter, observation and evidence contracts.

**Gate:** authorities, trust boundaries, provider responsibility and no-go conditions are approved before schema/code.

### B. Release catalog and immutable change requests

- Add schema, constraints, RLS and services for artifacts, manifests, requests and revisions.
- Implement canonical digest, strict lifecycle and concurrency.

**Gate:** revisions are immutable; stale/different digests invalidate all approvals.

### C. Preflight and evidence engine

- Closed check registry, evidence expiry, mandatory/non-overridable policy and safe exceptions.
- Integrate CI, migrations, scans, backups, health/incidents and scoped domain gates read-only.

**Gate:** missing/stale/failed mandatory evidence prevents submission and execution.

### D. Step-up authentication, RBAC and approvals

- Narrow permission catalog, roles, session assurance and four-eyes approval policy.
- Approval expiry/revocation and exact digest binding.

**Gate:** full 401/403/MFA/four-eyes/replay matrix passes.

### E. Durable executor and closed adapters

- PostgreSQL-backed execution, leases, idempotency, retry/dead-letter and reconciliation.
- Implement only the selected provider adapter and isolated fake/contract adapter for tests.

**Gate:** exactly-once-effect scenarios and provider failure matrix pass without arbitrary execution capability.

### F. Progressive rollout, verification and rollback

- Versioned rollout stages, canary gates, abort thresholds, smoke/SLO/business verification.
- Planned deactivation, application-first rollback and emergency stop.

**Gate:** staging/canary/abort/rollback/emergency-stop rehearsals preserve evidence and converge observed state.

### G. Versioned Admin APIs and Admin Web

- API contracts, pagination/filter bounds, audit, observability and Release & Go-Live surface.
- Accessible request/review/execution history and explicit environment safety language.

**Gate:** browser has no credentials/direct provider access and cannot bypass backend policy.

### H. Hardening, documentation and remote closure

- Security/concurrency/property tests, clean migrations, load/soak of the executor, dependency audits and secret scans.
- Runbooks for rollout, rollback, emergency stop, provider outage, drift, credential compromise and database failure.
- CI verification and Notion evidence.

**Gate:** all F1-F10 regressions plus F11 gates pass remotely while production and Markets remain inactive.

## 22. Verification matrix

| Area | Required evidence |
| --- | --- |
| Domain | lifecycle, digest immutability, policy versioning, evidence expiry |
| Auth | Admin session, narrow RBAC, CSRF, step-up MFA, four-eyes, revocation |
| Execution | idempotency, concurrency, crash recovery, retry/dead-letter, reconciliation |
| Provider | adapter contract, least privilege, signature/replay, timeout/rate/circuit behavior |
| Rollout | staging, canary, abort threshold, progressive advancement, rollback |
| Safety | Market/AI/content/financial boundaries and emergency-stop restrictions |
| Database | all migrations clean/current, PostgreSQL integration, RLS/default deny |
| UI | Admin tests/lint/build, accessibility, stale/error states, no direct secrets |
| Platform | root verify, Client/Professional/public-web regression where contracts change |
| Security | dependency audits, tracked-tree/full-history secrets, injection/SSRF/redaction |
| Operations | metrics, alerts, trace correlation, incident and runbook exercises |
| Remote | GitHub Actions all jobs green on exact published SHA |

## 23. F11 acceptance gates

F11 is `HECHO` only when all of the following are demonstrated locally and remotely:

- Durable versioned release artifact, manifest, request, approval, execution and observation records.
- Exact digest-bound approvals with current step-up authentication and four-eyes.
- Closed, least-privilege adapter registry with no arbitrary command/HTTP/SQL path.
- Mandatory fail-closed preflight and expiring evidence.
- DB-backed idempotency and concurrency safety through crash/retry/callback scenarios.
- Progressive rollout, deterministic abort, planned deactivation, rollback and emergency stop rehearsed outside production.
- Desired/observed-state reconciliation and drift alerts.
- Full Admin API and accessible Admin Web control surface without mocks.
- Narrow RBAC, complete audit, safe telemetry and PII/secret redaction.
- Additive migrations, forced RLS/default deny and clean full replay.
- F1-F10 regression, dependency/security gates, secret scans and remote CI green.
- Deployment, rollback, emergency, incident and credential-compromise runbooks complete.
- Production remains inactive and Markets remain inactive throughout phase verification.

F11 implementation completion does **not** authorize actual go-live. The first production rollout requires a separate, explicit, dated human GO decision referencing the exact immutable revision and current evidence.

## 24. Human decisions required before implementation reaches adapter work

These are intentionally unresolved and must not be guessed:

1. Production hosting/deployment or GitOps provider and target architecture.
2. Production secret manager and executor workload identity.
3. Step-up authentication provider/mechanism and recovery policy.
4. Production/staging domains, DNS/CDN/TLS and network boundaries.
5. Database topology, backup owner, retention and demonstrated restore objective.
6. On-call/incident owners and approval-role assignments.
7. Initial release scope: application only versus later separately approved Market/provider changes.
8. Canary percentages, observation windows, SLOs and automatic abort thresholds.

## 25. Planned completion report

```text
F11 STATUS: HECHO | PARCIAL
Branch:
Base F10 SHA: afd1c19db94053795c75e64138090745739725d8
Architecture SHA:
Core implementation SHA:
Adapter/execution SHA:
Admin/surfaces SHA:
Documentation/release SHA:
Migrations:
Backend tests:
F11 focused tests:
Admin Web:
Public web:
Client:
Professional:
PostgreSQL:
Supabase/RLS:
Prisma:
RBAC/MFA:
Dependency audits:
Secret scan:
Full-history scan:
GitHub Actions run:
Preflight/approval gates:
Execution/rollback gates:
Residual risks:
Markets activated: NO
Production activated: NO
Actual go-live authorized: NO
```
