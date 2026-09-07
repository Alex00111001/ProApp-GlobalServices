# F7 Consent & Attribution release evidence

- Date: 2026-09-07
- Branch: `feature/consent-attribution-phase-7`
- Base: `84222f3f882ce1367c9849e7e210eb03a8611b56`
- Implementation SHA: `c00784631a532955f3b4606b6a0ba88dbea1c312`
- Environment: Supabase test
- Production activated: **NO**
- Status: partial; remote gates are green, inherited credential remediation remains open

## Delivered scope

- Versioned, independently reviewed `ConsentPolicy` lifecycle.
- Append-only consent/withdrawal evidence and fail-closed server enforcement.
- Signed anonymous identity proof and account-bound reconciliation.
- Privacy-safe idempotent first-party touchpoints integrated with F6 events.
- Versioned first/last-touch windows and frozen reproducible attribution over F6 `Conversion`.
- Versioned self-service APIs and narrow audited administrative APIs/RBAC.
- Client, Professional and Admin Web policy/history/withdrawal/operations surfaces using real APIs.
- Safe counters, correlated evidence and asynchronous outbox context.
- Additive forced-RLS/default-deny migrations and application-first rollback.

## Migration evidence

- `202609070001_consent_attribution`
- `202609070002_consent_attribution_active_uniqueness`
- `202609070003_consent_attribution_evidence_integrity`

All three migrations were applied successfully to the authorized Supabase test database. `prisma migrate status` reported 19 migrations and an up-to-date schema. The third migration independently enforces policy-purpose consistency and blocks missing, mismatched or retroactive touchpoint consent evidence. Clean PostgreSQL replay remains a CI gate and will be recorded here after the remote run.

## Local verification evidence

- Prisma format/validate/generate: passed.
- Backend syntax: 128 JavaScript files passed.
- Complete backend unit/contract regression: 123/123 passed, including 15/15 focused F7 tests.
- Complete PostgreSQL/Supabase integration regression: 13/13 passed.
- F7 Supabase scenario: 1/1 passed, including policy four-eyes review, decision replay, database evidence-integrity rejection, two touchpoints, first/last attribution, cross-account spoof rejection, withdrawal enforcement, RBAC/audit and database immutability.
- Client: TypeScript passed; Jest completed with no test files (`--passWithNoTests`).
- Professional: TypeScript passed; Expo dependency check passed.
- Admin Web: lint, production build and 7/7 tests passed.
- Expo dependency check: Client and Professional dependencies are aligned with Expo 57.
- Dependency audits: root, backend and Admin Web report zero vulnerabilities. Client has 15 moderate and Professional has 13 moderate transitive Expo-toolchain advisories; neither has high/critical findings. The offered fixes require breaking downgrades to Expo 46 or `expo-router` 5 and were deliberately rejected.
- Diff hygiene: `git diff --check` passed; local `.env` files are ignored. Full-history Gitleaks remains the pinned remote CI gate because the binary is not installed locally.

Commands executed include `npm run verify`, `npm run test:integration`, `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npx prisma migrate deploy`, `npx prisma migrate status`, `npx expo install --check`, `npm audit --audit-level=high`, `git diff --check`, ignored-secret checks and a checksum-verified local Gitleaks 8.30.0 scan.

[Platform verification run 34161577954](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34161577954) passed all three jobs: build/unit/contract/client gates, clean PostgreSQL migration/integration replay and secret scan. The preceding run 34160981261 correctly rejected newly introduced non-secret fixture strings; `.gitleaks.toml` now allowlists only those exact fixture/placeholder values.

## Inherited credential finding

A separate full-history local scan found seven inherited findings outside the F7 range: two seed-output test strings and five findings in commit `689d9c59c48ce05607753438f616bbc3562d427c`, which committed `backend/.env`. No values were printed or added to this record. Comparison by variable name/equality only established:

- the current test database URL and Stripe keys no longer match the historical values;
- the Supabase anonymous key still matches but is a client-publishable identifier protected by forced RLS/default-deny;
- the local test `JWT_SECRET` and `CLOUDINARY_API_SECRET` still match the public-history values and must be treated as compromised;
- making the repository private does not revoke credentials that were already exposed.

F7 remains partial even though its remote run is green. Closure requires rotation of the Cloudinary secret and local/test JWT secret, validation with the replacement values, and an owner-approved history remediation or documented revoked-secret baseline. Rewriting shared Git history is intentionally not performed without explicit authorization.

## Activation and legal gate

`CONSENT_ATTRIBUTION_ENABLED` defaults to false. No production policy content, legal basis, document, retention duration or jurisdictional conclusion is approved by this engineering release. Follow [ADR 0002](../adr/0002-consent-attribution-evidence.md), [the architecture contract](../CONSENT_ATTRIBUTION.md) and [the runbook](../runbooks/CONSENT_ATTRIBUTION.md).
