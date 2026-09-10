# HomeServices Platform — Implementation Plan

## 1. Purpose and architectural stance

This document records the repository baseline audited on 2026-08-30 and the staged path from the current application to a production marketplace control platform. The target architecture is defined up front; phases sequence delivery and risk, not a disposable MVP. Existing public mobile APIs remain compatible unless a versioned replacement is introduced.

The bounded contexts are: Core Marketplace, Identity and Access, Billing and Revenue, Growth, Communications, Observability and Incidents, Analytics, Configuration and Markets, Admin Control Center, and Automation/AI Operations. PostgreSQL is the system of record. Frontends never access it directly.

Country and operating-market variation follows the canonical server-authoritative architecture and COUNTRY/MARKET VARIATION GATE in [F8.5 Markets, Identity and Geography](MARKETS_IDENTITY_GEOGRAPHY.md). Country is territorial fact; Market is an explicit HomeServices operating configuration and lifecycle. No frontend owns national rules.

## 2. Audited repository baseline

The default branch contains three top-level products:

- `backend/`: CommonJS Node.js API using Express 5, Prisma 7 and PostgreSQL.
- `mobile-client/`: Expo Router/React Native customer application, Expo 52.
- `mobile-professional/`: package/configuration skeleton only; there are no application screens or source modules.

There is no `admin-web/`, monorepo workspace configuration, CI configuration, container definition, deployment manifest, `AGENTS.md`, automated backend test suite, or committed Prisma migration history. Root dependencies are TypeScript tooling only. Backend runtime integrations are Stripe, Cloudinary and PostgreSQL/Supabase. Both mobile manifests declare partially divergent dependency generations; the professional manifest combines Expo 57 with React Native 0.73 and older Expo modules and must be normalized before implementation.

Current platform baseline after the 2026-09-01 F2 closure: Node >=22.13 across workspaces; backend Prisma 7.10 and TypeScript 7; admin React 19/Vite 8/TypeScript 7; both mobile applications on Expo 57.0.18, React Native 0.86.3, React 19.2.3 and TypeScript 6. The customer native projects use Continuous Native Generation from `app.config.js`. Root verification scripts replace the previously unused root TypeScript tooling. See [the F2 release record](releases/2026-09-01-f2-observability.md) for reproducible evidence. The preceding paragraphs remain the historical pre-implementation audit baseline.

The backend has 27 source files and approximately 2,863 lines. It follows route/controller/config folders, but business rules and persistence orchestration mostly live in controllers. Routes exist for authentication, categories, professionals, bookings, uploads, admin, payments, notifications, favorites and reviews.

## 3. Current architecture and reusable capabilities

### API and identity

JWT authentication, password hashing with bcrypt, `CLIENT`/`PROFESSIONAL`/`ADMIN` roles, route authorization and Zod validation for a subset of authentication inputs already exist. The identity tables and middleware can be evolved without replacing current JWT contracts. Admin document review already emits `AdminAuditLog` records and is the seed for a general audit service.

### Marketplace core

The current data model covers users and role profiles, categories, subcategories, services, professional-category membership, availability, bookings, booking line items, payments, earnings, reviews, favorites, documents, certifications, portfolios and notifications. Customer discovery, booking lifecycle, professional approval, reviews and favorites are useful existing flows.

### Payments

Stripe PaymentIntent creation/confirmation, signature verification for one webhook path, cash confirmation and some database transactions exist. Booking amounts use Prisma `Decimal`. These adapters and flows are reusable after business calculations are extracted and idempotency/event persistence are added.

### Customer application

The customer app has authentication, catalogue/search, professional detail, booking, checkout, favorites, notifications, profile and receipt sharing. It uses a central Axios client and secure token storage, which are suitable insertion points for correlation headers, event tracking and version/device context.

## 4. Problems and risks found

### Critical

- No Prisma migrations exist. The schema cannot be safely reproduced, reviewed or advanced in production.
- `JWT_SECRET` falls back to a public placeholder. Production must fail closed.
- A 15% fee/commission is hardcoded in booking creation and conflates customer platform fee with professional economics.
- There is no immutable ledger, refund policy engine, financial idempotency record or webhook inbox. Payment state and aggregate booking fields are insufficient for audit/reconciliation.
- Public API/client contract mismatches exist: registration sends `name` while the API requires `firstName` and `lastName`; booking sends `zipCode` and `scheduledTime` while the API reads `postalCode` and a single datetime; the client uses `PATCH` for notification endpoints declared as `PUT`; favorite toggle has no matching backend route.

### High

- Business logic is concentrated in controllers and repeated error handling uses `console.*`.
- Most mutation payloads have no schema validation. CORS is unrestricted and there is no rate limiting.
- Admin authorization is a single coarse role; sensitive operations are not universally audited.
- Stripe webhook events are not persisted before processing, and retry/dead-letter semantics are absent.
- Financial totals are sometimes converted to JavaScript numbers (`parseFloat`), risking imprecise reporting.
- Booking transitions, payment actions and notification creation are not uniformly transactional or idempotent.
- Health checks cover only API/database and provide no dependency state model.
- No automated backend tests are configured; mobile test scripts default to watch mode.

### Medium

- Two Prisma configuration/client modules exist, increasing configuration drift.
- Documentation still recommends `prisma db push`, contradicting migration-only production requirements.
- Country and currency defaults are fixed to MX/MXN in core records and seed data.
- Professional geography is only coordinates; customer geography is free text. There is no canonical market hierarchy.
- `Document.type/status`, earning status and cancellation actor are untyped strings.
- Upload operations perform provider and database mutations without cleanup/compensation guarantees.
- Seed output reveals known development credentials; production seeding must be explicitly gated.

## 5. Current data model

The present relational graph is:

```text
User ── ClientProfile ── Booking ── BookingService ── Service
  │                         │                          │
  │                         ├── Payment               ├── Category
  │                         ├── Review                └── Subcategory
  │                         └── Notification
  └── ProfessionalProfile ── ProfessionalCategory
              ├── Service
              ├── Availability
              ├── Document / Certification / Portfolio
              └── Earning

AdminAuditLog          SystemSetting
```

`Booking.totalPrice`, `Booking.platformFee`, `Booking.professionalEarnings`, `Payment` and `Earning` are mutable operational projections, not a sufficient accounting source of truth. They remain for compatibility while ledger-backed projections are introduced.

## 6. Target backend structure

Keep Express/CommonJS initially to avoid an unnecessary rewrite. Move domain behavior incrementally behind services and repositories:

```text
backend/src/
  app.js                         # composition without listening
  server.js                      # process lifecycle
  platform/                      # config, db, jobs, HTTP, security
  shared/                        # money, IDs, errors, pagination, events
  modules/
    identity/                    # auth, RBAC, permissions
    marketplace/                 # catalogue, requests, matching, bookings
    billing/                     # pricing, fees, commissions, ledger, refunds
    growth/                      # events, attribution, campaigns, referrals
    communications/             # channel-neutral notifications/providers
    observability/              # logs, errors, traces, incidents, health
    analytics/                  # definitions, projections, aggregates
    configuration/              # policies, markets, flags, approvals
    automation/                 # trigger/condition/action execution
    admin/                       # read models and administrative use cases
```

Routes call application services; services own transactions and policies; provider adapters isolate Stripe, Cloudinary, email, push, SMS and messaging vendors. Domain events are written transactionally to an outbox and processed asynchronously.

## 7. Proposed Prisma evolution

Changes are grouped into additive migrations. Existing columns and enum values are not removed during compatibility phases.

1. **Operational foundation**: `Role`, `Permission`, `RolePermission`, `UserRoleAssignment`; generalized `AuditLog`; `FeatureFlag`, `FeatureFlagRule`; `Country`, `Currency`, `Market`, `MarketConfig`; `IdempotencyRecord`; `OutboxEvent`.
2. **Observability**: `ErrorEvent`, `Incident`, `IncidentEvent`, `IncidentComment`, `ServiceHealthSnapshot`, `IntegrationEvent`/webhook inbox, with indexed request/correlation/trace IDs and timestamps.
3. **Billing**: `PricingPolicy` and version; `FeeRule`, `CommissionRule`; `BookingPolicyAcceptance`; `LedgerAccount`, immutable `LedgerTransaction` and `LedgerEntry`; `Refund`, `RefundDecision`; `Payout`, `Dispute`. Amounts use `Decimal` plus ISO currency; posted entries are never updated or deleted and corrections use reversals.
4. **Growth**: `MarketingEvent`, `Campaign`, `Touchpoint`, `Attribution`, `Conversion`, `Lead`, channel-specific `MarketingConsent` plus history, `ReferralCode`, `Referral`, `ReferralConversion`, `ReferralReward`, experiments/variants/assignment/exposure, audiences, automations and executions.
5. **Analytics/markets**: canonical geography references, daily metric facts/materialized projections, supply-demand snapshots and readiness recommendations.

Every migration must specify indexes for foreign keys, query timestamps and state filters; unique keys protect event ingestion, provider events, ledger posting, refunds, commissions and payouts. Cascades are prohibited on immutable financial/audit history; user erasure is represented by controlled anonymization where legally appropriate.

## 8. Admin web structure

Create `admin-web/` as a TypeScript React application with a server-state query layer and generated/validated API types. A Next.js application is proposed because it supports authenticated administrative routing, server-side session handling and future SEO surfaces, while remaining separate from mobile apps.

```text
admin-web/src/
  app/(auth)/
  app/(control-center)/
    dashboard/ marketplace/ users/ professionals/ bookings/
    revenue/ marketing/ operations/ support/ analytics/ audit/ settings/
  components/ features/ lib/api/ lib/auth/ lib/telemetry/
```

The web application receives short-lived credentials through a secure administrative login/session design, calls only versioned backend APIs, hides navigation by permission for usability, and relies on backend authorization for security.

## 9. Required APIs

- `/api/v1/admin/auth`, `/me`, roles, permissions and session revocation.
- Dashboard summary and time series with explicit metric definitions/timezone/currency.
- Paginated users, professionals, bookings and support case endpoints.
- Revenue transactions, fees, commissions, refunds, payouts, disputes, ledger and reconciliation.
- Policies/configuration with versioning, four-eyes approval for high-impact changes and audit history.
- Growth event ingestion, campaign/attribution, consent, referrals, experiments, audiences and automation.
- Operations errors, incidents, comments, health, integrations, jobs and alerts.
- Analytics marketplace/growth/revenue/professional/operations datasets.
- Feature flags and market configuration with preview/evaluation endpoints.

Current unversioned mobile endpoints remain mounted during migration and delegate to the same application services.

## 10. Migration strategy

1. Baseline the deployed database before applying changes: introspect the target, compare it to the committed schema, archive a schema-only dump and create a reviewed baseline migration without resetting data.
2. Apply additive nullable/default-safe migrations first. Backfill in resumable jobs with metrics, then add constraints in later migrations.
3. Dual-write existing financial projections and the ledger inside one transaction; reconcile before making ledger projections authoritative.
4. Shadow-compute pricing/refund decisions and compare to legacy behavior before feature-flag rollout.
5. Expand/read-new/contract: do not drop legacy columns or enum values until all consumers have migrated and a retention window has elapsed.

## 11. Proposed dependencies

Add only with the phase that needs them:

- `pino` and `pino-http`: structured/redacted logs.
- `helmet`, `express-rate-limit`: baseline HTTP hardening.
- `decimal.js` only if calculations cannot remain entirely in Prisma Decimal/minor units.
- OpenTelemetry API/SDK and exporters: distributed traces and metrics behind adapters.
- `bullmq` plus Redis only after deployment infrastructure confirms managed Redis; otherwise start with a PostgreSQL outbox worker using `FOR UPDATE SKIP LOCKED`.
- Backend test runner (`vitest` or Node test runner) and `supertest`; prefer the Node runner where mocking needs remain modest.
- Admin: Next.js, React, TanStack Query, React Hook Form and Zod. Chart/table libraries are selected after accessibility and bundle review.

No dependency is added merely to represent a domain boundary.

## 12. Compatibility strategy

- Preserve current endpoint paths and response fields; add fields rather than rename them.
- Introduce `/api/v1/admin` and new domain APIs independently.
- Accept documented legacy aliases (`name`, `zipCode`, separate date/time) at the edge, normalize them, and publish one canonical contract.
- Keep `User.role=ADMIN` as a compatibility marker while RBAC assignments become authoritative for admin APIs.
- Keep booking financial columns as projections until reconciliation proves ledger parity.
- Feature flags control every high-impact rollout by environment/market/cohort/percentage.

## 13. Security, privacy and approval controls

Production startup fails if required secrets are absent or placeholders. Apply allowlisted CORS, security headers, request/body limits, rate limits and validation. Error responses expose stable codes and correlation IDs, never stacks. Logs and event metadata use allowlists/redaction for credentials, tokens, card data and personal data.

Marketing consent is per channel, purpose, version and time and is separate from transactional communication. Privileged role changes, global pricing/commission/policy changes, large refunds, payouts and AI recommendations require configurable authorization and approval thresholds. AI never deploys to production or autonomously performs high-impact financial/advertising actions.

## 14. Test strategy

- Unit tests: money/pricing, commission, fee lifecycle, refund decision tables, readiness score, event taxonomy, incident grouping and authorization policies.
- Integration tests against isolated PostgreSQL: transactions, ledger balance/immutability, idempotency races, webhook replay, outbox claiming, migration compatibility and audit writes.
- API contract tests: current mobile flows plus new admin APIs and permission matrix.
- Frontend tests: critical customer/professional/admin journeys and accessible component states.
- Property/invariant tests: debits equal credits, no duplicate posting/refund/payout, refund does not exceed captured amount, conversion requires prior exposure where applicable.
- Security tests: ownership boundaries, privilege escalation, malformed metadata, rate limits and redaction.

CI gates: dependency install from lockfiles, Prisma format/validate/generate, syntax/type checks, unit/integration tests, migration drift check and secret scan.

## 15. Implementation sequence and acceptance gates

### Phase 1 — Foundation

Deliver architecture docs, app/server separation, validated configuration, structured error contract, feature flags, RBAC foundation, event taxonomy and migration baseline workflow.

Acceptance: production fails closed on invalid config; each request has request/correlation/trace IDs; admin permission decisions are tested; event names/metadata are validated; all existing mobile API contract tests pass.

### Phase 2 — Observability

Deliver structured redacted logging, error persistence/grouping, health registry, traces, incidents and audit service.

Acceptance: a request can be followed across logs using correlation IDs; repeated errors group deterministically; health exposes dependency state without secrets; incident lifecycle and audit history are permission protected.

Status: **completed for the F2 observability scope on 2026-09-01**. The implementation, migration, verification and rollback evidence is recorded in [the F2 release record](releases/2026-09-01-f2-observability.md). This closes the observability capability; it does not authorize production activation or waive unrelated product release gates.

### Phase 3 — Financial foundation

Deliver versioned pricing, distinct service/platform/commission calculations, balanced immutable ledger, idempotency, policy acceptance, configurable refunds and webhook inbox/outbox.

Acceptance: all money tests use Decimal/minor units; duplicate calls cannot double-charge/refund/commission/payout; ledger balances and reconciliation pass; legacy projections match; policies are versioned by country.

### Phase 4 — Admin foundation

Deliver independent authenticated `admin-web`, RBAC navigation/API enforcement, dashboard, users, professionals, bookings and audit.

Acceptance: no direct DB access; unauthorized permissions receive 403; sensitive mutations audit actor/context/before/after; dashboard metrics have definitions and freshness markers.

Status: **completed in the Supabase test environment on 2026-09-01**. Architecture, security, migrations, verification and activation/rollback evidence are recorded in [the F4 release record](releases/2026-09-01-f4-admin-foundation.md). Production remains unactivated and role mutations remain disabled by default.

### Phase 5 — Operations control

Deliver the versioned administrative plane for errors, incidents, health, jobs, integrations, alerts, financial monitoring and support cases.

Acceptance: dedicated admin sessions and narrow permissions protect every endpoint; lists are bounded and redact provider/worker payloads; incident and support lifecycles are strict, concurrent-safe and auditable; health degradation and financial attention are actionable without executing money; runbooks and rollback preserve evidence.

Status: **complete in Supabase test on 2026-09-02**. Implementation commit `78536bd` and [Platform verification run 33612091154](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/33612091154) passed all build, unit/contract, PostgreSQL migration/integration and secret-scan jobs. See [the F5 release record](releases/2026-09-02-f5-operations-control.md). Production remains inactive and dead-letter replay is deliberately unavailable pending its own idempotency/approval contract.

### Phase 6 — Growth data

Deliver reliable first-party growth event ingestion, campaign records and lifecycle, pseudonymous leads, idempotent conversion projections, reproducible acquisition funnels and the versioned administrative Growth surface.

Acceptance: repeated client event keys cannot duplicate events/leads/conversions; submitted identity cannot override authenticated identity; administrative responses and telemetry omit raw anonymous identifiers and PII; campaign transitions are strict and audited; funnels report event counts and unique subjects with explicit definitions, range, timezone, freshness and partial-data state; `marketing.read` and `marketing.manage` are enforced independently; PostgreSQL/Supabase integration, migration RLS/default-deny, Admin Web, regression, secret scan and CI pass. Production and external advertising providers remain inactive.

Scope boundary: F6 records observational campaign association only. Channel consent, touchpoints and causal/multi-touch attribution remain F7; referrals/automation remain F8; experiments/content/SEO remain F9. Growth never duplicates Billing as a financial source of truth.

Implementation slices:

1. Additive `Campaign`, `Lead` and `Conversion` persistence plus compatible `MarketingEvent` idempotency, pseudonymous subject and correlation fields.
2. Transactional ingestion/projection with bounded validation, trusted identity, campaign association, outbox context and duplicate protection.
3. Versioned Growth APIs and read models for overview, funnel, campaigns, leads and conversions with narrow RBAC and audit evidence.
4. Real Admin Web Growth experience with loading/error/empty states and no simulated data.
5. Migration/test environment, unit/integration/contract/security gates, documentation, runbook, release record and remote CI closure.

Status: **completed in Supabase test on 2026-09-02**. Implementation commit `60d6091` passed [Platform verification run 33637424333](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/33637424333), including build/unit/contract, PostgreSQL migration/integration and secret-scan jobs. See [the F6 release record](releases/2026-09-02-f6-growth-data.md). Production, privacy-dependent collection and external advertising remain inactive.

### Phase 7 — Consent and attribution

Deliver versioned and reviewed consent policies, immutable purpose-specific decision history, immediate withdrawal enforcement, first-party privacy-safe touchpoints, proof-bound anonymous identity reconciliation, immutable versioned first/last-touch attribution and complete self-service/administrative surfaces.

Acceptance: the server fails closed for missing, stale, denied or withdrawn consent; clients cannot forge policy or identity evidence; touchpoints persist no raw anonymous identifiers, personal/payment data or secret URL components; retries cannot duplicate evidence; attribution is reproducible for a conversion/model version and never invents revenue; dedicated RBAC, audit, RLS, telemetry, PostgreSQL/Supabase integration, client/admin verification and remote CI all pass. Production remains disabled pending explicit release approval and qualified legal review.

The durable data, identity, privacy, legal-review and rollback boundaries are defined in [ADR 0002](adr/0002-consent-attribution-evidence.md). Existing registration acceptance columns remain compatibility projections and are not backfilled as immutable consent evidence.

Implementation slices:

1. Additive policy, decision, subject-link, touchpoint, model and attribution persistence with immutability, constraints and forced RLS.
2. Fail-closed consent/withdrawal and signed identity-proof services with safe observability and audit/outbox evidence.
3. First-party touchpoint ingestion and deterministic attribution integrated with F6 events and conversions without changing financial facts.
4. Versioned self-service and administrative APIs with narrow RBAC, pagination and sensitive-read audit.
5. Real Client, Professional and Admin Web experiences with independent purposes and no contractual gating by marketing consent.
6. Migration rehearsal, unit/integration/security/regression gates, runbooks, release evidence, remote publication and CI closure.

Status: **completed in the Supabase test environment on 2026-09-08**. Implementation, clean PostgreSQL replay, client/admin verification and full-history secret scanning are green in [post-rewrite verification run 34198550969](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34198550969). Exposed test credentials were rotated, `backend/.env` and the historical seed-password literal were removed from all 19 published branch histories, and all five npm audit surfaces report zero vulnerabilities. GitHub Support purge of 36 read-only PR refs/cached views remains an administrative residual documented in the [secret-history purge runbook](runbooks/GIT_HISTORY_SECRET_PURGE.md); it does not authorize production activation. Production remains prohibited and F8 has not started.

### Phase 8 — Referrals and automation

Status: **closure candidate verified locally/Supabase test on 2026-09-08; final release-record CI pending**. Platform verification `34221356002` passed build/unit/contract and PostgreSQL integration but classified the exact non-secret fixture `claim-revoked-1` as `generic-api-key`. The rule-specific, secret-targeted exact exception and negative-control procedure closed that false positive without weakening `generic-api-key`; [replacement run 34256942669](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34256942669) passed build/unit/contract, clean PostgreSQL migrations/integration and Secret Scan. Production remained inactive and F9 had not started at that F8 closure; the current F9 status is recorded below.

F8 adds versioned referral programs/codes/claims/conversions/rewards and a PostgreSQL-backed versioned trigger/condition/action engine. Referral conversion consumes authoritative events; F3 remains the sole financial authority and reward fulfillment is disabled. Automation uses independent outbox fan-out, database leases, closed registries, exactly-once-effect keys, bounded retry/dead-letter and current F7 consent enforcement. Client, Professional, Admin Web, narrow RBAC/audit, Operations visibility, telemetry and forced RLS/default deny are included.

See [F8 architecture](REFERRALS_AUTOMATION.md), [ADR 0003](adr/0003-referrals-durable-automation.md), [the runbook](runbooks/REFERRALS_AUTOMATION.md) and [release evidence](releases/2026-09-08-f8-referrals-automation.md). Production remains inactive and F9 has not started.

### Phase 8.5 — Markets, identity and geography

Status: **completed in the isolated test environment on 2026-09-09** from F8 SHA `dc17780b0d026b422a9917c0bfbc20c0edddcbda`. [Platform verification 34359300711](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34359300711) passed build/unit/contract, five dependency audits, clean PostgreSQL 17 migrations/integration and full-history Secret Scan. F9 is **PAUSED — dependency-ready after F8.5**; its recoverable working material remains preserved and requires a new explicit instruction to resume. Production remains inactive.

F8.5 separates Country from operating Market; adds versioned server-authoritative MarketPolicy; closed ES/BR/CL identity adapters; protected identity evidence; normalized, hierarchical and officially sourced geography; Address distinct from ProfessionalServiceArea; declarative Registration Schema; narrow RBAC/RLS/audit/telemetry; and dynamic Client, Professional, and Admin consumers. It preserves F3 as financial authority, F7 as consent/legal-evidence authority, and F8 lifecycle/idempotency/automation boundaries.

The full acceptance gate is recorded in [the F8.5 architecture](MARKETS_IDENTITY_GEOGRAPHY.md), [ADR 0004](adr/0004-market-identity-geography.md), [the runbook](runbooks/MARKETS_IDENTITY_GEOGRAPHY.md), and [the release evidence](releases/2026-09-09-f8-5-markets-identity-geography.md). Initial ES/BR/CL records remain disabled; architecture/data readiness never activates a market.

### Phase 9 — Experiments, content and SEO

Status: **HECHO; verified locally, on the configured Supabase test environment and by Platform verification `34476722673` on 2026-09-10**. F9 was resumed explicitly from F8.5 SHA `0c1f088c863ca1f058263d8de714bb932953d02b`. The earlier F9 stash was inspected and remains preserved; valid work was adapted manually to the final Market/Policy/geography authority rather than applied blindly.

F9 provides immutable versioned experiments; deterministic HMAC sticky assignment; explicit idempotent exposure; closed audiences and canonical metrics; fixed-horizon versioned-alpha results and guardrails; typed versioned content with four-eyes editorial governance and durable publication; and a separate server-rendered market-aware SEO surface with canonical/noindex quality gates, structured data, sitemap, safe redirects/410 and nonce CSP. Narrow RBAC, audit/outbox, telemetry, privacy boundaries, additive migrations and forced RLS/default deny cover every new domain table. All F9 flags, production and Markets remain inactive.

Evidence includes backend 173/173, focused F9 19/19, PostgreSQL/Supabase integration 20/20, focused F9 DB 3/3, Admin Web 12/12 plus lint/build, public web 4/4 plus production SSR build, and green Client/Professional verification. Root verification is green. Dependency audits report zero vulnerabilities on all six package surfaces; tracked-tree and 117-commit full-history Gitleaks scans are green, with exact-placeholder negative controls preserving `generic-api-key`. [Platform verification `34476722673`](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34476722673) passed all three jobs, including clean PostgreSQL migration replay, RBAC synchronization, integration/concurrency and full-history Secret Scan. Production and Markets remain inactive; F10 has not started. See [F9 architecture](EXPERIMENTS_CONTENT_SEO.md), [ADR 0005](adr/0005-experiments-content-seo.md), [the runbook](runbooks/EXPERIMENTS_CONTENT_SEO.md) and [release evidence](releases/2026-09-09-f9-experiments-content-seo.md).

### Phase 10

Dependency order remains `F8 -> F8.5 -> F9 -> F10`. F10 is blocked and has not started. It requires a new explicit instruction only after F9 remote closure. Each phase requires domain tests, migration rollback/forward procedures, telemetry, runbooks and feature-flagged rollout before expansion.

## 16. Immediate delivery slices

1. Correlation/request context, structured errors, validated configuration and app/server separation.
2. Backend test harness and compatibility tests for existing customer flows; fix contract mismatches without breaking accepted payloads.
3. Add the first reviewed Prisma foundation migration (RBAC, feature flags, idempotency/outbox, generalized audit) only after database baseline confirmation.
4. Implement RBAC services/middleware and migrate current admin routes behind permissions.
5. Introduce event taxonomy and transactional outbox; instrument signup/request/booking/payment/job/review milestones.
6. Begin observability persistence and health registry.

## 17. Global definition of done

A capability is complete only when its schema migration, domain logic, API authorization/validation, audit/telemetry, automated tests, documentation, operational runbook and feature-flag/rollback strategy are present. Financial work additionally requires idempotency, transaction boundaries, reconciliation and immutable correction entries. Legal policy content remains placeholder/configuration pending qualified review; the platform records exactly which version, country, language and acceptance timestamp applied.
