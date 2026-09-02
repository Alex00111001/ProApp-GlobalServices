# Operations Control

F5 exposes the F2 observability engine and F3 financial signals through the dedicated F4 administrative session boundary. PostgreSQL remains the system of record and `admin-web` calls only `/api/v1/admin/operations/*`.

## Operational surfaces

- Overview: current readiness, error/incident/job/integration counts, active support cases and read-only financial attention.
- Error Explorer: bounded search, safe occurrences, correlation/trace evidence and the canonical F2 status lifecycle.
- Incident Center: detail, timeline, internal comments and strict auditable transitions.
- Health: current database/outbox readiness and persisted safe snapshots.
- Jobs: outbox state, attempts and failure presence; raw errors and payloads are not returned.
- Integrations: provider/event/status/correlation evidence without provider payloads or raw errors.
- Alerts: delivery state and safe route/severity only. Destinations, signatures and payloads are never returned.
- Financial monitoring: currency-separated refund, payout and dispute aggregates plus reconciliation results. The surface is read-only.
- Support: durable cases, ownership, priority, category, internal comments and strict lifecycle.

The compatibility API under `/api/admin/operations` remains mounted for existing operators. New Admin Web work uses only the versioned API and dedicated admin access tokens.

## Permissions

Read and mutation capabilities are separate: `operations.read`, `errors.read`, `errors.manage`, `incidents.read`, `incidents.manage`, `health.read`, `jobs.read`, `integrations.read`, `alerts.read`, `financial.monitoring.read`, `support.read` and `support.manage`. Backend checks are authoritative.

Support and compliance roles can inspect bounded operational context without receiving worker/provider errors. Operations Admin can manage error and incident lifecycle. Finance Admin receives read-only financial monitoring; refund, payout and reconciliation execution retain their F3 permissions and four-eyes controls.

## Data safety

List/detail selectors are allowlists. Error stacks, `ErrorEvent.metadata`, integration payloads, outbox payloads, provider IDs, `lastError`, destinations and credentials are excluded. Incident/support comments are privileged operator content and must not contain credentials, payment-card data or identity documents. Sensitive detail reads and every mutation emit `AuditLog` correlation evidence.

## Support lifecycle

`OPEN → TRIAGED → IN_PROGRESS → WAITING_CUSTOMER → IN_PROGRESS → RESOLVED → CLOSED`

`RESOLVED` and `CLOSED` may reopen to `IN_PROGRESS`. Updates use optimistic status matching; a concurrent change returns `SUPPORT_CASE_CONFLICT`. Assignment accepts only active users with an active RBAC grant of `support.manage`; legacy `User.role=ADMIN` is insufficient.

Each create, transition, assignment and comment writes a minimal outbox event in the same transaction. Event payloads contain identifiers/state only, never the case description or comment body.

## Retention and rollback

Operational error occurrence retention remains governed by F2. Support cases, events, comments, incidents and audit evidence are durable until a reviewed privacy/legal retention policy authorizes archival or controlled anonymization.

Application rollback is first: restore the previous backend/admin build while retaining additive F5 tables and permissions. Do not drop support/audit/incident data. Revoke F5 role grants through the reviewed RBAC catalog only if access must be contained. Schema corrections use a forward migration.

Replay of dead-letter jobs or alerts is intentionally unavailable in F5 until a separate idempotent, audited replay contract and approval policy are approved.
