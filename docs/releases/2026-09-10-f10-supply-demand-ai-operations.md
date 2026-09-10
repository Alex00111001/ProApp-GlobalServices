# F10 Supply, Demand and AI Operations release evidence

## Release identity

- Branch: `feature/supply-demand-ai-operations-phase-10`
- Base F9 SHA: `f2ffb4426ddc8bf7194e04aa61f46c75051ea203`
- Architecture SHA: `d39331ab26fa9e5678ca218b218a2c250a8c33e9`
- Supply/Demand and AI core SHA: `e9bbae38108be3aa5c2966afba3a87c48b8d8c05`
- Admin surfaces commit: `312bd9b5a90e5d4d71916f745e76eeff7538db7a`
- AI routing/audit hardening SHA: `13ee26db3c6ad0b75c8e6700d8cc9f536277b8f3`
- Documentation/release SHA: this record's published commit
- Remote Platform verification: pending
- Status: **PARCIAL — remote closure pending**
- Markets activated: **NO**
- Production activated: **NO**

## Delivered controls

- Versioned deterministic supply/demand definitions, immutable evidence, bounded time windows, quality/watermark and explainable anomaly rules.
- PostgreSQL advisory-lock and uniqueness semantics for concurrent catalog, snapshot and AI idempotency.
- Complete versioned readiness policy, four-eyes review, explicit blockers and hard separation from Market activation.
- Expansion evidence/recommendations with guardrails and review, never execution.
- Governed provider/model/prompt/operation/evaluation/approval/cost domains, fixed adapters, closed tools/operations, strict schemas, privacy and budgets.
- Durable leased worker, bounded retries/dead-letter, rate/concurrency/circuit breaker and immutable output/cost evidence.
- Narrow Admin APIs/RBAC, real API-only Admin Web, F2 telemetry/audit/context and 20 forced-RLS/default-deny tables.
- Production, Markets and provider execution remain inactive.

## Requirement → control → evidence

| Requirement | Control | Evidence |
| --- | --- | --- |
| Eligible supply and distinct demand | canonical profile/service-area/request/booking definitions | metric/component tests |
| Reproducible windows/late events | bounded resolver, watermark and digest | window/quality tests |
| Concurrent snapshots | advisory locks and unique evidence | five-worker PostgreSQL scenario |
| Evidence readiness | 12 dimensions, 10,000-bps weights, immutable result | unit and DB evaluation |
| Readiness ≠ activation | inactive blocker and no Market write | before/after DB assertion |
| Expansion ≠ execution | guardrails and independent review | DB expansion scenario |
| Provider abstraction/routing | fixed adapter and capability/purpose/class/Market/locale checks | routing/config tests |
| No arbitrary AI/tools | seven-operation/read-only tool registries | registry and injection tests |
| Structured safe output | strict schema, rejection without auto-repair | malicious/schema tests |
| HIGH approval | DB risk check, four eyes and exact digest | PostgreSQL approval scenario |
| Privacy | input minimization, PII/secret rejection | direct/indirect injection tests |
| Cost/rate/retry | budgets, immutable costs, capacity/circuit, bounded backoff and transactional retry/dead-letter audit | unit plus three-attempt DB exhaustion evidence |
| Durable idempotency | lock, unique key, lease and one artifact | 8-request/4-claimer DB scenario |
| RBAC/API | dedicated role, F4 session, bounded validation | 401/403/range tests |
| RLS/default deny | enabled+forced with no grants/policies | static plus 20-table DB test |
| Rollback | off-by-default and application-first | config tests/runbook |

## Current evidence

- Migration `202609100001_supply_demand_ai_operations`: applied; 26 migrations current in configured Supabase test.
- Backend regression: 218/218.
- Focused F10 unit/security: 43/43.
- Focused F10 PostgreSQL/Supabase: 4/4, including concurrent snapshots, execution idempotency, three-attempt retry/dead-letter with redacted error, HIGH four-eyes approval and forced RLS.
- Complete PostgreSQL/Supabase integration regression: 24/24.
- Admin Web: 15/15 plus lint/build.
- Root verification: green, including public web 4/4 plus SSR build, Client test/typecheck and Professional typecheck.
- Prisma format/validate/generate and migration status: green; all 26 migrations are current in configured Supabase test.
- RBAC synchronization and baseline compatibility audit: green.
- Dependency audits: zero vulnerabilities on root, backend, Admin Web, public web, Client and Professional.
- Tracked-tree/full-history secret scans and remote CI: pending final closure run.

## Residual activation risks

- No real provider credential or model call is activated or required for phase closure. Provider smoke/load/soak, data-processing review, regional routing and actual cost calibration belong to the later go-live gate.
- Operational thresholds require calibration with lawfully collected representative traffic before business use.
- Admin build retains its existing near-500 kB bundle warning; the production build is green and route splitting can be handled separately without weakening F10.

F10 remains PARCIAL until the complete local gate and final published Platform verification are green. Production and Markets remain inactive.
