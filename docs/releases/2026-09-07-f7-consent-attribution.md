# F7 Consent & Attribution release evidence

- Date: 2026-09-07
- Branch: `feature/consent-attribution-phase-7`
- Base: `84222f3f882ce1367c9849e7e210eb03a8611b56`
- Implementation SHA: `c00784631a532955f3b4606b6a0ba88dbea1c312`
- Environment: Supabase test
- Production activated: **NO**
- Status: in progress until remote GitHub Actions is completely green

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

Commands executed include `npm run verify`, `npm run test:integration`, `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npx prisma migrate deploy`, `npx prisma migrate status`, `npx expo install --check`, `npm audit --audit-level=high`, `git diff --check` and ignored-secret checks. The remote clean-database replay, full-history Gitleaks result, run URL and final documentation SHA remain pending. This record must not be changed to complete before every remote job passes.

## Activation and legal gate

`CONSENT_ATTRIBUTION_ENABLED` defaults to false. No production policy content, legal basis, document, retention duration or jurisdictional conclusion is approved by this engineering release. Follow [ADR 0002](../adr/0002-consent-attribution-evidence.md), [the architecture contract](../CONSENT_ATTRIBUTION.md) and [the runbook](../runbooks/CONSENT_ATTRIBUTION.md).
