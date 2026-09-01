# HomeServices Platform — Implementation Plan

## 1. Purpose and architectural stance

This document records the repository baseline audited on 2026-08-30 and the staged path from the current application to a production marketplace control platform. The target architecture is defined up front; phases sequence delivery and risk, not a disposable MVP. Existing public mobile APIs remain compatible unless a versioned replacement is introduced.

The bounded contexts are: Core Marketplace, Identity and Access, Billing and Revenue, Growth, Communications, Observability and Incidents, Analytics, Configuration and Markets, Admin Control Center, and Automation/AI Operations. PostgreSQL is the system of record. Frontends never access it directly.

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

### Phases 5–10

Build operations control, growth data, consent/attribution, referrals/automation, experiments/content/SEO, supply-demand/readiness and guarded AI operations in that order. Each phase requires domain tests, migration rollback/forward procedures, telemetry, runbooks and feature-flagged rollout before expansion.

## 16. Immediate delivery slices

1. Correlation/request context, structured errors, validated configuration and app/server separation.
2. Backend test harness and compatibility tests for existing customer flows; fix contract mismatches without breaking accepted payloads.
3. Add the first reviewed Prisma foundation migration (RBAC, feature flags, idempotency/outbox, generalized audit) only after database baseline confirmation.
4. Implement RBAC services/middleware and migrate current admin routes behind permissions.
5. Introduce event taxonomy and transactional outbox; instrument signup/request/booking/payment/job/review milestones.
6. Begin observability persistence and health registry.

## 17. Global definition of done

A capability is complete only when its schema migration, domain logic, API authorization/validation, audit/telemetry, automated tests, documentation, operational runbook and feature-flag/rollback strategy are present. Financial work additionally requires idempotency, transaction boundaries, reconciliation and immutable correction entries. Legal policy content remains placeholder/configuration pending qualified review; the platform records exactly which version, country, language and acceptance timestamp applied.
