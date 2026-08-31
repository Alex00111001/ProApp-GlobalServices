---
name: observability
description: Implement or review HomeServices request context, structured logging, redaction, error grouping, health, incidents, traces, metrics, alerts, and operational runbooks.
---

# Observability

Read `docs/OBSERVABILITY.md` and inspect the existing request-context, logger, error, health, incident, and audit modules before adding telemetry.

## Signals and context

- Propagate request ID, correlation ID, trace ID, actor/tenant/market when safe, operation, and service version.
- Use stable event names, error codes, severity, component, and retryability.
- Use allowlisted structured fields; redact authorization, cookies, secrets, card/payment data, sensitive documents, and unnecessary personal data.
- Keep health responses useful but free of credentials, connection strings, stack traces, or internal topology not required by operators.
- Group repeated errors deterministically without merging unrelated root causes.
- Record incident transitions, comments, links, and administrative actions in audit history.

## Workflow

1. Define the operational question, signal, cardinality, retention, privacy classification, and alert owner.
2. Instrument at domain/service boundaries, not only controller exceptions.
3. Preserve context across database, outbox, webhook, and provider boundaries.
4. Add dashboards/alerts only with runbook actions and false-positive considerations.
5. Test redaction and failure paths explicitly.

Observability must not change business behavior when exporters are unavailable. Verify correlation across a representative request, redaction, grouping, dependency health degradation, incident permissions, and bounded metric dimensions.
