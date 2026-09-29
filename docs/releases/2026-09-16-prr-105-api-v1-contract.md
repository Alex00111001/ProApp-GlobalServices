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

## Booking write/state transition response-authority tranche, 2026-09-29

- Base SHA: `df9115acfccb212775e808fe6268c376641567e9`; baseline Platform verification #89 SUCCESS.
- Initial implementation: `ba3b7a020e58d12832ad7d58fa7feaa369855116`. PostgreSQL corrections: `29e9f3d3b554b73611d59f0aac25cadc277503dd`, inventory refresh `5a3ad370e807807d9c7a3f25542f242b86cebc1e`, interval fix `9f0ee05dafd896ec8eaedae22e40842145a27764`.
- Verified implementation SHA: `9f0ee05dafd896ec8eaedae22e40842145a27764`; [Platform verification #93](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/36548314550): **SUCCESS** for that exact SHA. Quality, PostgreSQL and full-history secrets jobs all SUCCESS; no skipped gates.
- Evidence SHA: the immutable commit containing this section, resolved by `git log -1 --format=%H -- docs/releases/2026-09-16-prr-105-api-v1-contract.md`. A document cannot embed its own Git hash. The final report and Notion projection bind that SHA to its own SUCCESS run on `ci/closure/prr105-booking-evidence-20260929`; #93 does not substitute for the documentary commit's verification. Tracker synchronization is conditional on that separate exact-SHA result.
- Classification: approved PRR-105; Booking with user-authorized Billing coupling; CRITICAL/DEEP. Skills and routed review details, full mounted inventory, state machine, actor permissions, input classifications, consumer boundaries, concurrency and rollback are recorded in [Booking mutation contracts](../api/booking-mutation-contracts.md). No governance or external skill installation changes are included.

### Delivered response authority and approved semantics

Six mounted POST operations now bind runtime actor-safe serializers and output schemas: create, confirm, reject, start, complete and cancel. Create retains 201/new and 200/replay; other successful commands return 200. Mutation serializers compose the established customer/professional Booking read models, including safe payout/refund summaries. Negative tests exclude credentials, private contacts, coordinates, provider identifiers, internal pricing/ledger/risk/audit/notes and DB-only fields. Required/nullable fields, enums, dates, Decimal money, nested structures and arrays validate against generated OpenAPI.

The user approved **professional-only Booking confirmation**. Stripe records payment and preserves Booking state. Capture/reject/cancel share Payment-before-Booking transaction locks and cancellation reconciliation: accepted versioned refund decision when enabled, one deduplicated HIGH incident, alert and audit. Both forced execution orders and concurrent execution produce one refund decision and preserve CANCELLED. Provider refund execution and four-eyes authorities are unchanged. Completion rechecks settled payment and active refunds before its single earning/statistics writes; historical CASH cannot authorize new completion/earnings.

Intent persistence preserves terminal payments and expected intent identity. Ambiguous persistence retries transactionally; a shared in-flight intent is adopted safely and is never cancelled while persistence is uncertain. Definite terminal/conflict cleanup executes after transaction release; cleanup failure/persistence-unknown outcomes enter separate durable incident paths. Failed webhooks cannot degrade captured/refunded payments or overwrite newer intent identities.

CI #91 exposed an actual Prisma driver failure deserializing advisory-lock `void` results and fixture cleanup missing F8 automation delivery foreign keys. The lock result is now cast to text without changing transaction-scoped locking. Fixture cleanup deletes only its own dependent delivery rows before outbox rows. CI #92 then exposed an invalid `endDate = null` filter against required DateTime; the reviewed scheduling migration already backfills and enforces non-null intervals. The corrected availability query retains actual interval overlap. No assertions, expected outcomes, tests or acceptance gates were weakened. #93 proves the corrections in real PostgreSQL.

### Executable baseline before → after

| Counter | Before | After |
| --- | ---: | ---: |
| Mounted operations | 251 | 251 |
| Candidate operations | 245 | 245 |
| Published operations | 0 | 0 |
| Unresolved route-input projections | 142 | 142 |
| Incomplete runtime-authoritative outputs | 202 | 196 |
| Complete output contracts | 43 | 49 |
| Consumer observations | 144 | 144 |
| Breaking mismatches | 0 | 0 |

Booking mutations inventoried: 6. Output contracts closed: 6. Input projections globally closed: 0. Cancel/reject accepted-wire schemas and optional bodies now project with explicit NORMALIZATION metadata and positive/negative equivalence-of-acceptance tests; normalization is not falsely classified STRUCTURAL. Create remains TRANSFORM/LEGACY_COMPATIBILITY with aliases, text normalization, scheduling and market/domain prerequisites; required header/domain projection remains residual debt. The unchanged global gate continues counting these inputs unresolved.

Focused consumer source compatibility: PASS (7 tests covering active Customer create/cancel, Professional transitions, supported legacy aliases, consumed response fields/types, actor approval and real Booking statuses). The unused Customer confirm/complete helpers remain forbidden; no role privilege is broadened. Admin/Public have no lifecycle mutation consumer. No global semantic observation counter is promoted solely by source/path matching.

Global request, response, error, validation/pagination, auth and OLD/NEW consumer parity: **NOT_PROVEN**, not zero mismatches. Tranche response/schema/OpenAPI parity, actor privacy, ownership/IDOR, invalid transition/conflict and SafeError evidence: PASS. Candidate remains **CANDIDATE_NOT_PUBLISHED**.

### Verification and residual gates

- Local `npm run verify`: PASS; Backend 349/349; Admin 15/15 + build; Public Web 4/4 + build; Customer 5/5 + typecheck; Professional typecheck. An initial local Customer timeout passed on unchanged retry and the subsequent full run; no test timeout/assertion was changed.
- Exact-SHA #93: full workspace verification, inventory freshness, OpenAPI validation, breaking detector, dependency audit and secrets SUCCESS. PostgreSQL clean migration replay/status/baseline, RBAC sync and integration/concurrency **40/40 PASS**; financial idempotency acceptance **1/1 PASS**, zero skips. Includes real controller DTOs, create replay/slot conflict, concurrent confirm/reject/complete/cancel, duplicate completion, CASH retirement and both paid-rejection/capture orders.
- Prisma format/validate/generate: PASS; schema unchanged; migration **NONE**. Local PostgreSQL was unavailable (Docker engine not running); no local DB PASS is claimed.
- Generation: generate → freshness/validation → regenerate; artifact hashes unchanged and task-scoped `git diff` empty. Breaking detector: 0, no exceptions added.
- Dependency audits: **0 HIGH/CRITICAL** in all six scopes. Two newly reported moderate advisories remain outside this tranche: Backend multer [GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34) and Admin transitive undici [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v). Do not claim zero total vulnerabilities.
- Tracked-tree/full-history secrets, secret-shaped fixture guard and repository artifact hygiene: PASS via current source guard and exact-SHA CI. Focused security review covers allowlists, IDOR/role/ownership, mass assignment, replay and financial coupling. Independent human verification remains the next action.
- Unrelated pre-existing governance/skill changes remain uncommitted and preserved; task implementation/generated artifacts are committed. No whole-worktree CLEAN claim is made.

Residual PRR-105 gates: 142 inputs, 196 outputs, global semantic parity, publication, complete observability/documentation/rollback acceptance and final global exact-SHA evidence. The global publication target remains open despite this response tranche's CI success. Notion stays EN CURSO; its historical 15% is not increased without an approved progress denominator covering every gate.

PRR-105 closed: **NO**. PRR-106 started: **NO**. Production: **OFF**. Markets: **OFF**. CASH: **RETIRED/OFF**. F11: **PAUSED**. Next: **STOP — await independent verification**, with no new contract family started.

## Runtime input authority / OpenAPI wire projection tranche, 2026-09-29

- Base SHA: `8e88bb3d0485034fa916ae6c819920996863aa75`; exact baseline CI #94 SUCCESS.
- Initial implementation SHA: `575aee0f21bcf5105cd09a8608cc9ae00abeadc5`; Platform verification #95 completed SUCCESS, but its secrets action reported **No commits to scan**. That result is insufficient full-history evidence and is NOT used to close this tranche's security gate.
- Verified implementation/security-gate correction SHA: `4668e5142da0165110058bd919612bf51afae037`; [Platform verification #96](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/36566809252): **SUCCESS** for that exact SHA. Quality, PostgreSQL and secrets jobs and every applicable step succeeded, with no skipped gates.
- Evidence SHA: the immutable commit containing this section, resolved with `git log -1 --format=%H -- docs/releases/2026-09-16-prr-105-api-v1-contract.md`. This document cannot embed its own Git hash. Its own exact-SHA CI on `ci/closure/prr105-input-evidence-20260929` must succeed before tracker projection; #96 is not a substitute. Final report and Notion bind that documentary SHA to its separate run.
- Scope/classification: approved PRR-105, API input authority with Booking/Identity/Payments wire boundaries, HIGH/DEEP final review; operator-selected runner, no model-switch/delegation claim. Skills: systematic-engineering, api-contract-engineering, repo-auditor, architecture-guardian, booking-engine, payments, security, testing, database-prisma and release; Notion tracking skill projects evidence only. No governance/skill installation changes are committed.
- Architecture, semantic definitions, wire/domain boundaries, normalization/transforms/refinements, aliases, unknown fields, consumers and rollback: [Input contract authority](../api/INPUT_CONTRACT_AUTHORITY.md). Exact source-derived per-operation inventory: [Input inventory](../api/input-inventory.v1.json).

### Executable inventory and delivered authority

All **251 mounted operations** are inventoried, including all historical input gaps. There are **247 supported route-validator bindings**, 176 unique bindings, and 677 observed operation/source reads: BODY 112, QUERY 68, PARAMS 174, HEADERS 11, SERVER_CONTEXT 312. The 373 additional source-review points (312 derived and 61 other unbound/header reads) overlap operations/bindings; they are not added to the binding counter and are not described as confirmed runtime bugs. Each operation records router/controller, validator/parse source, projection, consumers, auth, domain/risk and legacy classification.

Immutable semantic metadata, accepted-wire projections and executable parity cases retain the real runtime parsers. Inventory generation/check executes declared acceptance, normalized-result and refinement evidence; missing cases, false equivalence, adapter mismatch or narrowed accepted wire fail verification. Required/optional/nullable/types/enums/bounds/arrays/unknown-field/header/query/params drift has negative-control tests. Coercion/default behavior is now visible rather than silently treated as structural equivalence.

**Three validator input surfaces closed:** Booking cancellation reason, Booking rejection reason and payment confirmation. They remain classified NORMALIZATION, not falsely STRUCTURAL_EQUIVALENT. Closure means acceptance-equivalent wire/runtime validator evidence, not ownership, auth or financial/domain proof. Reasons preserve optional bodies, null/absence, trim/truncate500 and unknown-field STRIP. Payment identifiers preserve original trim/ASCII prefix/normalized maximum and strict client keys, including Unicode whitespace and all 128 ASCII-tail cases. No financial command, state, money, currency, provider, idempotency or conflict semantics changed.

**Three declared runtime-refined bindings remain open:** Booking create, login and password recovery. Booking creation projects supported postal/time aliases, wider pre-normalization text/date kinds and the actual required idempotency header; actor/market/pricing/policy remain server-authoritative. Registration retains unresolved semantics, but its representable consent-policy dependencies now use one closed rule authority shared with the runtime predicate and generated conditional/dependentRequired JSON Schema. All eight valid field-presence combinations preserve runtime acceptance, issue messages, paths and order. No identity, role, market or legacy acceptance policy is silently repaired.

Unknown object-field behavior is recorded as STRIP/REJECT/PASSTHROUGH/VALIDATED_CATCHALL. Negative cases cover actor/role/market/currency/price/permission/prototype-shaped injections. The OpenAPI admin-refresh security lookup now matches the actual cookie-plus-CSRF auth class; runtime authorization is unchanged. No internal/service credentials are introduced as ordinary client inputs.

### Rebaseline: historical counter versus stronger semantic coverage

| Counter | Base | After |
| --- | ---: | ---: |
| Mounted / candidate / published | 251 / 245 / 0 | 251 / 245 / 0 |
| Historical structural-only unresolved projections | 142 | 142 |
| Strengthened unresolved input semantics | 166 | 163 |
| Executed acceptance-equivalent declared bindings | 0 | 3 |
| Incomplete / complete output contracts | 196 / 49 | 196 / 49 |
| Consumer observations | 144 | 144 |
| Breaking mismatches | 0 | 0 |

The strengthened base is computed from the unchanged runtime using the new coverage rules: **142 historical + 24 previously unproven coercion/default normalization bindings = 166**, then three executed equivalent surfaces close: **163**. This is not 21 new runtime defects or an artificial reduction of semantic debt. The old 142 remains available explicitly for historical comparison. No schema or generated artifact is manually edited to reduce the counter.

Residual primary classes, disjoint: STRUCTURAL_EQUIVALENT **0**; NORMALIZATION **117**; TRANSFORM **22**; REFINEMENT **19**; CROSS_FIELD_VALIDATION **3**; RUNTIME_DERIVED **0 validator bindings**, with **312 separate derived source observations**; LEGACY_COMPATIBILITY **2**. Secondary classes overlap. Provisional source classifications are not acceptance proof.

Eleven actual Customer/Professional request-building methods execute unchanged after type stripping; only transport/device storage are isolated. Serialized fields, optional/bodyless commands, headers, aliases, params and query behavior validate against runtime and OpenAPI. Consumer observations with request-only executable evidence: **11**. This is not mocked production/DB acceptance or full response/auth parity. Supported OLD consumers remain compatible for the tested request cases; NEW/global OLD/NEW parity is **NOT_PROVEN**. Admin/Public have no affected Booking mutation request builders. Global request, response, error, validation/pagination and auth parity remain **NOT_PROVEN**, not zero mismatches.

### Verification, security and immutable closure

- Local `npm run verify`: **PASS**; Backend **390/390**, zero skips; Admin **15/15 + build**; Public Web **4/4 + build**; Customer **5/5 + typecheck**; Professional **typecheck**. Focused new input/consumer tests: **41/41**.
- Exact-SHA #96: full workspace verification, inventory freshness, generated OpenAPI validation, breaking detector and all six dependency audits **SUCCESS**. PostgreSQL clean replay of 30 reviewed migrations, status/baseline and RBAC synchronization **SUCCESS**; integration/concurrency **40/40**; financial idempotency **1/1**, zero skips. No live charges/refunds/payouts or production database writes were executed.
- Prisma format/validate/generate: **PASS** with a non-production placeholder configuration; schema unchanged; migration **NONE**. Local Docker PostgreSQL remained unavailable; no local DB PASS is claimed. Actual DB evidence comes from isolated PostgreSQL CI.
- Determinism: generate → freshness/check/validation → regenerate; all three generated artifact SHA-256 hashes identical and task-scoped artifact diff empty. Breaking detector **0**, no exceptions or approved-baseline rewrite. Enriched future snapshots additionally protect wire narrowing, aliases, required headers, body handling and validator/source semantic digests; final approved-v1 baseline review remains a global gate.
- Security correction: preserve the existing pinned Gitleaks action/version but require explicit non-shallow/non-empty **all-ref history** and isolated **HEAD archive** scans. #96 actually scanned **233 commits / 307.28 MB** and **11.70 MB tracked tree**, both **no leaks found**. The previous action-only green job was not sufficient. No allowlist, skip, assertion reduction or warning conversion was introduced.
- Tracked-tree/full-history secret scans, secret-shaped fixture guard and repository artifact hygiene **PASS**. Focused security review covers strict/stripped keys, identity/market/role spoofing, public versus privileged headers, object/prototype keys and financial field manipulation. Runtime auth/ownership/SafeError/Booking state machine and accepted financial guarantees are unchanged; no independent-human-review claim is made.
- Dependency audits: **0 HIGH/CRITICAL**; the two tracked moderate advisories remain: Backend multer GHSA-3pph-fpjx-jg34 and Admin transitive undici GHSA-3wwx-pv8p-q78v. No claim of zero total vulnerabilities.
- Unrelated pre-existing governance/skill changes remain DIRTY and preserved outside these commits. Only this tranche's implementation, generated artifacts, necessary security-gate correction and evidence are delivered.
- Notion synchronization is conditional on the documentary commit's exact-SHA SUCCESS; EN CURSO and historical **15%** stay unchanged because no approved global progress denominator exists. Git and executable evidence remain the technical authority.

Residual PRR-105 gates: **163 strengthened unresolved input bindings**, 373 overlapping source-review points, **196 incomplete outputs**, complete request/response/error/validation/pagination/auth and OLD/NEW semantic parity, final approved v1 publication, full documentation/observability/rollback acceptance and final global exact-SHA verification. OpenAPI remains **CANDIDATE_NOT_PUBLISHED**. Tranche CI does not close global PRR-105.

PRR-105 closed: **NO**. PRR-106 started: **NO**. Production: **OFF**. Markets: **OFF**. CASH: **RETIRED/OFF**. F11: **PAUSED**. Next: **STOP — await independent verification**. No next tranche is started.
