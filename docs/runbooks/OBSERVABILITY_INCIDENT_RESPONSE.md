# Observability incident response

## Triage

1. Confirm `/health/live`; if it fails, restart/replace the process and preserve the preceding container logs.
2. Confirm `/health/ready`. An `OUTAGE` blocks traffic; `DEGRADED` identifies worker backlog without exposing infrastructure details.
3. Capture the alert `incidentId`, severity, service, route, detected timestamp and deduplication key. Never paste webhook signatures, database URLs or provider payloads into comments.
4. Fetch `/api/admin/operations/incidents/{id}` with `incidents.manage`, then follow its error group and latest safe occurrences.
5. Search logs with `correlationId`; use `traceId` in the OTLP backend to inspect request, PostgreSQL and external HTTP spans. `requestId` isolates a single attempt.

## Lifecycle

Move `OPEN → INVESTIGATING` when an operator owns the incident. Record a concise, sanitized reason. Use `IDENTIFIED` only after the failure mechanism is supported by evidence, `MONITORING` after mitigation, `RESOLVED` after service recovery, and `CLOSED` after the observation period. Reopen a resolved/closed incident by moving it to `INVESTIGATING`; this clears closure timestamps and produces a deduplicated alert.

Resolve or ignore the related `ErrorGroup` separately. A new aggregation window may reopen it if the failure returns. Do not mutate immutable `ErrorEvent` rows.

## Alert storms and delivery failures

- Multiple initial alerts with the same deduplication key indicate a consumer/destination defect; do not create replacement incidents.
- Inspect outbox status/depth. A stale processing lease is recoverable; the next worker claim acquires it after expiry.
- For `DEAD_LETTER`, correct route credentials/destination, preserve the original event ID and use an audited replay procedure. Never manufacture a new incident solely to retrigger delivery.
- HTTP 429/5xx delivery failures retry with exponential backoff. Missing route configuration is non-retryable and must fail deployment readiness/config validation in production.

## Common failure diagnosis

- Database `OUTAGE`: remove the instance from service, verify Supabase connectivity/credentials outside logs, then restore traffic only after readiness is healthy.
- Outbox `DEGRADED`: check dead letters, worker availability and leases; synchronous API traffic can remain available while operators assess business impact.
- OTLP exporter unavailable: application traffic may continue, but declare observability impairment if trace loss exceeds the operating objective. Preserve structured stdout logs and correlation IDs.
- Alert destination unavailable: incidents still persist transactionally. Restore the destination/worker and replay the existing outbox event.
- Cardinality/volume increase: identify the bounded route/error group; never add raw URLs, messages or user/provider IDs as labels.

## Resolution evidence

Attach the incident timeline, affected window, correlation/trace examples, mitigation, test/reproduction result, monitored recovery period and follow-up owner. Do not close while readiness is `OUTAGE`, the alert event is unaccounted for, or the related high/critical error group is still increasing.
