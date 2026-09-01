# Observability rollback and recovery

## Application rollback

1. Stop the observability worker to prevent new external alert deliveries.
2. Preserve PostgreSQL, outbox, audit, error, incident and health data. Never reset or `db push` the database.
3. Roll back the API image/commit. F2 keeps legacy `ErrorEvent` aggregate columns specifically so a temporary pre-F2 binary can start and query its former operations endpoints.
4. Keep the F2 schema in place. Prisma migrations are roll-forward; do not drop `ErrorGroup`, incident links or RLS during an application rollback.
5. Validate `/health/live`, `/health/ready`, core F1 tests and payment webhook idempotency before restoring traffic.

The legacy application does not understand multiple immutable occurrences per fingerprint, so error grouping during the rollback window is degraded. Treat rollback as a short mitigation and deploy a corrected F2-compatible build promptly.

## Disable without rollback

- Stop the worker to pause alert delivery and retention.
- Set `OTEL_ENABLED=false` only outside production validation or via a controlled emergency configuration release; structured logs and Prometheus remain available.
- Route traffic away from instances whose readiness is `OUTAGE`.
- Do not change financial feature flags as part of an observability-only rollback.

## Migration recovery

Use `prisma migrate status` and the recorded migration history. A failed test migration must be inspected before `migrate resolve`; never mark a migration applied unless every statement and constraint is verified. The F2 release applied `202608310004_observability_hardening` and `202609010001_observability_rollback_compatibility` to Supabase test. Production deployment must use `prisma migrate deploy`, take a backup and rehearse on an equivalent database.

## External destination rollback

Rotate the signing secret and update both alert destinations together. Stop workers before rotation, validate a signed test-mode alert, then restart. Existing pending outbox events are safe to deliver; keep their IDs/deduplication keys. If a destination was compromised, preserve evidence and rotate rather than deleting pending history.
