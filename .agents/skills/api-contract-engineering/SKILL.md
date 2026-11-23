---
name: api-contract-engineering
description: Analyze and engineer HomeServices runtime-authoritative API contracts, Zod input/output projections, generated OpenAPI 3.1, consumer parity and breaking changes. Use for contract work or PRR-105 analysis; never publish or implement during an analysis-only task.
---

# API contract engineering

Apply `AGENTS.md`, `docs/agent-governance/GOVERNANCE.md` and `docs/api/API_V1_CONTRACT.md`.
Preserve the complete production-ready target; MVP = DISCARDED. The authority chain is:

runtime/domain authority -> validator/serializer -> authoritative schema -> generated OpenAPI
-> consumer verification -> CI -> exact-SHA evidence -> existing PRR acceptance.

## Establish authority before proposing changes

Inspect mounted routes/middleware, handler/service ownership, `backend/src/contracts/`,
`backend/src/middleware/`, and `backend/scripts/api-contract/`. Locate input validators, output
serialization/response-contract enforcement and safe-error authority. Do not infer output shape
from a database model, TypeScript DTO, example payload, or a path/method match.

Read source-inventory, schema-catalog, response-catalog, consumer-inventory, openapi-command and
breaking-changes only as needed for the question. Inventory and OpenAPI are projections, not a
second source of truth. Never hand-edit generated JSON to close a blocker.

For each operation produce a traceable record:
- method/path/classification and domain owner;
- auth/RBAC/resource ownership and middleware order;
- wire inputs versus parsed values, unknown-field policy and validation failures;
- serializer/DTO output, status, headers, safe errors and authoritative schema binding;
- consumer call sites, semantic assumptions and existing tests;
- confirmed evidence, unresolved projection/semantic gaps and governing acceptance criterion.

## Projection and semantic review

Distinguish input from output JSON Schema projection. Account for coercion, transforms, defaults,
optional versus nullable fields, strict objects, refinements, cross-field rules, recursive refs,
unions, dates, Decimal-to-wire conversion and omitted/redacted fields. A structural OpenAPI 3.1
validation pass cannot prove non-projectable runtime semantics. Preserve explicit gaps and blockers.
A serializer must enforce the wire contract in the actual execution path, not just in a test helper.

Check consumer required fields, enum handling, pagination defaults/bounds/order/tie-breakers,
empty and next-page behavior, error/status interpretation and compatibility of legacy aliases.
Trace customer mobile, professional mobile, admin web and public web separately. DTO typechecking
alone is not semantic parity. Treat dynamic/unresolved calls as unknown until evidenced.

## Test and compatibility plan

Reuse `backend/test/api-inventory.test.js`, `response-contract.test.js`, `http-contract.test.js`
and `test/contracts/payment-intent-concurrency.test.js`; inspect current coverage before adding any.
Propose positive/negative HTTP execution cases through real middleware and serializers; boundary,
malformed, unauthorized, cross-owner, safe-error and consumer-semantic cases; and failures proving
that stale inventory, schema drift and breaking changes are detected. Keep PostgreSQL financial
concurrency/idempotency acceptance independently required; mocks cannot replace it.

Compare against the approved baseline without silently replacing it. Review removed operations,
required inputs, input narrowing, output/status/auth changes, enums and pagination semantics.
Direction matters: accepting more input differs from emitting new output enum values. Require
existing compatibility/versioning decisions rather than inventing a v2 or accepting a diff blindly.

Read-only checks, after inspecting their scripts and prerequisites:
`npm --prefix backend run api:inventory:check`, `api:breaking:check`, `api:openapi:check`.
Generation, implementation and test additions require an authorized implementation task.
A gate failure triggers investigation, never relaxed assertions or manual contract patches.

## Publication and boundaries

`openapi.v1.candidate.json` remains CANDIDATE_NOT_PUBLISHED while any blocking completeness or
semantic acceptance gap remains. Do not serve it, rename it, generate production clients from it,
or claim publication from schema validity. List the applicable skills and evidence needed when
asked to prepare PRR-105; do not continue it, start PRR-106, or update their statuses.

Schemathesis is a separate possible test tool, not a skill or schema authority. Any future trial
uses generated OpenAPI against an isolated local API/database with synthetic identities and mocked
external provider I/O. It cannot replace domain, consumer, security or financial acceptance tests.
Pipeline incorporation is a separate reviewed change. No Production/Markets/CASH/F11 activation.
