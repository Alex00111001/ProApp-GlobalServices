# Observability and incident management

This document defines the production contract delivered by F2. PostgreSQL stores operational evidence, Pino emits structured logs, Prometheus exposes pull metrics, and OpenTelemetry exports vendor-neutral traces and metrics over OTLP. Alert delivery is transactional through the existing outbox and a signed webhook adapter.

## Data flow

`HTTP/Webhook → RequestContext → structured log + OpenTelemetry span → ErrorEvent → ErrorGroup → Incident → OutboxEvent → signed alert webhook`

Every asynchronous outbox record carries `requestId`, `correlationId`, `traceId` and W3C `traceparent` when a sampled span exists. The worker extracts that carrier and starts a child span before invoking the handler. Payment, refund, payout, dispute and booking events use the same metadata helper.

## Request and tracing contract

Inbound headers are `x-request-id`, `x-correlation-id`, `x-trace-id` and `traceparent`. Opaque request/correlation IDs must match `[A-Za-z0-9._:-]{1,128}`. Valid W3C trace parents preserve the upstream trace and parent span; unsafe values are replaced. Responses always return the three `x-*` fields and return a new `traceparent` when the trace ID is W3C-compatible.

- `requestId`: one HTTP attempt.
- `correlationId`: one business journey across retries and asynchronous work.
- `traceId`: one distributed trace.
- `spanId` / `parentSpanId`: current and upstream span relationship.

Production startup requires OTLP over HTTPS. Root trace sampling is configurable and parent-based. Auto-instrumentation covers Express, Node HTTP and PostgreSQL; filesystem and DNS spans are intentionally disabled. HTTP trace attributes store paths without query strings, span attributes are length/count bounded, and no request bodies or selected headers are exported.

## Structured logging contract

Logs are newline-delimited JSON. `LOG_TRANSPORT=stdout` is the recommended container transport; `file` is available for managed hosts and requires `LOG_FILE_PATH`. The runtime owns rotation/collection of stdout, while file rotation must be performed by the host. Supported levels are `trace`, `debug`, `info`, `warn`, `error` and `fatal`; production defaults to `info`.

Normalized fields are:

- `time`, `level`, `msg`, `service`, `environment`, `version`;
- `requestId`, `correlationId`, `traceId`, `spanId`, `parentSpanId`;
- `req.id`, `req.method`, `req.path`, `res.statusCode`, `responseTime`;
- bounded operational identifiers such as `eventId`, `eventType`, `code` and a hashed `userRef`.

The central sanitizer removes authorization/cookies, credentials, API/payment secrets, card/CVV/bank fields, email, phone, address/document fields, PAN-like numbers, IP addresses, credential-bearing URLs and database/Redis URLs. Query strings are removed. Exceptions serialize type, redacted message, stable code and retryability; stack traces never enter logs and are not persisted in production. Do not use `console.*` for new server code or attach raw bodies/headers to logger calls.

## Error grouping and storage

`ErrorEvent` is an immutable occurrence containing safe request and trace context. `ErrorGroup` is the canonical aggregate and owns status, first/last seen timestamps, lifetime count and bounded-window count. The SHA-256 fingerprint is derived from service, module, operation, stable error code and a normalized/redacted message. UUIDs and variable numeric IDs are replaced before hashing.

PostgreSQL performs group upsert with `INSERT ... ON CONFLICT`, so concurrent first occurrences neither lose counts nor emit expected unique-constraint errors. A new aggregation window reopens the error group. `Incident.errorGroupId` links the operational incident; `IncidentEvent.errorEventId` retains the triggering occurrence.

The legacy aggregate columns on `ErrorEvent` are intentional expand/contract compatibility for a temporary pre-F2 application rollback. F2 never uses them as the source of truth.

## Metrics

The protected `/api/admin/operations/metrics` endpoint emits Prometheus format. OTLP metrics are exported independently when enabled.

- RED: request count, latency histogram and in-flight requests by bounded method/route/status class.
- USE/runtime: Node process CPU, memory, event-loop and handle metrics from the Prometheus client.
- Dependencies: check count and latency for database/outbox.
- Queues: outbox depth by bounded status.
- External work: Stripe operation outcome by bounded provider/operation/outcome.

Do not add user IDs, URLs, error messages, provider object IDs or arbitrary tenant values as metric labels.

## Incident lifecycle and alerting

Valid incident transitions are:

`OPEN → INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED → CLOSED`

`RESOLVED` or `CLOSED` may transition to `INVESTIGATING` to reopen; resolved/closed timestamps are cleared. Each transition uses optimistic state matching and transactionally writes an `IncidentEvent`, `AuditLog` and `OutboxEvent`. Error groups follow `OPEN → ACKNOWLEDGED → RESOLVED|IGNORED`, with `RESOLVED|IGNORED → OPEN` for recurrence.

Critical errors open immediately. Other severities use the configured threshold and aggregation window. `Incident.deduplicationKey` is unique per error group/window, preventing duplicate incidents and initial alerts under concurrency. Reopening produces one new alert event because repeated same-state transitions are idempotent.

Alerts below `OBSERVABILITY_ALERT_MIN_SEVERITY` are suppressed. High and critical alerts route independently. The observability worker leases only supported alert event types, delivers a sanitized JSON body with timestamped HMAC-SHA256 headers, retries exponential failures, and sends non-retryable/exhausted work to `DEAD_LETTER`. Production requires both HTTPS destinations and a 32+ character signing secret.

## Health contract

- `GET /health/live`: process liveness only; never queries dependencies and is excluded from rate limiting.
- `GET /health/ready` and compatibility alias `GET /health`: database and outbox readiness. `OUTAGE` returns 503; `DEGRADED` remains 200 but requires operator attention.
- `GET /api/admin/operations/health`: protected readiness and durable safe snapshots.

Checks are bounded by `OBSERVABILITY_HEALTH_TIMEOUT_MS`. Responses expose only dependency names, status, latency and a generic message. Database URLs, hosts, provider payloads and exception text are never returned.

Interactive database transactions use bounded acquisition and execution windows configured by `DATABASE_TRANSACTION_MAX_WAIT_MS` and `DATABASE_TRANSACTION_TIMEOUT_MS` (10 seconds by default). The acquisition window absorbs bounded bursts that temporarily consume the PostgreSQL pool, while the execution timeout still fails closed instead of allowing indefinitely open transactions.

## Protected operations API

All endpoints require authentication and database-backed permission checks.

F5 exposes the production control surface under `/api/v1/admin/operations/*` using the dedicated administrative session boundary. The older `/api/admin/operations/*` path remains a compatibility interface and is not used by Admin Web.

- `dashboard.read`: health, snapshots and metrics.
- `incidents.manage`: list/detail/status of error groups and incidents; add comments.
- `audit.read`: correlation/resource-filtered audit history.
- Narrow F5 permissions separate errors/incidents read from lifecycle mutation and separately protect health, jobs, integrations, alerts, support and read-only financial monitoring.

List limits are validated and capped at 100. Error detail exposes safe occurrence identifiers and request/correlation/trace IDs, never stack traces or raw metadata.

## Retention and capacity

`OBSERVABILITY_RETENTION_DAYS` defaults to 30 for immutable error occurrences and health snapshots. `OBSERVABILITY_AUDIT_RETENTION_DAYS` defaults to 365 for audit evidence. The worker runs bounded retention daily. Error groups and incidents remain as durable aggregates/history; database backup and legal retention requirements take precedence over deletion.

Collector/exporter retention is external: recommended starting limits are 30 days for searchable logs/traces, 13 months for rolled-up service metrics and alert/incident evidence according to the audit policy. Configure volume quotas and alerts at 70/85/95 percent of storage allocation.

## Configuration

See `backend/.env.example`. Production fails closed unless CORS/JWT/Stripe, OTLP HTTPS, trace sampling, alert HTTPS destinations and signing secret are valid. Financial execution flags remain independent and disabled by default.

## Runbooks

- [Incident response and correlation diagnosis](runbooks/OBSERVABILITY_INCIDENT_RESPONSE.md)
- [Observability rollback and dependency failures](runbooks/OBSERVABILITY_ROLLBACK.md)
