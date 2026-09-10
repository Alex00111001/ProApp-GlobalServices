# ADR 0005 — Versioned experiments, editorial content and market-aware SEO

- Status: Accepted for F9 implementation
- Date: 2026-09-09
- Base: F8.5 closure `0c1f088c863ca1f058263d8de714bb932953d02b`
- Owners: Platform, Growth, Content, Privacy, Security and Markets
- Production and market activation: Not authorized

## Context

F9 adds deterministic product experiments, governed editorial content and indexable public pages. F1-F8 own authoritative domain events, pseudonymous identity/consent, administrative RBAC/audit, durable automation, observability and PostgreSQL persistence. F8.5 now owns Country, operating Market, effective MarketPolicyVersion, locale policy and official geography. F9 must consume all of those boundaries instead of creating parallel identities, analytics, country strings, location taxonomies or workflow engines.

The repository has customer/professional mobile clients and an administrative React/Vite application, but no public web runtime. Moving Admin Web to another framework would mix an unrelated privileged-surface migration into F9.

## Architecture map

```text
mobile/public-web consumer
  -> versioned experiment evaluation API
     -> trusted F7 pseudonymous subject + current consent
     -> active F8.5 Market + effective MarketPolicyVersion
     -> typed audience evaluator
     -> PostgreSQL assignment/exposure evidence
     -> F1/F6/F8 authoritative events for outcome metrics

Admin Web
  -> /api/v1/admin/experiments|content|seo
     -> narrow permissions + audit
     -> F9 application services
     -> PostgreSQL system of record

Public Web (Next.js App Router, server components)
  -> safe backend public-content API only
     -> active Market/policy + official geography
     -> immutable approved ContentVersion/ContentPublication
     -> canonical/indexability/redirect policy
  -> server-rendered HTML, metadata, robots, structured data and sitemap

F8 automation
  -> closed F9 actions only
     -> create editorial review task or schedule an already approved version
     -> never approve or publish arbitrary content
```

## Experiments decision

`Experiment` owns lifecycle, Market, layer/surface conflict scope, feature dependency, traffic ceiling, kill switch and optimistic row version. `ExperimentVersion` freezes the exact effective MarketPolicyVersion, audience, timing, statistical policy and configuration digest. `ExperimentVariant`, `ExperimentMetricDefinition` and `ExperimentAudience` are immutable after READY. Changes require a new version.

Lifecycle is `DRAFT -> READY -> RUNNING -> PAUSED|COMPLETED`, `PAUSED -> RUNNING|COMPLETED`, `COMPLETED -> ARCHIVED`, and `DRAFT|READY|PAUSED -> ARCHIVED`. Activation is server-side, requires `experiments.activate`, enabled F9 and experiment feature flags, an ACTIVE Market, a current ACTIVE reviewed MarketPolicyVersion and no RUNNING conflict in the same Market/layer/surface.

Assignment uses HMAC-SHA-256 over `experimentVersionId:subjectKey` with an independent server secret. The first 48 digest bits select a stable 0-9,999 bucket. Variant ranges are deterministic, weights total exactly 10,000 basis points and overall traffic is independently bounded. A database unique key on version and pseudonymous subject makes assignment sticky and concurrency-safe. Clients never submit a variant.

Assignment is not exposure. Exposure is written only by an explicit render/consume endpoint after resolving the persisted assignment. A caller-supplied stable event ID is idempotent and cannot be reused across assignments or versions.

Audiences use a closed, bounded AND/OR registry. Facts are limited to Market, country when legally relevant, locale, actor type, lifecycle status, campaign/source, feature eligibility and bounded first-party activity. Market-dependent facts are resolved from the versioned F8.5 policy. There is no JavaScript, SQL, regex execution, arbitrary property traversal, fingerprinting or sensitive targeting.

Metrics reference canonical F1/F6/F8 event names. Result snapshots store frozen inputs, sample/exposure/conversion counts, rates, absolute/relative differences, two-sided Wilson confidence intervals, configured alpha, guardrail outcomes and a canonical digest. Results below sample/time gates are `INCONCLUSIVE`; F9 never auto-promotes a winner and does not implement silent optional stopping.

## Content decision

`ContentEntry` is the stable editorial identity and content type. `ContentVersion` is immutable after review submission and binds locale, Market, effective MarketPolicyVersion and optional official AdministrativeDivision. Localized versions have independent review/publication lifecycles while `ContentEntry.status` remains an aggregate projection, so a new locale draft cannot mutate or retire a live locale. `ContentApproval` records review evidence and separation of duties. `ContentPublication` points to one approved immutable version and owns schedule/publish/retire evidence. `SeoRedirect` records controlled same-origin redirects.

Content types are closed: landing, category, service, location, help/FAQ, campaign landing and SEO metadata block. Stored rich text is sanitized structured blocks; scripts, event handlers, raw executable HTML, unsafe URLs and arbitrary embeds are rejected. AI provider/model/version provenance may be recorded, but AI output remains a draft and cannot approve or publish itself. F10 is not started.

Lifecycle is `DRAFT -> IN_REVIEW -> APPROVED -> SCHEDULED|PUBLISHED -> RETIRED`. Rejection returns the version to DRAFT for revision while its decision evidence remains append-only. Creator and approver differ. Publishing re-resolves the current reviewed Market policy and revalidates locale, official geography, service/category references, schema, approval, canonical, indexability and quality inside the transaction.

## SEO and public rendering decision

`public-web/` is a separate Next.js 16 App Router application using React 19. It never accesses PostgreSQL, Supabase or admin sessions. Server components fetch only versioned safe public backend contracts. Metadata and content render on the server so the initial response is crawlable.

Canonical URLs use `/{marketCode}/{locale}/{type}/{slug}` with normalized lower-case path segments and no internal IDs. Location pages require an ACTIVE official division before they can become indexable; arbitrary free-text geography is never authoritative. A published slug rename uses an explicit same-origin relative redirect. Redirect targets cannot include a scheme, authority, credentials, traversal, fragment, secret-bearing query or a loop. Missing content returns 404; an explicit retirement mapping returns 410 unless an approved redirect exists.

Only current PUBLISHED, canonical, indexable, unexpired publications in an ACTIVE Market/current MarketPolicyVersion enter sitemap output. Localized alternates are emitted only for separately published versions. Programmatic pages default to `noindex`; indexability requires an active Market, allowed locale, real active service/category where applicable, ACTIVE official geography where applicable, minimum unique content, canonical ownership and content-digest uniqueness. Structured data is allowlisted by content type and cannot synthesize reviews, ratings, prices or availability.

Experiments never alter canonical URLs, metadata or crawler-visible indexable document content. Indexable pages render the canonical control publication. User experiments may affect bounded non-indexable interaction components after server assignment/exposure; this prevents cloaking.

## Security, privacy and operations

Experiments reuse F7 trusted pseudonymous subjects and current consent. No raw anonymous ID, contact/address/payment data, identity document or sensitive targeting attribute is stored. Logs/metrics use bounded labels and carry request, correlation and trace IDs.

All F9 tables use additive restrictive foreign keys, RLS enabled and forced, no public policies and no grants to Supabase API roles. Production defaults remain disabled: `EXPERIMENTS_ENABLED`, `CONTENT_PUBLISHING_ENABLED` and `PUBLIC_SEO_ENABLED`.

F8 receives only `CREATE_CONTENT_REVIEW_TASK` and `SCHEDULE_APPROVED_CONTENT`. Scheduling can target only an already approved version and never grants approval, constructs arbitrary URLs or bypasses publication validation.

## Rejected alternatives

- Frontend-only or random-per-request A/B assignment: non-sticky, spoofable and irreproducible.
- Free-text market/country/location fields: violates F8.5 authority.
- Raw identities or sensitive audiences: violates F7/F8.5 privacy boundaries.
- Arbitrary expressions, SQL, HTML or redirects: code execution, XSS, SSRF/open-redirect and nondeterminism risk.
- Reusing Admin Web as the public SEO runtime: couples privileged sessions to a public attack surface.
- Client-only metadata or automatic AI/automation publication: fails crawlability and editorial governance.

## Rollout and rollback

Deploy additive schema/RBAC first, then backend, public web and Admin Web with all F9 flags disabled. Rehearse deterministic assignment, publication, sitemap, Market fail-closed behavior and forced RLS in isolated PostgreSQL/Supabase-compatible roles. Market activation remains a separate prohibited action.

Rollback is application-first: disable F9 flags and retain experiment, editorial, publication, audit and outbox evidence. Never drop populated F9 tables, mutate historical versions or fall back from a published version to a draft.
