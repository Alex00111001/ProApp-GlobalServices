# Support operations runbook

## Intake and triage

1. Create a case with a concise subject, category and priority. Do not paste passwords, access tokens, full card data, CVV or identity documents.
2. Link a requester/booking only when evidence confirms ownership. The API rejects a booking/requester mismatch.
3. Move `OPEN` to `TRIAGED`, assign an active `support.manage` operator and record the operational reason.
4. Use internal comments for decisions and sanitized evidence references. Every comment is audited and produces a metadata-only outbox event.

## Priority

- `URGENT`: immediate safety, widespread access or active financial harm; engage the incident runbook when service impact exists.
- `HIGH`: blocked booking/payment/professional journey requiring prompt ownership.
- `MEDIUM`: ordinary support issue.
- `LOW`: informational or non-blocking request.

## Lifecycle and escalation

Use `IN_PROGRESS` only while an operator owns work, `WAITING_CUSTOMER` only when external evidence is required, `RESOLVED` after the remedy is verified and `CLOSED` after the observation window. Reopen to `IN_PROGRESS` when verified evidence shows recurrence.

Errors/incidents and support cases stay separate: link operational identifiers in sanitized notes, then diagnose by `correlationId`/`traceId`. Financial monitoring is read-only. Refunds and payouts follow the F3 four-eyes runbooks and must never be executed from a support case.

## Failure recovery

- `SUPPORT_CASE_CONFLICT`: refresh detail; another operator changed status. Re-evaluate instead of retrying blindly.
- `INVALID_SUPPORT_ASSIGNEE`: synchronize RBAC and choose an active operator with `support.manage`.
- Database outage: stop mutations, preserve correlation ID and follow the observability incident runbook.
- Outbox degradation: the case transaction remains authoritative; do not duplicate the case or comment to manufacture another event.

## Closure evidence

Before closing, record the verified result, related booking/user reference if appropriate, correlation/incident reference, owner and observation outcome. Never remove case events/comments or audit rows to clean up history.
