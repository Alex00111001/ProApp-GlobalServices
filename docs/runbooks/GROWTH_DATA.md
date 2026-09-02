# Growth Data runbook

## Preconditions

1. Confirm the target is a non-production PostgreSQL/Supabase environment and record the release owner.
2. Back up/capture the schema according to `docs/DATABASE_MIGRATIONS.md`.
3. Configure `DIRECT_URL`, keep credentials out of output/source control, and set a stable environment-specific `GROWTH_PSEUDONYM_SECRET`.
4. Keep `GROWTH_DATA_ENABLED=false` until migration, RBAC synchronization, tests and smoke checks pass.

## Deploy to test/staging

```powershell
Set-Location backend
npm run db:audit-baseline
npx prisma migrate deploy
npm run seed:rbac
npx prisma migrate status
$env:RUN_DATABASE_INTEGRATION_TESTS='true'
$env:NODE_ENV='test'
npm run test:integration
Set-Location ..
npm run verify
```

Enable `GROWTH_DATA_ENABLED=true` only in the intended test/staging deployment. Do not activate production from this runbook without explicit release and privacy approval.

## Smoke checks

1. Submit a canonical event with a random `eventId`, then replay it. Both responses must reference the same ID and the replay must return `duplicate=true`.
2. Confirm exactly one MarketingEvent and, for a conversion event, one Conversion exist.
3. Confirm no raw anonymous/session value or contact data appears in database projections, responses, logs or outbox payloads.
4. Log in as `MARKETING_ADMIN`; verify overview/funnel/campaigns/leads/conversions.
5. Confirm `ANALYST` receives 403 for `/api/v1/admin/growth/*`.
6. Create a DRAFT campaign, activate it, pause it and confirm all transitions have audit/outbox evidence and correlation IDs.
7. Check `partialData`, range, timezone and freshness before interpreting the funnel.

## Diagnosis

- `GROWTH_DATA_DISABLED`: confirm the environment flag; do not bypass it in production.
- Duplicate not recognized: verify the producer reuses the exact logical `eventId` and that it meets the bounded contract.
- Event rejected for booking: authenticate the owner; submitted identity cannot establish ownership.
- Campaign not linked: ensure the UTM campaign value equals the immutable lowercase campaign key.
- Funnel subjects are zero: inspect `partialData` and whether events have linked pseudonymous leads; do not query/expose raw IDs.
- Metrics differ by country: event/lead country comes from validated event geography; campaign country is an administrative scope and not inferred.
- Use response `correlationId`/`traceId` to follow logs, audit and outbox evidence.

## Abort thresholds and rollback

Disable `GROWTH_DATA_ENABLED` immediately if duplicate conversions appear, raw identifiers/PII are observed, authorization is bypassed, event error rate materially rises, or migration/RLS drift is detected. Restore the previous application builds, preserve all evidence and open an incident using the F2/F5 process.

Do not drop tables or reverse the additive migration after data exists. Correct schema or projections through a reviewed forward migration. If the HMAC secret was lost or changed, stop ingestion; restoration/stitching requires a dedicated privacy migration and cannot be inferred from stored hashes.
