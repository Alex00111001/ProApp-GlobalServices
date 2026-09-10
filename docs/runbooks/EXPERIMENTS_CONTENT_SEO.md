# F9 Experiments, Content and SEO runbook

## Safety boundary

This runbook authorizes isolated test/staging operations only. It does not authorize production, Market activation, crawler indexing, experiment traffic or public content publication. Keep all F9 flags false and all seeded Markets disabled until separate Legal/Privacy/Security/Content/Operations approval.

## Deployment rehearsal

1. Confirm the checkout is the reviewed F9 SHA and the working tree is clean. Preserve any recovery stash; do not drop it as part of deployment.
2. Create a fresh isolated PostgreSQL database. Never use `db push`, reset a shared database or edit an applied migration.
3. Run `npx prisma format`, `validate`, `generate`, then `migrate deploy` from `backend/`.
4. Confirm 25 migrations and `Database schema is up to date`.
5. Run `npm --prefix backend run seed:rbac` and verify the catalog exactly matches the code registry.
6. Run root `npm run verify`, the complete PostgreSQL integration suite and the focused F9 concurrency suite.
7. Verify every F9 table has both `relrowsecurity` and `relforcerowsecurity`, no policy, and no `PUBLIC`/Supabase API-role grant.
8. Run dependency audits for root, backend, Admin Web, Client, Professional and public web. HIGH/CRITICAL is a blocking failure.
9. Run `node scripts/verify-gitleaks-allowlist.cjs <gitleaks-binary>`, scan a `git archive HEAD` extraction for the tracked tree, then run `gitleaks git . --config .gitleaks.toml --redact`. The exact placeholder and adjacent/generated-secret controls must pass, and the full published history must remain in scope. Never scan `node_modules` as a substitute for the tracked tree and never broaden an allowlist to close F9.
10. Deploy application components with `EXPERIMENTS_CONTENT_SEO_ENABLED=false`, `EXPERIMENTS_ENABLED=false`, `CONTENT_PUBLISHING_ENABLED=false`, `PUBLIC_SEO_ENABLED=false` and `CONTENT_WORKER_ENABLED=false`.

## Experiment operations

1. Create DRAFT definition and version through Admin API with a dedicated Market, layer, surface and feature flag.
2. Review audience facts, canonical metrics, guardrails, sample size, alpha, time window and traffic allocation. Verify current consent purpose and Market policy.
3. A principal with `experiments.activate` moves DRAFT to READY. A separate operational decision may move READY to RUNNING only in approved non-production scope.
4. Monitor assignment/exposure/result metrics by bounded labels and correlation/trace IDs. Never inspect raw subject identifiers.
5. On unexpected errors, guardrail deterioration, consent uncertainty or metric integrity drift, move RUNNING to PAUSED. This sets the kill switch immediately.
6. Do not declare a winner from point estimates. Review confidence intervals, sample/time readiness, guardrails, SRM/distribution checks performed externally and operational impact.

## Editorial and publication operations

1. Author creates a typed DRAFT tied to an explicit Market/locale and authoritative references.
2. Submit for review. The author cannot approve or publish.
3. Reviewer checks copy, provenance, locale, claims, structured data, canonical, references and the programmatic SEO quality evidence.
4. Publisher schedules the approved immutable version. The worker is enabled only after deployment gates and reads durable PostgreSQL state.
5. Verify the publication, server HTML, canonical/robots, structured data, sitemap inclusion and redirect behavior in a non-indexable environment.
6. Retire incorrect content; create an explicit safe redirect or 410 mapping where required. Do not mutate the published version.

## Diagnosis

- Assignment absent: verify parent/experiment flags, RUNNING/kill switch, ACTIVE Market, current policy, locale, F7 decision, feature flag, rollout bucket and audience result.
- Duplicate assignment/exposure messages during concurrency: expected P2002 races are absorbed; an externally returned conflict indicates an event ID or stored assignment was reused inconsistently.
- Result `INCONCLUSIVE`: inspect sample size, analysis time, exposures and exposure-relative metric window. Do not bypass the threshold.
- Result `GUARDRAIL_BLOCKED`: pause the experiment and investigate the authoritative operational event; do not promote.
- Page unavailable: verify public flags, ACTIVE Market, current policy, approved immutable publication, locale/path/type and expiry.
- Page is noindex: verify quality length, canonical, content digest, active Service/Category or official Division reference for the applicable type.
- Scheduled content not moving: verify worker flag/process, database readiness and due timestamp. Never replace durable scheduling with an in-process timer.
- Sitemap missing URL: confirm publication status/indexable/canonical/expiry and Market/locale. Sitemap exclusion is fail-closed.
- Any PII/secret in logs or telemetry: disable the affected F9 capability, restrict access, preserve evidence and invoke the security/privacy incident process.

## Non-destructive rollback

1. Pause RUNNING experiments, then set all F9 and worker flags false.
2. Remove public-web traffic or serve the fail-closed noindex/404 surface; do not activate a fallback Market.
3. Restore the previous compatible backend/Admin/public artifacts.
4. Retain Experiment versions, assignments, exposures, snapshots, Content versions/approvals/publications, redirects, sitemap evidence, audit and outbox records.
5. Do not drop F9 tables, delete evidence, modify reviewed content, rewrite migrations or restore a draft over a publication.
6. Diagnose and ship an additive forward fix, then repeat clean migration, RLS, regression, security and remote CI gates before re-enabling.

Rollback does not start F10, activate production or authorize a Market.
