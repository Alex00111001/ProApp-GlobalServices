# Runtime input contract authority — PRR-105

## Scope and classification

Task: approved PRR-105 input-authority tranche; base `8e88bb3d0485034fa916ae6c819920996863aa75`.
Domain: API contracts, with Booking as the first proving ground. Risk HIGH; capability DEEP
for design/security/final review (Sol required; execution model is operator-selected and cannot
be switched by this runner). Mechanical inventory is FAST-eligible; no delegation/model switch
is claimed. Skills: systematic-engineering, api-contract-engineering, architecture-guardian,
repo-auditor, booking-engine, security, testing, payments and release.

Escalate on changed accepted inputs, authorization/financial semantics, migration need, ambiguity
in compatibility or two non-mechanical verification failures. No migration is expected.
Verification: inventory/freshness, executable wire/runtime/OpenAPI parity, negative security and
consumer request cases, breaking detection, deterministic generation, full workspace regression,
Prisma, exact-SHA PostgreSQL/RBAC/financial/security CI. Preserve unrelated governance changes.

## Before implementation

Executable base inventory: 251 mounted operations, 245 candidate operations, 0 published;
247 route-validator bindings (176 unique), 142 unresolved route projections, 196 incomplete
outputs, 49 complete outputs, 144 consumer observations. Their path/method matches are NOT
global semantic proof. Existing counters do not enumerate every header, derived identity or
service/domain prerequisite. These additional gaps must remain separately visible.

## Semantic classes

Classes are cumulative; one primary class is used only for disjoint reporting. Classification
is not a completion claim. Source inference is provisional until backed by executed evidence.

- STRUCTURAL_EQUIVALENT: acceptance represented without material loss, including unknown fields.
- NORMALIZATION: accepted wire values deliberately normalized; project wire, not parsed values.
- TRANSFORM: representation changes; runtime owns conversion and domain-result validity.
- REFINEMENT: runtime predicate beyond the accurately expressible structural subset.
- CROSS_FIELD_VALIDATION: relationships between fields; JSON Schema only where faithful.
- RUNTIME_DERIVED: authenticated/server/context authority, not editable client request fields.
- LEGACY_COMPATIBILITY: supported aliases/shapes normalized without removing compatibility.

An unreviewed structural subset is not equivalent. Normalization/transformation metadata cannot
silently clear the existing structural-only counter. Report executed semantic evidence separately.
An AST-derived inventory records sources and gaps; it cannot prove arbitrary domain predicates.

## Runtime, wire and evidence boundaries

`backend/src/shared/http/input-contract.js` declares immutable semantic metadata without changing
the runtime Zod parser. `schema-catalog.js` keeps the earlier validation projection (`jsonSchema`)
separate from the accepted client projection (`wireJsonSchema`). This avoids comparing normalized
internal values with accepted wire values as if they were a validator change. Runtime validation
and source digests remain separate from both projections.

The request parity engine executes real parsers/normalizers against positive, negative, boundary
and normalized-result cases. A declared projection cannot clear debt from its label, test filename
or source search alone: missing/unknown evidence IDs, mismatched adapters and failed cases fail
inventory generation/check. OpenAPI schema/requiredness/parameter/unknown-field drift is separately
tested. No gate, assertion or approved baseline is relaxed.

Two modes are deliberately distinct:

| Mode | Meaning | Completeness |
| --- | --- | --- |
| ACCEPTANCE_EQUIVALENT | Wire acceptance and runtime acceptance agree; normalization results are checked | Closes only that validator input surface, never actor/domain/global parity |
| STRUCTURAL_WITH_RUNTIME_REFINEMENT | Accepted runtime values are represented; broader wire values still require runtime predicates | Remains unresolved; executed refinement witnesses are mandatory |

The existing structural-only count remains published as `historicalStructuralOnlyUnresolved`.
The strengthened `unresolvedRouteInputProjections` also includes coercion/default semantics that
formerly had a structural JSON projection but no semantic evidence; it excludes only executed,
acceptance-equivalent declared surfaces or truly structural inputs. This is stronger coverage,
not a reclassification of transforms/refinements to STRUCTURAL_EQUIVALENT.

At this tranche: historical 142; 24 additional normalization/coercion/default review bindings
revealed; two reason-body boundaries and payment-confirmation wire acceptance proven:
**142 + 24 - 3 = 163** unresolved semantic bindings.
The enriched before/after is 166 → 163. Three declared structural/runtime-refined projections
remain open. Source inventory covers 251 operations, 247 supported validator bindings and 677
observed reads: BODY 112, QUERY 68, PARAMS 174, HEADERS 11, SERVER_CONTEXT 312. These are repeated
operation/source observations, not 677 unique payload fields. The 373 additional review points
(312 derived, 61 other unbound/header reads) overlap operations/bindings and are not added to the
163 or falsely described as confirmed runtime bugs. `input-inventory.v1.json` records exact method,
path, router/controller, validator definition and parse source, projection, consumers, auth, risk,
legacy class and source-review limitations. Freshness is enforced by the existing CI inventory gate.

Unresolved primary classes (disjoint): STRUCTURAL_EQUIVALENT 0, NORMALIZATION 117, TRANSFORM 22,
REFINEMENT 19, CROSS_FIELD_VALIDATION 3, RUNTIME_DERIVED 0 validator bindings (312 separate derived
source observations), LEGACY_COMPATIBILITY 2. Secondary classes overlap; the primary label is not
an exhaustive analysis of opaque predicates. Text cleanup uses Zod transform() but preserves a
string representation: explicit reviewed metadata correctly classifies it NORMALIZATION, not a
representation-changing TRANSFORM. Explicit registration policy-pair metadata covers a
real superRefine whose callback cannot be recovered faithfully from Zod's wrapped private check.
Registration's non-null/non-empty policy ID and positive version make presence equivalent to
truthiness. A closed shared rule model preserves the original runtime issue messages, paths and
order, while projecting conditional requirements and dependentRequired into JSON Schema allOf.
All eight consent/ID/version combinations have executable acceptance and issue-parity evidence.
This does not close registration's normalization, legacy alias or domain input debt.

## Implemented input families

| Surface | Projection / runtime authority | Residual boundary |
| --- | --- | --- |
| Booking cancel/reject | Optional object body; reason string/null/absent; unknown fields accepted then STRIP; trim/truncate500 verified | Actor, state, refund and ownership rules remain separate runtime gates |
| Booking create | Strict client keys; legacy postal/time aliases represented; text/date transformation uses existing runtime code | Normalized bounds/datetime, future scheduling/service duration, professional/service/address ownership and market/policy prerequisites remain runtime-refined |
| Booking create header | Required Idempotency-Key; actual parser trims and checks 16–128 allowed characters | Financial replay/concurrency remains PostgreSQL evidence, not schema proof |
| Booking confirm/start/complete | Actual params validator; request body ignored, not a command/authority source | Professional assignment/approval and state machine unchanged |
| Login | Wire email string then trim/lowercase/email predicate; password bounds preserved; unknown fields STRIP | Email predicate remains runtime-refined; no privileged credentials become ordinary body fields |
| Password recovery | Wire email/optional locale; strict unknown fields; runtime normalization/predicates verified | Domain/account/provider/abuse rules unchanged; no global identity parity claim |
| Payment confirmation | Strict booking ID/provider-ID strings; accepted-wire whitespace/ASCII grammar and normalized maximum verified equivalently | Provider, payment ownership, money/currency, idempotency and conflict policies remain runtime authorities |

Alias policy: zipCode and scheduledTime are SUPPORTED LEGACY; no alias removed. A canonical non-null
postalCode wins; ignored alias values remain ignored as before. Existing scheduledTime conversion
uses the server-local timezone, including existing Date overflow/invalid-alias behavior; no silent
timezone/scheduling redesign. With scheduledTime, legacy numeric/array Date inputs can normalize to
ISO; the structural wire subset includes JSON value kinds instead of incorrectly narrowing to the
internal ISO string. Future-date/domain guards are unchanged. Text normalization accepts wider wire strings than normalized-length
bounds. The wire projection intentionally permits structurally valid values rejected after runtime
normalization/refinement; extensions and tests make this limitation explicit.

Unknown-field policy is recorded at each object/array location: STRIP, REJECT, PASSTHROUGH or
VALIDATED_CATCHALL. It is not inferred from a response DTO. Booking create rejects clientId, role,
marketId, currency, price, permission and prototype-shaped keys; reason bodies discard untrusted
extra keys. Header projection contains only the already-enforced public idempotency header.
Admin refresh retains cookie plus CSRF security schemes: the previous generator lookup used the
wrong auth-class spelling and accidentally documented no security; runtime auth is unchanged.
Payment provider identifiers use shared prefix/maximum constants: optional ECMAScript whitespace,
pi_ plus 1–252 ASCII alphanumeric characters, optional whitespace. Runtime still trims and enforces
its original regex/255-character maximum. Unicode whitespace, both length boundaries and all 128
ASCII tail characters are exercised; this proves wire acceptance, not financial domain acceptance.

## Consumer evidence and compatibility protection

Eleven actual Customer/Professional request-building methods execute unchanged after TypeScript
type stripping, with only network transport/device storage isolated. Serialized payloads, bodyless
requests, headers, params, quantity, scheduling alias mapping and query limits are checked against
runtime and OpenAPI authority. This is executable REQUEST_ONLY case evidence, not end-to-end auth
or response proof. Inventory links method source digests and the exact test. Global 144 consumer
observations remain NOT_PROVEN_BY_PATH_MATCH; NEW canonical-v1/global OLD/NEW parity is not claimed.
Admin/Public have no affected Booking mutation request builders.

Breaking detection compares historical runtime projections independently from added wire metadata.
Enriched snapshots additionally protect wire narrowing/legacy aliases, required headers, body handling
and validator/source semantic digests. The existing approved baseline is NOT replaced or edited;
final v1 baseline approval/protection remains a global PRR-105 gate. Header/query/params/required/
nullable/type/enum/bounds/array/unknown-field mutations have negative-control tests. No endpoint
allowlist or compatibility exception is added.

## Dependency plan

1. Inventory all existing unresolved bindings and observed body/query/params/header/derived reads.
2. Establish a shared metadata/projection/parity system without changing runtime acceptance.
3. Prove Booking optional reasons, creation aliases/text transforms/header and derived boundaries.
4. Reuse safe dependencies in critical identity/payment input surfaces only when ready.
5. Verify consumers, breaking changes and deterministic artifacts; full regression and exact-SHA CI.
6. Record before/after evidence and project it to existing Notion only after CI SUCCESS; STOP.

Rollback preserves legacy endpoints and validators. Revert only reviewed contract/projection changes;
never bypass validation, financial idempotency, ownership or SafeError. OpenAPI remains
CANDIDATE_NOT_PUBLISHED; PRR-106 blocked; Production/Markets/CASH OFF; F11 PAUSED.
