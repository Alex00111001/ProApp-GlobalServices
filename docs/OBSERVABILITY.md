# Observability and incident management

## Request context

Every HTTP request receives `x-request-id`, `x-correlation-id` and `x-trace-id`. Safe upstream IDs are preserved; malformed or oversized values are replaced. Responses return all three identifiers. `correlationId` follows the business operation and `traceId` is reserved for distributed tracing interoperability.

## Logging and redaction

The API emits structured JSON through Pino. Authorization headers, cookies, passwords, tokens, secrets, API keys and card/CVV-shaped fields are redacted. Production error responses and persisted error events do not expose stack traces. Application code should use `req.log` or the shared logger and attach stable error codes instead of interpolating secrets or personal data.

## Error events

Unhandled errors are normalized and grouped by a SHA-256 fingerprint derived from service, module, operation, code and normalized message. UUIDs and variable numeric identifiers are removed from the grouping key. Repeated occurrences update counters and last-seen context instead of creating unbounded duplicate rows.

`ErrorEvent` is operational telemetry; `AuditLog` records actor actions; `MarketingEvent` records product behavior. These records are intentionally separate.

## Incidents

Repeated errors can produce an incident recommendation/record when the configured threshold is reached inside its time window. Incident state follows `OPEN → INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED → CLOSED`. Error occurrences are linked through `IncidentEvent`; human discussion is stored in `IncidentComment`.

Admin endpoints currently expose recent errors, incidents and dependency health under `/api/admin/operations`. They require explicit operations permissions; legacy `ADMIN` remains a temporary compatibility bridge.

## Health

`GET /health` is a public, non-sensitive liveness/dependency summary. Administrative health adds the same registry behind RBAC. Status values are `HEALTHY`, `DEGRADED`, `OUTAGE` and `UNKNOWN`. Payment, push, storage, email, workers and external API checks will be registered when their adapters are introduced.

## Operational constraints

- Error reporting failure never replaces the original API response.
- Incident automation does not deploy fixes or close incidents autonomously.
- Retention and anonymization policies must be configured before production traffic.
- Alert delivery and OpenTelemetry exporters remain adapter work; no vendor is embedded in domain services.
