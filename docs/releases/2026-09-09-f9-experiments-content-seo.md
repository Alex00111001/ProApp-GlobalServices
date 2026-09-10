# F9 Experiments, Content and SEO release evidence

## Release identity

- Branch: `feature/experiments-content-seo-phase-9`
- Base F8.5 SHA: `0c1f088c863ca1f058263d8de714bb932953d02b`
- Architecture SHA: `710900f50d6688aff427b691656554f110c26b92`
- Implementation SHA: `a0dda8408a37588242433eab41dbe9685f18c185`
- SEO quality fix SHA: `c111648cb8d3fff41ab7165ba6751dea90c82e70`
- Product surfaces SHA: `396172ca27a6ddc734d7c88205eb8333886b536c`
- Localized publication fix SHA: `898acfaf`
- Security classification SHA: `ebcb330e`
- Documentation/release SHA: pending publication
- Remote Platform verification: pending
- Status: **closure candidate; remote evidence pending**
- Production activation: **NO**
- Market activation: **NO**
- F10 started: **NO**

## Recovered work

The preserved stash `stash@{0}: paused F9 work before F8.5 markets foundation`, created from pre-F8.5 base `dc17780b0d026b422a9917c0bfbc20c0edddcbda`, was inspected by stat and patch before integration. It was not blindly applied or dropped. Useful F9 design and scaffolding were manually adapted to authoritative F8.5 Market/MarketPolicyVersion/geography contracts; no F10, secret, temporary artifact or incompatible F8.5 rollback was imported. The stash remains recoverable until the user explicitly authorizes cleanup.

## Delivered controls

- Versioned, immutable experiment definitions with strict lifecycle, feature/Market/policy activation gates and kill switch.
- HMAC deterministic sticky assignments using F7 pseudonymous identity, server-selected variants and database concurrency uniqueness.
- Explicit consent-bound, ownership-bound and replay-safe exposures, separate from assignment/evaluation.
- Closed bounded audience registry and canonical metric registry; no executable expressions or sensitive targeting.
- Reproducible fixed-horizon result snapshots with versioned alpha, Wilson/Poisson intervals, minimum sample/time gates, guardrails and no automatic winner.
- Typed structured content, locale/Market-policy binding, independently governed localized versions, four-eyes review/publish, durable scheduling, immutable publication and locale-safe retirement.
- Market-aware SSR SEO with safe canonical URLs, robots/noindex quality gates, Open Graph, allowlisted JSON-LD, deterministic sitemap, safe redirects/410 and nonce CSP.
- Real API-only Admin Web and a separate Next.js public web; no permanent mocks or database access from frontends.
- Narrow RBAC, audit/outbox evidence, bounded telemetry, centralized redaction and forced RLS/default deny.
- All F9/worker/public capability flags default false. F3 financial authority and F1-F8.5 boundaries remain unchanged.

## Requirement-to-control-to-evidence matrix

| Requirement | Control | Evidence |
| --- | --- | --- |
| Versioned immutable experiment | version rows, digest, lifecycle and DB triggers | focused lifecycle/migration tests |
| Sticky server assignment | HMAC bucket + `(versionId, subjectKey)` unique | deterministic unit + 8-worker PostgreSQL race |
| Assignment/exposure separation | independent endpoints and records | replay/ownership unit + concurrent DB exposure |
| Consent/Market fail closed | F7 enforcement + F8.5 resolver/current policy | inactive Market and PostgreSQL integration tests |
| Typed audience | closed paths/operators, depth/cardinality limits | injection/limit focused tests |
| Reproducible metrics | canonical events, frozen window/input digest | statistics/result snapshot tests |
| Statistical rigor | versioned alpha, Wilson/Poisson, fixed horizon | alpha-width, sample and no-winner tests |
| Guardrails | versioned guardrail metric/threshold | guardrail-blocked test |
| Governed content | structured schema, four eyes, audit/outbox | XSS and PostgreSQL workflow tests |
| Immutable publication | DB trigger and versioned correction | mutation rejection integration test |
| Localization/hreflang | independent locale workflows and approved-publication alternates | two-locale publish/retire PostgreSQL scenario + public metadata test |
| Programmatic SEO bound | type-specific authoritative refs + default noindex | quality-gate test |
| Crawlable public output | Next server components/metadata/build | public web tests and production build |
| URL/redirect/404/410 | safe relative paths, loop checks, SSR proxy | URL/redirect and public proxy tests |
| Sitemap/structured data | published canonical query, XML escaping, claim allowlist | focused and public rendering tests |
| RBAC/audit | narrow permission catalog + F4 middleware | permission and 401 contract tests |
| RLS/default deny | enabled+forced tables, no policies/grants | migration contract + PostgreSQL checks |
| Rollback/operations | off-by-default flags and application-first runbook | config tests and runbook |

## Local and Supabase test evidence

- Prisma format, validate and generate: passed.
- Migration status: 25 migrations, schema up to date on the configured Supabase test database.
- Backend build/syntax: 167 JavaScript files passed.
- Backend unit/contract regression: 173/173 passed.
- Focused F9 suite: 19/19 passed.
- PostgreSQL/Supabase full integration/concurrency: 20/20 passed.
- Focused F9 PostgreSQL scenario: 3/3 passed (assignment/exposure concurrency, editorial publish/sitemap/immutability, forced RLS).
- Admin Web: lint, 12/12 tests and production build passed.
- Public web: TypeScript, 4/4 tests and Next.js production SSR build passed.
- Client: TypeScript and 1/1 schema-renderer test passed.
- Professional: TypeScript passed.
- Root verification: passed across backend, Admin Web, public web, Client and Professional after the final functional commit.
- Dependency audits: root, backend, Admin Web, public web, Client and Professional each report 0 vulnerabilities.
- Gitleaks 8.24.3/8.30.1 negative controls: exact F8/F9 fixtures allowed; adjacent variants and a generated high-entropy key remain detected by `generic-api-key`.
- Tracked Git tree: 5.76 MB scanned from a `git archive`, no leaks found.
- Full Git history: 115 commits and 299.52 MB scanned, no leaks found.
- Remote CI: pending final gate execution.

## Migration evidence and compatibility

Three additive migrations extend the prior 22-migration baseline to 25. The configured Supabase test database applied all three and reports current schema. The F8.5 migration at `202609090001_markets_identity_geography` remains identical to the published baseline; F9 does not rewrite closed migration history. Clean replay, reviewed-history checksum and baseline compatibility remain mandatory remote gates.

During the first data-rich rehearsal, a previously interrupted F9 test fixture caused an active consent-scope collision; the fixture now uses a unique purpose. A fixed exposure UUID similarly proved the global replay constraint by colliding across runs; it now uses one UUID per execution while preserving concurrent replay inside that execution. These were fixture defects, not weakened constraints.

The first full-history scan correctly classified `EXPERIMENT_ASSIGNMENT_SECRET=replace_with_an_independent_32_character_secret` in `backend/.env.example` as `generic-api-key`. This is an explicit non-secret setup placeholder. The committed Gitleaks configuration allowlists only that exact anchored secret value; it does not exempt the variable, path, rule, commit or similar values. The reproducible negative-control script proves that `replace_with_an_independent_33_character_secret` and a generated high-entropy value are still detected. The full-history scan then passed without reducing its scope.

## Residual activation blockers

- Remote Platform verification must be green before F9 can be marked complete; local tracked-tree and full-history secret scans are already green.
- Production infrastructure, legal/editorial approval, real Market activation, crawler smoke tests, traffic/load/soak and operational ownership are intentionally not activated by F9.
- Statistical inference does not implement sequential testing, SRM diagnosis or automated decisioning; fixed-horizon manual review is the deliberate supported production contract.
- No localized alternate is emitted until another independently approved locale publication exists.
- The preserved pre-F8.5 stash remains until explicit cleanup authorization.

F9 remains PARCIAL until the branch is published and a completely green remote Platform verification is linked here.
