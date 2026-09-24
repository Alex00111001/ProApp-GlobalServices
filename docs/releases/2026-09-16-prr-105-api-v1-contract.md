# PRR-105 — Verifiable API v1 contract

- Status: PARCIAL; no production-readiness claim.
- Branch: `feature/production-control-plane-phase-11`
- Authorized continuation base SHA: `620733a6385f10b0c77e269e087322e6eea8da0c` (platform verification #65 / run `35469532696`: SUCCESS).
- Phase/domain: PRR-105, API transport contracts and four supported consumers.
- Risk/tier: HIGH / DEEP for public compatibility, authentication and financial contract review.
- Migration: NONE.
- Skills: architecture-guardian, backend-fastapi, security, testing, release; payments for financial contract review.
- Required design/final-review model: `gpt-5.6-sol`; isolated deterministic generation is eligible for Terra only after the design is established. Execution model is operator-selected for this session; this runner does not switch the current model.
- Escalation: ambiguity in supported public behavior, unrepresentable runtime validation, missing financial idempotency, unsafe output, or two substantive verification failures.
- Acceptance: deterministic generated OpenAPI; exhaustive route classification; runtime/request/response/error/auth/pagination parity; actual old/new consumer compatibility; protected baseline and breaking-change CI; full regression and exact-SHA CI.

## Authority and scope

Zod schemas and the mounted Express route/middleware graph are the existing runtime authorities. There is no existing OpenAPI document. Output projections and consumer assumptions currently live in separate JavaScript/TypeScript code; they must be audited before any response schema is claimed complete. Zod transforms and cross-field refinements cannot silently become permissive JSON Schema.

The approved user prompt authorizes PRR-105 only. PRR-106, other waves, F11 runtime, production, Markets and CASH remain outside this delivery. New financial defects must remain explicit blockers rather than being given undocumented guarantees in OpenAPI.

## Findings under verification

- Legacy normalization retains `name`, `zipCode` and `scheduledTime` after deriving canonical fields; strict runtime schemas reject these supported old requests.
- Both mobile consumers issue bodyless cancellation/rejection; the PRR-104 schemas currently require an object even when reason is optional.
- Payment-intent preparation writes `PROCESSING` after an earlier unlocked read. A competing successful payment capture can be overwritten; reproduction and domain impact remain under review.

## Evidence and closure

Implementation, remote CI, consumer coverage and remaining gaps will be recorded only after execution. Missing evidence keeps PRR-105 PARCIAL. No tracker may mark it HECHO on the basis of this record alone.

## Partial implementation, 2026-09-17

Legacy alias consumption and optional body handling are corrected with runtime-validator regression tests. A deterministic source inventory, structural JSON Schema checks, route-stack comparison, four-consumer path/method observations and breaking-change detector unit tests exist. The inventory is explicitly NOT an approved OpenAPI publication. Output schemas and full consumer compatibility remain unproven. The CI stale-inventory check and isolated PostgreSQL financial acceptance are added without weakening any existing gate.

GitHub CLI authentication check failed: the existing account credential is invalid. No token value was printed. Remote exact-SHA CI cannot be credited from the historical baseline. The financial race is currently a source finding with an acceptance test, not yet a PostgreSQL-confirmed result.

Partial implementation commits:

- Legacy compatibility: `6b0a207e`.
- Deterministic source inventory: `573e5af6`.
- CI/invariant acceptance: `dbe0aa75`.

Local evidence on 2026-09-19:

- `npm run verify`: PASS (backend 274/274; Admin 15/15 plus production build; Public Web 4/4 plus production build; Customer 5/5 plus typecheck; Professional typecheck).
- `npm --prefix backend run api:inventory:check`: PASS and deterministic.
- Prisma format check, validate and generate: PASS. Migration: NONE.
- All six npm audit scopes: 0 vulnerabilities, including 0 HIGH/CRITICAL.
- Repository secret-shaped fixture/artifact hygiene guard: PASS.
- Route inventory: 251 operations: 29 CANONICAL_V1, 51 LEGACY_SUPPORTED, 163 ADMIN, 6 INTERNAL, 1 WEBHOOK, 1 DEPRECATED, 0 REMOVAL_CANDIDATE.
- Consumer inventory: 139 calls; 9 dynamic calls unresolved. Schema bindings: 329; wire parity unproven for 242.
- Platform verification #62 / run `35468639125` for exact SHA `9cd4c8e839988a29f53dc8370372fc318b65db23`: EXPECTED BLOCKING FAILURE. Quality PASS; full-history secret scan PASS; migration replay, RBAC and prior PostgreSQL integration gates PASS; the new financial acceptance gate FAILS.
- Confirmed financial invariant breach: `statusAfterIntent=PROCESSING` (expected `COMPLETED`), `replayDuplicate=false` (expected `true`) and `completionEvents=2` (expected `1`). This is real PostgreSQL/application-service evidence with external Stripe I/O replaced; no live charge occurred.
- Exact-SHA SUCCESS: NONE. The failure is acceptance evidence and must remain blocking. Fixing this financial race is outside this PRR-105 contract-publication slice and requires a separately reviewed DEEP payments change.

## Financial blocker resolution, 2026-09-19

- Authorized DEEP payments fix: `7d91469bc3021cbeb029798c749e9ccc6665b584`.
- The intent-preparation write is now conditional on payment status not being `COMPLETED`; a concurrent first-row creation resolves through the unique booking payment and preserves a completed winner.
- The API returns the existing stable `409` already-paid response when capture wins the race. No provider charge, production configuration or migration was executed.
- Local `npm run verify`: PASS (backend 277/277, Admin 15/15 and build, Public Web 4/4 and build, Customer 5/5 and typecheck, Professional typecheck).
- Platform verification #64 / run `35469399339`: SUCCESS for exact implementation SHA `7d91469bc3021cbeb029798c749e9ccc6665b584`, including PostgreSQL clean migration replay, RBAC synchronization, integration/concurrency acceptance, quality and full-history secret scan.
- The financial blocker is CLOSED. PRR-105 remains PARCIAL for the separately listed OpenAPI/runtime/consumer parity gaps; this payment fix does not imply API-contract closure.

OpenAPI version: NOT PUBLISHED. Closure SHA: NONE. Production activated: NO. Markets activated: NO. CASH active: NO. F11 runtime started: NO. Missing acceptance evidence keeps this work open.

## Contract projection tranche, 2026-09-20

This tranche closes deterministic route discovery and path/method matching without misrepresenting source inspection as full wire compatibility.

- Four-consumer path/method resolution: commit `4d94d5a9`; 144 observed calls across Customer, Professional, Admin and Public Web, 0 unresolved. CI now rejects every status other than `PATH_METHOD_MATCH`.
- Protected source-inventory baseline: commit `86e0445b`; 251 mounted operations, 0 detected breaking changes against `docs/api/route-inventory.baseline.v1.json`. This gate covers endpoint, auth/middleware, status, request required/type/enum narrowing and observed output-field removal. It is not a substitute for complete OpenAPI breaking analysis.
- Deterministic OpenAPI 3.1 candidate: commit `68833ad0`; 215 paths and 245 operations. It excludes INTERNAL and REMOVAL_CANDIDATE routes, validates with Swagger Parser and is marked `CANDIDATE_NOT_PUBLISHED` / `1.0.0-candidate`.
- Candidate completeness counters: 0 unresolved consumer calls, 242 unproven wire-input schemas and 239 operations without complete runtime-authoritative response schemas.
- The candidate must not be used as a production client-generation authority. Response shapes currently reflect safely observed fields and remain explicitly marked pending runtime output-schema parity.

Local evidence on 2026-09-20:

- `npm run verify`: PASS (backend 278/278; Admin 15/15 plus production build; Public Web 4/4 plus production build; Customer 5/5 plus typecheck; Professional typecheck).
- `npm --prefix backend run api:inventory:check`, `api:breaking:check` and `api:openapi:check`: PASS as part of the full verification.
- Prisma format check, validate and generate: PASS. Migration: NONE.
- All six npm audit scopes: 0 vulnerabilities.
- Repository fixture/artifact hygiene, generated-artifact freshness and secret-history gates: locally applicable checks PASS.
- Admin build retains a non-blocking warning for one minified JavaScript chunk above 500 kB; build succeeds.

PRR-105 remains **PARCIAL**. Publication requires shared runtime-authoritative response schemas for the 239 incomplete operations, deliberate resolution of 242 non-equivalent input projections (normalization, transforms and refinements), request/response/enum/pagination/auth semantic parity for the four consumers, a complete OpenAPI breaking baseline, and SUCCESS CI for the final exact evidence SHA. OpenAPI version: NOT PUBLISHED. Closure SHA: NONE.

## Public-content response-authority tranche, 2026-09-23

- Implementation SHA: `25969c38623ebb935d59bb552e43ad4697cb669f`.
- Evidence SHA: `25969c38623ebb935d59bb552e43ad4697cb669f`; [Platform verification #81](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/35849897296): SUCCESS (1m55s).
- Closure SHA: NONE — this is a partial response-authority tranche, not PRR-105 closure.
- Scope: the three public-content operations (`content`, `sitemap`, `redirect`) now use explicit safe serializers and runtime-authoritative output schemas. The serializers admit only rendered public content, public sitemap fields and bounded redirect fields; internal review, persistence and snapshot fields are not projected.
- Candidate remains `CANDIDATE_NOT_PUBLISHED` / `1.0.0-candidate`; this change creates no publication, market activation, migration or feature activation authority.
- Current executable counters before closure CI: 251 mounted operations; 245 candidate operations; 0 published operations; 0 unresolved consumer path/method calls; 142 unresolved route-input projections; 242 catalog schemas with non-structural wire parity; 210 operations without complete runtime-authoritative response schemas; 0 detected breaking changes.
- Consumer semantic parity is **not yet measured**: all 144 observations remain `NOT_PROVEN_BY_PATH_MATCH`. Therefore runtime request/response, error, validation/pagination, auth, OLD and NEW consumer mismatch counters must remain pending rather than being reported as zero.
- Local evidence: focused response/inventory suite 13/13 PASS; backend suite 287/287 PASS; inventory, breaking and OpenAPI candidate checks PASS. Migration: NONE.

PRR-105 remains **PARCIAL**. Outstanding acceptance gates include the 142 deliberate input projections, 210 incomplete output contracts, semantic consumer parity and an exact-SHA closure CI after all required gates are satisfied.

## Customer payments response-authority tranche, 2026-09-24

- Base SHA: `47e6b364ce6827e1e2287552524dcb12fe5c5a99`.
- Implementation SHA: `c7adb1e79560ad81d4124e964a972dd3f711b298`.
- Implementation CI: [Platform verification #83](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/36054830633): SUCCESS for that exact SHA.
- Evidence SHA: pending this documentation commit and its own exact-SHA platform verification.
- Scope: `POST /api/payments/create-intent`, `POST /api/payments/confirm`, and `GET /api/payments/history` now have runtime-authoritative safe output schemas and serializers. No payment capture, idempotency, concurrency, provider or financial-ledger behavior changed.
- Shared model: `PaymentSummary`, `CustomerBookingSummary`, professional/service summaries, and the existing `Paginated<T>` shape. The customer booking serializer excludes provider IDs, ledger/audit data, pricing-policy metadata, exact coordinates and professional contact/provider fields.
- Consumer evidence: Customer mobile checkout sends `{ bookingId }` and consumes `clientSecret` plus `paymentIntentId`; it sends `{ bookingId, paymentIntentId }` to confirmation and does not consume its response body. This is source review of `mobile-client/src/services/api.ts` and `mobile-client/src/screens/checkout/CheckoutScreen.tsx`, not a substitute for global semantic parity.
- Input classification: `create-intent` is structural. `confirm` retains a trim normalization on `paymentIntentId`, so it remains correctly counted among the 142 unresolved wire-input projections as `NORMALIZATION`; it is not claimed equivalent. `history` retains bounded/defaulted query normalization.
- Baseline before: 251 mounted; 245 candidate; 0 published; 142 unresolved route inputs; 210 incomplete runtime-authoritative outputs; 144 consumer observations, all `NOT_PROVEN_BY_PATH_MATCH`; breaking detector 0.
- Baseline after: 251 mounted; 245 candidate; 0 published; 142 unresolved route inputs; 207 incomplete runtime-authoritative outputs; 144 consumer observations, all `NOT_PROVEN_BY_PATH_MATCH`; breaking detector 0.
- Residual within Payments: `POST /api/payments/cash` remains an error-only retired compatibility route governed by the global SafeError contract; `POST /api/payments/webhook` remains mounted directly in `app.js`. The current response-catalog only recognizes router-level response bindings, so neither is falsely marked complete in this tranche.
- Evidence: focused/runtime serializer negative test PASS; backend suite 288/288 PASS; inventory, breaking and OpenAPI candidate checks PASS; OpenAPI validation PASS; generation twice produced identical SHA-256 hashes for inventory and candidate. Prisma format, validate and generate were invoked through the CLI with a non-production placeholder database URL; migration: NONE. `npm run verify`: PASS.
- Security review: explicit allowlists prevent `transactionId`, `providerChargeId`, `pricingSnapshot`, coordinates, Stripe account identifiers, contact phone and service internals from crossing these serializers. Dependency/secret/repository-hygiene and exact-SHA CI are still required before any PRR closure claim.

PRR-105 remains **PARCIAL**. Candidate remains `CANDIDATE_NOT_PUBLISHED`; no OpenAPI publication, production/Markets/F11 activation, CASH reintroduction or PRR-106 work is authorized by this tranche.

## Payments completion response-authority tranche, 2026-09-24

- Base SHA: `78c328436bb30ed44f92b2dab4cd7dc70cb003ee`.
- Implementation and evidence SHA: `bba5a5957c54511b8e05983d1e07b18c85c30a91`.
- Exact-SHA CI: [Platform verification #85](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/36060114507): SUCCESS (1m32s).
- Scope: the remaining Payments routes now bind runtime-authoritative output contracts: `POST /api/payments/webhook` returns the explicit Stripe event acknowledgement shape, while the retired `POST /api/payments/cash` route binds only its deliberate `409` SafeError. The pre-existing customer payment contracts remain unchanged.
- The webhook remains raw-body Stripe input processing. CASH remains retired and returns `CASH_PAYMENT_DISABLED`; it is not reintroduced. No capture, idempotency, concurrency, provider, ledger, migration, feature-flag or production behavior changed.
- The source extractor now recognizes direct `app.js` route bindings and error-only response contracts. The response catalog accepts only imported contract modules and projects them into the generated candidate; it does not infer contracts from controller implementation.
- Security review: the error-only contract validates the safe-error allowlist before the global error boundary. Its runtime test proves `privateProviderReason` is removed while request and correlation identifiers are preserved. Existing serializers retain explicit output allowlists.
- Baseline before: 251 mounted; 245 candidate; 0 published; 142 unresolved route inputs; 207 incomplete runtime-authoritative outputs; 144 consumer observations, all `NOT_PROVEN_BY_PATH_MATCH`; breaking detector 0.
- Baseline after: 251 mounted; 245 candidate; 0 published; 142 unresolved route inputs; 205 incomplete runtime-authoritative outputs; 144 consumer observations, all `NOT_PROVEN_BY_PATH_MATCH`; breaking detector 0. All five mounted Payments operations now have complete response authority.
- Evidence: `npm run verify` PASS (backend 290/290; Admin 15/15 plus build; Public Web 4/4 plus build; Customer 5/5 plus typecheck; Professional typecheck); Prisma format, validate and generate PASS with a non-production placeholder URL; migration NONE; inventory, OpenAPI candidate validation and breaking detector PASS; repeated inventory/OpenAPI generation yielded identical SHA-256 hashes. Platform verification #85 also passed its dependency, secret/security, PostgreSQL migration/RBAC/integration/concurrency and financial-idempotency gates for this exact SHA.

PRR-105 remains **PARCIAL**. Global consumer semantic parity is not yet proven, all 142 deliberately non-equivalent input projections and 205 incomplete output contracts remain open, and the candidate is `CANDIDATE_NOT_PUBLISHED`. PRR-106, production, Markets, CASH activation and F11 runtime remain OFF.

## Actor-specific Booking read response-authority tranche, 2026-09-24

- Base SHA: `71d3eb1597843a5f58a77f1f6434c34544e4a404`.
- Booking implementation SHA: `bdec185eeedd908412ca3c00c829f940acfb4466`.
- CI fixture correction SHA: `5cf6b9ba4fcce66a590dac2234b541818cbad849`.
- Exact-SHA implementation/fixture CI: [Platform verification #88](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/36063532586): SUCCESS for `5cf6b9ba4fcce66a590dac2234b541818cbad849`. The preceding [#87](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/36062701854) failed only in the isolated PostgreSQL consent-attribution fixture: multiple test users could receive the same generated phone number in one millisecond. The fixture now allocates a per-run prefix and monotonic suffix; the production `User.phone @unique` constraint is unchanged. PostgreSQL integration, migration/RBAC, financial idempotency, build/contract, dependency and secret gates passed in #88.
- Scope: `GET /api/bookings/{id}`, `GET /api/bookings/client/my-bookings` and `GET /api/bookings/professional/my-bookings` bind runtime-authoritative actor-specific response contracts. Explicit customer/professional serializers expose only the fields each actor is permitted to read. `responseContract` receives request context to choose the actor view. Existing booking domain transitions and persistence are unchanged.
- Security review: negative runtime tests exclude customer contact/coordinates from the professional view and internal pricing snapshots, provider identifiers, audit/risk data and DB-only fields from both views. Historical `CASH` remains a read-only enum value; no cash action is enabled.
- Consumer source compatibility: Customer booking reads retain their consumed booking, service, professional, payment and pagination fields. Professional booking reads retain the consumed customer display name and booking fields; the Professional status type and filter now include the already-existing runtime `NO_SHOW` status. Global OLD/NEW consumer semantic parity is not claimed.
- Baseline before: 251 mounted; 245 candidate; 0 published; 142 unresolved input projections; 205 incomplete runtime-authoritative outputs; 144 path/method-only consumer observations; breaking detector 0.
- Baseline after: 251 mounted; 245 candidate; 0 published; 142 unresolved input projections; 202 incomplete runtime-authoritative outputs; 43 complete response contracts; 144 path/method-only consumer observations; breaking detector 0. Exactly three Booking read output contracts closed; no input projection was falsely marked equivalent.
- Local evidence: focused inventory/response-contract tests 18/18 PASS; `npm run verify` PASS (backend 292/292; Admin 15/15 plus build; Public Web 4/4 plus build; Customer 5/5 plus typecheck; Professional typecheck). Inventory/OpenAPI candidate freshness and breaking detector PASS; repeated generation deterministic. Prisma format, validate and generate PASS with non-production placeholder URL; migration NONE. Local PostgreSQL replay was unavailable because the local Docker daemon was not running; exact-SHA CI #88 supplied clean PostgreSQL replay, RBAC, integration/concurrency and financial acceptance evidence.
- This documentary evidence is valid for tracker projection only when the documentation commit's exact-SHA CI also succeeds. The OpenAPI candidate remains `CANDIDATE_NOT_PUBLISHED`.

PRR-105 remains **PARCIAL**. Request, response, error, validation/pagination and auth semantic parity across all consumers remain unproven globally. PRR-106, production, Markets, CASH activation and F11 runtime remain OFF.
