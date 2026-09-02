# Growth Data (F6)

## Purpose and boundary

F6 provides reliable first-party acquisition data in PostgreSQL. It accepts canonical product events, projects pseudonymous leads and idempotent conversions, manages internal campaign records, and exposes bounded administrative read models. It does not contact advertising providers, spend budget, assign causal attribution, or duplicate Billing revenue.

Consent, touchpoints and multi-touch attribution remain F7. Referrals and automation remain F8. Experiments, content and SEO remain F9. Production activation requires those applicable product/legal gates and explicit release approval.

## Architecture

```text
mobile/web producer
  -> POST /api/events
  -> edge validation + trusted authenticated identity
  -> one PostgreSQL transaction
       MarketingEvent (idempotency key + request context)
       Lead (keyed pseudonymous subject)
       Conversion (one per qualifying event)
       OutboxEvent (sanitized operational signal)
  -> /api/v1/admin/growth/*
  -> Admin Web Growth
```

`MarketingEvent`, `Campaign`, `Lead` and `Conversion` are the Growth system of record. The frontend calls the backend only. Routes validate transport data; Growth services own identity resolution, transaction boundaries, lifecycle and projections.

## Ingestion contract

`POST /api/events` remains backward compatible. Existing producers may omit `eventId`; new producers should send a random, stable 16–128 character `eventId` for every logical event. Replaying the same key returns the existing event and cannot duplicate its lead/conversion projection.

Accepted identity sources, in order, are authenticated professional, authenticated user, submitted anonymous identifier, then submitted session identifier. `userId` and `professionalId` are not accepted in the body. A submitted `bookingId` is accepted only when the authenticated user/professional owns the booking.

Anonymous and session identifiers are never stored raw by the F6 ingestion path. They and `subjectKey` are HMAC-SHA-256 values keyed by `GROWTH_PSEUDONYM_SECRET`. Production requires a separate secret of at least 32 characters. Rotating it changes future subject keys and therefore requires a reviewed migration/stitching plan; do not rotate it casually.

Event occurrence time may be at most five minutes in the future and 366 days in the past. Metadata is recursively bounded, credentials/payment/PII keys and precise coordinates are removed, and sensitive string patterns are centrally redacted. Sanitized metadata is capped at 16 KiB.

## Projections and definitions

- `Lead`: one analytical subject per keyed subject hash. It progresses `NEW -> ENGAGED -> CONVERTED`; `DISQUALIFIED` is not overridden by events. Campaign association is the first observed valid internal campaign and is observational, not causal.
- `Conversion`: one record per conversion event, protected by unique `eventId` and `conversionKey`. Canonical mappings are signup, request, booking, payment and completed job.
- Funnel: counts event occurrences and distinct linked lead IDs for `app_opened`, `signup_started`, `signup_completed`, `request_created`, `booking_created`, `payment_completed` and `job_completed`.
- Rates: `rateFromFirst` and `rateFromPrevious` are descriptive ratios of unique subjects. They are not cohort sequencing or causal attribution and may exceed 100% when historical coverage is partial.
- Overview: includes explicit range, timezone, campaign/country filters, generation time, event freshness and `partialData`. Historical events without `subjectKey` or `clientEventId` cause partial data.

Ranges are half-open (`from <= occurredAt < to`), default to the last 30 days and cannot exceed 366 days. `timezone` is validated and reported; callers must submit explicit ISO instants for custom local-day boundaries.

## Campaign lifecycle

Campaign keys are immutable lowercase slugs. Valid transitions are:

```text
DRAFT -> ACTIVE | ARCHIVED
ACTIVE -> PAUSED | ARCHIVED
PAUSED -> ACTIVE | ARCHIVED
ARCHIVED -> no transitions and no edits
```

An end timestamp must be later than the start timestamp, and an expired campaign cannot be activated. Create, edit and status changes require `marketing.manage`, an operator reason, an audit row and an outbox event. These records are internal measurement controls only.

## Authorization and privacy contract

- `marketing.read`: overview, funnel, campaigns, pseudonymous leads and conversions.
- `marketing.manage`: create/edit/transition internal campaigns.
- `MARKETING_ADMIN`: both permissions.
- `ANALYST`: deliberately has neither F6 permission; expanding role-wide access requires an explicit privacy/authorization decision.

Sensitive lead/conversion reads are audited. Responses omit subject hashes, trusted user/professional IDs, raw anonymous/session IDs, contact fields and event metadata. Correlation IDs remain available for operational diagnosis.

PostgreSQL tables use forced RLS with no public policies. `PUBLIC`, `anon` and `authenticated` receive no table grants; only the trusted backend connection may access the schema.

## Activation, retention and rollback

`GROWTH_DATA_ENABLED` defaults to `false` in production and `true` outside production. When disabled, the compatible event endpoint still records a sanitized/idempotent `MarketingEvent`, but does not create campaign association, leads, conversions or Growth outbox signals; administrative Growth endpoints return `GROWTH_DATA_DISABLED`.

No automated deletion policy is enabled in F6 because retention duration and erasure/anonymization rules require qualified privacy review in F7. Until then, production activation is blocked. Test fixtures are deleted by their integration tests; operational data must not be manually purged without an approved retention procedure.

Rollback is application-first: set `GROWTH_DATA_ENABLED=false`, restore the previous backend/Admin Web builds and retain the additive schema/evidence. Do not roll back by dropping Growth tables or deleting MarketingEvent, audit or outbox history. Use a forward-fix migration for schema corrections.
