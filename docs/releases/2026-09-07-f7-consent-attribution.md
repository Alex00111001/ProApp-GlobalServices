# F7 Consent & Attribution release evidence

- Date: 2026-09-07
- Security closure: 2026-09-08
- Branch: `feature/consent-attribution-phase-7`
- Rewritten base: `c7a551849dcbec166e45946330493fe75c6f39a9`
- Rewritten implementation SHA: `ea447ba664ddb7f0206af884679b90dd19d0f0d3`
- Environment: Supabase test
- Production activated: **NO**
- Status: closure candidate; history and dependency remediation are locally green, final remote verification is pending

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
- Dependency audits: root, backend, Admin Web, Client and Professional report zero vulnerabilities. The two underlying moderate Expo-toolchain advisories were removed with compatible overrides to patched `decode-uri-component` and CommonJS-compatible `uuid` releases; both mobile applications pass TypeScript, Expo Doctor 21/21 and dependency smoke checks.
- Diff hygiene: `git diff --check` passed; local `.env` files are ignored. A checksum-verified Gitleaks 8.30.0 scan of all rewritten refs reports zero findings.

Commands executed include `npm run verify`, `npm run test:integration`, `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npx prisma migrate deploy`, `npx prisma migrate status`, `npx expo install --check`, `npm audit --audit-level=high`, `git diff --check`, ignored-secret checks and a checksum-verified local Gitleaks 8.30.0 scan.

[Platform verification run 34161577954](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34161577954) passed all three jobs: build/unit/contract/client gates, clean PostgreSQL migration/integration replay and secret scan. The preceding run 34160981261 correctly rejected newly introduced non-secret fixture strings; `.gitleaks.toml` now allowlists only those exact fixture/placeholder values.

## History and credential remediation

Credential rotation was verified by equality checks that never printed values: the test database URL, Stripe keys, JWT secret, Cloudinary key and Cloudinary secret all differ from the exposed revision. The unchanged Supabase anonymous key is intentionally client-publishable and remains constrained by forced RLS/default-deny.

With explicit owner authorization, `git-filter-repo` 2.47.0 rewrote all 135 commits and 55 affected refs. It removed `backend/.env` from every branch and internal PR lineage and also removed the repeated historical seed-password literal identified by Gitleaks. Current application content was preserved: the pre/post rewrite HEAD tree hashes are identical. All 19 published branch heads now match the rewritten map, there are no tags, history/path queries return zero `backend/.env` objects and full-history Gitleaks reports zero findings.

GitHub rejected updates to its 36 read-only `refs/pull/*/head` references as designed. The active branch/tag history is clean, credentials are rotated and the repository has no forks, but GitHub Support must dereference those PR refs and purge cached views/server objects for physical expungement. The required owner action and exact evidence are recorded in [the secret-history purge runbook](../runbooks/GIT_HISTORY_SECRET_PURGE.md). Collaborators must re-clone or carefully rebase; merging an old clone can reintroduce the tainted objects.

## Activation and legal gate

`CONSENT_ATTRIBUTION_ENABLED` defaults to false. No production policy content, legal basis, document, retention duration or jurisdictional conclusion is approved by this engineering release. Follow [ADR 0002](../adr/0002-consent-attribution-evidence.md), [the architecture contract](../CONSENT_ATTRIBUTION.md) and [the runbook](../runbooks/CONSENT_ATTRIBUTION.md).
