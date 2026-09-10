# F9 Experiments, Content and SEO

- Status: HECHO; verified locally, in the Supabase test environment and by remote Platform verification `34476722673`
- Date: 2026-09-09
- Base: F8.5 `0c1f088c863ca1f058263d8de714bb932953d02b`
- Governing ADR: [ADR 0005](adr/0005-experiments-content-seo.md)
- Production: inactive
- Markets: inactive

## Authority and dependency map

F9 owns experiment configuration/evidence, editorial content versions/publications and SEO projections. It does not own identity, consent, conversion, geography, market policy, money, automation execution or audit infrastructure.

```text
F1 taxonomy/outbox/idempotency ----\
F2 telemetry/correlation -----------+--> Experiment assignment/exposure/results
F6 authoritative marketing events -/
F7 pseudonymous identity/consent ---/

F4 RBAC/audit + F8 automation -------> Editorial workflow/scheduling
F8.5 Market/Policy/locale/geography -> Content eligibility and SEO indexability
F3 ----------------------------------> unchanged financial authority
```

All F9 capabilities are disabled by default. `EXPERIMENTS_CONTENT_SEO_ENABLED` is the parent switch; experiments, publishing and public SEO also require their independent switches. A feature flag, active Market and current reviewed MarketPolicyVersion are additional experiment gates. No migration activates a market or production.

## Experiment model and lifecycle

`Experiment` is the stable definition and owns Market, layer, surface, feature flag, traffic allocation, kill switch and lifecycle. `ExperimentVersion` freezes the policy version, timing, timezone, sample rule, significance alpha and configuration digest. Audience, variants and metric definitions are child records. Assignment, exposure and result snapshots are immutable evidence.

Lifecycle:

```text
DRAFT -> READY -> RUNNING -> PAUSED -> RUNNING
                    |          |
                    +----------+-> COMPLETED -> ARCHIVED
DRAFT/READY/PAUSED ---------------------------> ARCHIVED
```

Activation is server-authoritative, audited and serialized. READY/RUNNING configuration is immutable. RUNNING requires a current active Market policy, a valid enabled feature flag, non-zero traffic and a complete definition. PAUSED, COMPLETED and ARCHIVED set the kill switch. Clients cannot submit a variant or lifecycle result.

## Deterministic assignment and exposure

The trusted F7 subject key is an HMAC pseudonym, never a raw anonymous or user identifier. Assignment computes:

```text
bucket = first_48_bits(HMAC-SHA-256(server_secret,
         experiment_version_id + ":" + pseudonymous_subject)) mod 10000
```

Variant ranges are stable after sorting by key and weights must total exactly 10,000 basis points. Overall traffic allocation is checked independently. The database unique key `(versionId, subjectKey)` provides sticky, concurrency-safe assignment and absorbs races by rereading the authoritative row.

Assignment only evaluates eligibility. Exposure requires a separate explicit call after the surface is consumed/rendered, rechecks subject ownership, running state, surface, kill switch and current consent, and persists a caller-stable UUID event ID. `eventId` is globally unique; replay returns the same exposure and cross-assignment reuse fails. Prefetch and unused assignment do not count.

## Audience registry

The registry permits bounded `all`/`any` trees to depth four and at most twenty nodes. Paths are allowlisted to Market/country/locale, actor/lifecycle, campaign source, feature eligibility and bounded first-party registration/booking activity. Operators are equality, inequality, numeric comparison, membership and boolean checks. Payloads pass the central privacy sanitizer.

There is no `eval`, JavaScript, SQL, arbitrary traversal, regular-expression execution, device fingerprinting or sensitive targeting. Unsupported/inactive Market, stale policy, unsupported locale, invalid audience or missing current consent fails closed.

## Metric and statistical contract

Metrics reference only canonical F1/F6 events plus the closed F8 referral events. Each version has exactly one PRIMARY metric and optional GUARDRAIL metrics. Definition fields are event, aggregation (`UNIQUE_SUBJECT_RATE` or `EVENT_RATE`), exposure-relative window, direction, minimum sample and optional guardrail threshold.

Result snapshots are reproducible for a fixed version/window/input digest. Events must occur after first exposure and inside the configured metric window. Output includes subjects/exposures, conversions, denominator, rate, absolute/relative difference and a two-sided interval. Binomial rates use Wilson intervals; event rates use the documented Poisson normal approximation. The versioned `significanceAlpha` determines the critical value and confidence level. Analysis is fixed-horizon; early stopping is disabled. Results remain `INCONCLUSIVE` until sample/time gates pass, can become `GUARDRAIL_BLOCKED`, and never declare or promote a winner automatically.

Guardrails can use authoritative cancellation, payment failure/refund, operational error/latency, support, professional rejection and abuse/fraud signals only when those events exist in the canonical registry. Growth improvement never overrides a guardrail or performs a financial action.

## Content and editorial governance

`ContentEntry` is the stable key/type/Market identity. `ContentVersion` binds an immutable numbered version to locale and the current MarketPolicyVersion. Each localized version advances through review and publication independently; the entry status is only an aggregate projection and never downgrades an already published locale when another locale becomes a draft. Structured blocks, SEO metadata, optional authoritative Category/Service/AdministrativeDivision references, quality evidence and optional AI provenance are stored together. `ContentApproval` and `ContentPublication` preserve reviewer/publisher evidence.

Lifecycle:

```text
DRAFT -> IN_REVIEW -> APPROVED -> SCHEDULED -> PUBLISHED -> RETIRED
   ^          |
   +----------+ rejected review returns the version for revision
```

Author and approving reviewer must differ; author and publisher must differ. Publishing rechecks approval and the current reviewed Market policy transactionally. Scheduling is PostgreSQL-backed and claimed by conditional updates; no `setTimeout` is used as durable state. Published fields are protected by a database trigger and corrections require a new version. Retiring one locale preserves the aggregate PUBLISHED state while another locale remains live.

Content schemas are closed to landing, category, service, location, help/FAQ, campaign landing and SEO metadata block. Rich content is an allowlisted block array, not arbitrary HTML. Scripts, event handlers, executable URLs, embeds, unsafe metadata, PII and secrets are rejected. AI provenance may record provider/model/version, but generation is only draft provenance: it cannot review, approve or publish. F10 is not started.

## SEO and URL contract

The public application is a separate Next.js server-rendered surface that calls versioned backend APIs only. It never connects to Prisma/Supabase or uses an admin session. HTML, title, description, canonical, robots, Open Graph and allowlisted JSON-LD are present in the server response. A nonce CSP protects framework and JSON-LD scripts.

Canonical paths are lower-case relative paths:

```text
/{marketCode}/{locale}/{contentType}/{slug}
```

Slugs are bounded and segment-safe; paths reject schemes, authorities, traversal, encoded separators, fragments and duplicate separators. Redirects are same-origin 301/308 or an explicit 410 record. The public proxy revalidates internal targets, follows no arbitrary URL and leaves an absent mapping as a normal 404. Redirect creation detects loops and chains deeper than ten.

Indexability defaults to false. It requires an ACTIVE Market, allowed locale, current reviewed MarketPolicyVersion, APPROVED/PUBLISHED immutable content, sufficient summary/body, canonical path and market+locale content-digest uniqueness. Service pages require an active Service, category pages an active Category and location pages an active official AdministrativeDivision. Unknown, disabled, stale or incomplete input stays noindex/unavailable.

Sitemaps are deterministic, capped at 50,000 URLs and include only canonical, unexpired, PUBLISHED and indexable rows for one active Market/locale. XML output is escaped. Structured data types are allowlisted and cannot invent ratings, reviews, offers, price, currency or availability. Localized alternates are emitted only when an independently approved localized publication exists.

Indexable document content, canonical and SEO metadata are never experiment variants. Experiments may affect bounded interaction surfaces after server assignment; crawlers and users receive the same canonical indexable document. This prevents cloaking.

## APIs and RBAC

Public APIs expose server assignment, explicit exposure, approved content, sitemap and safe redirect lookup. Versioned Admin APIs expose experiment definitions/versions/lifecycle/results, content entries/versions/review/publication/retirement and redirects. Collections use server pagination, bounded filters and stable ordering.

| Permission | Scope |
| --- | --- |
| `experiments.read` | definitions and frozen versions |
| `experiments.manage` | draft definitions/versions |
| `experiments.activate` | READY/RUNNING/PAUSED/COMPLETED/ARCHIVED transitions |
| `experiments.results.read` | calculate/read reproducible snapshots |
| `content.read` | editorial projections |
| `content.manage` | entries, drafts and review submission |
| `content.review` | independent decision |
| `content.publish` | schedule/publish/retire |
| `seo.read` | SEO state/redirect visibility |
| `seo.manage` | controlled redirect configuration |
| `seo.publish` | reserved separate publication boundary; not an ADMIN wildcard |

All administrative routes require F4 sessions and a specific permission. Permission denials are deterministic, correlated and audited. Navigation visibility is a usability projection; the backend remains authoritative.

## Observability, privacy and security

Bounded experiment metrics cover definition/version/lifecycle, assignment, exposure and result outcome. Content metrics cover entry/version, review, publication, scheduler, redirect and sitemap. Request, correlation and trace IDs flow into evidence and audit where applicable. No raw identity, content body, PII, secret, URL query, variant payload or user-controlled error is a metric label.

RLS is enabled and forced on every F9 table with no public policy. `PUBLIC`, `anon`, `authenticated` and `service_role` receive no direct table privileges; only the trusted backend role bypasses RLS. Restrictive foreign keys preserve evidence. Running experiment configuration and reviewed content are database-immutable.

Threat controls and tests cover variant/assignment spoofing, exposure replay, invalid/concurrent weights and assignments, audience injection, workflow bypass, four-eyes conflicts, XSS/HTML, structured-data fabrication, version mutation, scheduled publication race, slug/path/canonical poisoning, open redirects/loops, sitemap injection, pagination bounds, inactive Markets, consent withdrawal, PII/secrets and RLS/default deny.

## Migration and deployment

F9 is additive:

- `202609090002_experiments_content_seo`: domain tables, lifecycle/uniqueness checks, indexes, immutable triggers and initial default deny.
- `202609090003_experiments_content_seo_force_rls`: FORCE RLS for all fourteen F9 tables.
- `202609090004_content_deduplication_market_scope`: explicit `ContentVersion.marketId` and market+locale digest uniqueness.

Deploy schema and RBAC first, backend second, Admin/public surfaces third, all with flags false. Run the full replay and integration gates before any activation. The F8.5 migration file remains byte-identical to its published SHA; F9 does not rewrite closed migration history. See the [F9 runbook](runbooks/EXPERIMENTS_CONTENT_SEO.md) for rehearsal, diagnosis and rollback.
