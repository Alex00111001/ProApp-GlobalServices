# F6 Growth Data release evidence

## Classification

- Phase: F6 Growth Data
- Domains: Growth, Analytics, Admin Control Center
- Risk: HIGH (identity/privacy, admin authorization, additive migration)
- Capability: DEEP design/final review; STANDARD implementation
- Environment: Supabase test only; production and advertising providers inactive
- Skills: architecture-guardian, backend-fastapi, database-prisma, admin-operations, frontend, security, testing, release, Notion spec-to-implementation
- Escalated: filesystem writes under the canonical `C:\dev` repository and authorized Supabase-test migration/tests

## Delivered

- Additive Campaign/Lead/Conversion schema and MarketingEvent idempotency, pseudonym, campaign, country and request-context fields.
- Transactional event/lead/conversion/outbox pipeline with replay protection and booking ownership.
- Keyed HMAC pseudonymization plus centralized metadata/PII/payment/coordinate redaction.
- Strict, concurrent-safe campaign lifecycle with audited reasons and outbox evidence.
- Versioned, bounded Growth overview/funnel/campaign/lead/conversion APIs.
- Narrow `marketing.read`/`marketing.manage` RBAC; `ANALYST` access remains denied.
- Real Admin Web Growth surface with loading/error/empty states, campaign management and server-side lead/conversion filters.
- Production-off feature gate and application-first rollback.

## Database

Migration: `202609020002_growth_data`. It is additive, has no DROP/TRUNCATE/data deletion, adds foreign-key/query indexes and unique replay constraints, and enables/forces RLS with default-deny grants on all new tables.

Applied successfully to the configured Supabase test project on 2026-09-02 after the baseline audit passed. RBAC synchronization completed after migration. Production was not modified.

## Verification evidence

- `npx prisma format --schema prisma/schema.prisma`: passed.
- `npx prisma validate --schema prisma/schema.prisma`: passed.
- `npm run prisma:gen`: Prisma Client 7.10.0 generated.
- `npm test` in backend: 107/107 passed.
- `npm run lint`, `npm test`, `npm run build` in Admin Web: passed; 6/6 tests.
- `RUN_DATABASE_INTEGRATION_TESTS=true npm run test:integration`: 12/12 passed against Supabase test, including Growth replay/privacy/RBAC/audit and all prior concurrency, observability and RLS gates.
- Baseline audit: passed (no missing/incompatible baseline tables, columns, enums, indexes or constraints).
- `npm run verify`: passed across backend, Admin Web, customer mobile and professional mobile.
- `npm audit --audit-level=high`: zero high/critical vulnerabilities in all five workspaces (mobile transitive dependency trees retain moderate advisories requiring upstream/breaking changes).
- Gitleaks 8.30.1 scanned the implementation commit with no leaks.
- [Platform verification run 33637424333](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/33637424333): all three jobs passed (build/unit/contract, PostgreSQL migration/integration, secret scan).

## Rollout and rollback

Production defaults to `GROWTH_DATA_ENABLED=false` and additionally requires a unique `GROWTH_PSEUDONYM_SECRET` of at least 32 characters. Production activation is blocked pending explicit authorization and F7 privacy/retention decisions.

Rollback is application-first: disable the flag and restore previous application builds while retaining additive tables, audit and event history. Schema changes use forward fixes; never reset or drop evidence-bearing tables.

## Residual decisions

- Qualified privacy review must define retention, erasure/anonymization and any consent requirements before production activation (F7).
- Campaign association is observational only; causal/multi-touch attribution is deliberately deferred to F7.
- No external advertising adapter, budget or live action exists in F6.

## Publication

- Branch: `feature/growth-data-phase-6`
- Implementation commit: `60d60913c46ac8fc02ff64ca4004defac1fdf58c`
- Remote CI: [33637424333](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/33637424333), passed
