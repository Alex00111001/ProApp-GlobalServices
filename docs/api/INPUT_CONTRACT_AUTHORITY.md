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

## PRR-105.T01: shared bounded-trim authority (2026-09-29)

Classification: approved PRR-105.T01; shared input contracts across seven validator modules;
HIGH / DEEP final review, operator-selected model. MVP DISCARDED. Target: complete, stable,
publishable, production-ready. This tranche changes contract representation and shares existing
runtime normalization; it does not approve a production action or the global PRR acceptance gate.
Escalation boundaries: any runtime acceptance change, migration, new coercion, domain-policy
change, publication or activation requires separate scope. No such change is included here.

### Inventory and dependency order

[T01 baseline inventory](normalization-inventory.t01.json) records all **117** unresolved
NORMALIZATION bindings at `5c534b36988e8c426efb860fda3e215a571a876d`. Each record includes method,
path, domain, surface, validator/source, fields, operations, wire/normalized representations,
consumers, risk and primitive candidates. It is a pinned source-analysis snapshot, not acceptance
evidence; the live input inventory remains generator-owned. There are **71 exact field-semantic
clusters**. Cluster binding sets overlap: one object can contain defaults, coercion and trim.
Default values and bounds are part of the cluster identity; counts must not be summed as closures.

| Priority | Demonstrated reuse | Risk / consumers / dependency readiness | Decision |
| --- | --- | --- | --- |
| 1 | Bounded trim; 8..500 in 17 baseline bindings and 10..2000 in 16, plus four other bound variants | Seven modules; 19 affected consumer observations; audit reasons, policy reviews, session/role commands and identity proof are security-relevant. Pure trim grammar is ready; select only complete objects without other unresolved semantics | One shared primitive; 29 object authorities / 34 mounted bindings closed |
| 2 | Integer coercion 1..100 in 36 and positive integer coercion in 30 bindings; default 1 in 41 | High cross-domain/list-consumer reuse, but HTTP query parser, duplicate keys, Number coercion and defaults need their own equivalence proof | Deferred; not mixed into trim |
| 3 | Trim/uppercase market code in 11; trim/lowercase identifier in 7 for their respective exact grammar | High identity/market and case-confusion risk; most complete objects also contain other semantics | Deferred; preserve server market authority |
| 4 | Remaining email/locale/date/text/default combinations in snapshot | Different grammar, defaults, refinements, transforms or insufficient standalone reuse | Deferred; no speculative generic normalizers |

### Primitive and wire representation

`backend/src/shared/http/input-normalization.js` owns `trimmedString(minimum, maximum)`.
Its runtime is exactly `z.string().trim().min(minimum).max(maximum)`, with the existing order,
values and validation issues. Locked Zod 4 string bounds and JSON Schema count Unicode code
points. There is no case folding, Unicode normalization, truncation, numeric/boolean coercion,
empty-to-null conversion or new allowed input type.

The shared bounds generate a wire **string pattern**, not wire minLength/maxLength on the
untrimmed string: ECMAScript whitespace, then non-whitespace-delimited content within normalized
bounds, then ECMAScript whitespace. For bounds m..M (M >= 2), the core is
`\S[\s\S]{max(0,m-2),M-2}\S`, plus the single `\S` alternative when m=1; it is wrapped in
`^\s*(?:core)\s*$` and evaluated with Unicode semantics. Thus padded maximum-length input is
accepted and converted to the bounded canonical value. Internal whitespace/control characters,
case, combining marks and zero-width non-whitespace remain unchanged, as the runtime requires.

`declareTrimmedInput` composes only explicitly selected object authorities. It reuses structural
siblings and optional/nullable wrappers, and refuses unreviewed coercion, defaults, transformations,
refinements and validated catchalls. Selected trim fields are required non-null strings. An object
with unrelated semantic debt stays unresolved even if it reuses a bounded reason primitive.

Flow: accepted JSON wire -> original runtime validator -> ECMAScript trim -> bounded canonical
domain input. Generated OpenAPI comes from this shared wire metadata. Declaration alone cannot
close a binding: generation executes independent fixed fixtures, boundaries, negative cases and
canonical-result assertions. Mounted OpenAPI binding checks execute in the test suite. All 34
closed bindings retain **NORMALIZATION**, with **ACCEPTANCE_EQUIVALENT** for validator input only.

| Bounds | Canonical purpose | Runtime validator authorities |
| --- | --- | --- |
| 1..5000 | Incident/support comment body | admin-operations: incidentCommentSchema, supportCaseCommentSchema |
| 8..500 | Review reasons/references | markets: marketStatusBody, identityPolicyReviewBody, identityPolicyStatusBody; privacy: policyReviewSchema.reviewReference; supply-demand-ai: reviewBody, activateBody, approvalBody, expansionReviewBody, providerStatusBody; experiments-content-seo: reviewBody, retireBody, experimentStatusBody |
| 10..500 | User/professional/session/role reason | admin: userStatusSchema, professionalStatusSchema, revokeSessionSchema, roleDecisionSchema |
| 10..2000 | Operations/privacy/referral/automation reason | admin-operations: errorStatusSchema, incidentStatusSchema, supportCaseStatusSchema, supportCaseAssignmentSchema; privacy: policyReviewSchema, policyStatusSchema, modelStatusSchema; referrals-automation: programStatusSchema, automationStatusSchema, revokeCodeSchema |
| 12..1000 | Expansion hypothesis | supply-demand-ai: expansionBody |
| 40..2000 | Identity reconciliation proof text | privacy: reconciliationSchema; proof authenticity remains a separate service authority |

All operation method/path mappings are recorded in the generated [input inventory](input-inventory.v1.json)
and [route inventory](route-inventory.v1.json), under `trim.*` evidence IDs. The 29 authorities
cover 34 operations because role decisions and F10 review/activation schemas have multiple mounts.

Unknown fields remain **STRIP** on the six admin-operations commands and **REJECT** on the other
28 mounted commands. The former project additionalProperties=true because runtime accepts then
discards extra keys; the latter project false. Neither accepts unknown fields into canonical
commands. There is no selected PASSTHROUGH runtime object. Metadata preserves the distinction
between acceptance and output retention.

### Executable proof and limits

- `backend/test/shared-normalization.test.js`: padded-max red regression, 29 authorities,
  primitive equivalence to the previous parser, generated Unicode/boundary cases, composition
  refusal, 34 mounted OpenAPI bindings and breaking negative controls.
- `backend/test/helpers/normalization-cases.js`: independent command fixtures, min/max +/-1,
  astral characters, whitespace, null/absence/empty, invalid JSON types, canonical output,
  unknown identity/role/market/currency/header/prototype-shaped keys. Booleans and row versions
  do not acquire coercion. Existing content acceptance is not tightened to repair unrelated risk.
- `backend/test/normalization-consumer.test.js`: 18 actual Admin expressions plus the actual
  Admin API serializer execute with isolated fetch/session/UI values; the actual Customer
  revokeReferralCode method executes with isolated transport. Seventeen builders execute four
  text variants (canonical, padded/Unicode and invalid); two synthesize fixed reasons and execute
  both ACTIVE/RETIRED request branches with exact text assertions. Paths, methods, body, correlation/content
  headers and runtime/OpenAPI acceptance are checked. No production requests execute.
- Consumer evidence is REQUEST_ONLY: **19 new**, **30 total** of **144** observations. No affected
  Professional/Public builder exists for these commands. UI event orchestration, auth, responses,
  live privileged headers and global OLD/NEW parity are not inferred from these tests.
- Existing breaking detection remains unchanged and reports **0**. Negative tests protect
  requiredness, wire types, enum/bounds/pattern narrowing, aliases/removal and unknown fields;
  existing header compatibility tests remain active. The approved baseline is not rewritten.

Rebaseline: NORMALIZATION **117 -> 83**, strengthened unresolved **163 -> 129**, executed equivalent
bindings **3 -> 37**. TRANSFORM **22**, REFINEMENT **19**, CROSS_FIELD_VALIDATION **3** and
LEGACY_COMPATIBILITY **2** stay unchanged. Historical projections **142**, source-review points
**373**, incomplete outputs **196**, complete outputs **49**, mounted/candidate/published
**251/245/0** and global semantic parity **NOT_PROVEN** are unchanged.

Verification, exact-SHA CI and residual acceptance gates are recorded in the
[PRR-105 evidence document](../releases/2026-09-16-prr-105-api-v1-contract.md).
Rollback is a scoped revert of T01 authorities and generated artifacts; runtime acceptance and
legacy endpoints are preserved. Migration NONE. PRR-105 remains open; PRR-106 not started;
Production/Markets/CASH OFF, F11 PAUSED. Stop after exact-SHA evidence and tracker projection.

## Pagination pilot — canonical values and HTTP query syntax

The pilot covers `GET /api/v1/admin/growth/campaigns`,
`GET /api/v1/admin/operations/errors` and `GET /api/v1/admin/operations/incidents`.
Their candidate OpenAPI parameters describe optional canonical integers. The
defaults are page 1 and limit 25, and the limit is bounded from 1 through 100.
The Express query parser and Zod coercion also accept some noncanonical spellings,
such as `02`, `2.0` and `2e1`. Preserve those spellings for existing clients.

Keep the integer parameters as the client-facing representation. Track the
runtime conversion and accepted HTTP spellings separately from the canonical
schema. Before claiming equivalence, the projection must account for absent
versus empty input, percent decoding, duplicate keys, bracketed keys, and
ECMAScript number parsing and safe-integer bounds. The errors and campaigns
controllers also validate sibling filters. Validating pagination alone does
not close a binding whose sibling filters still lack semantic evidence.

The [HTTP pilot PR](https://github.com/Alex00111001/ProApp-GlobalServices/pull/40)
exercises the real admin session, mounted routes, parser, validators, and
PostgreSQL. The PostgreSQL job passed for `f28b20cd` in
[Platform verification](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/45153876874).
These behavioral witnesses leave canonical OpenAPI
and the unresolved-binding counters unchanged pending a runtime-authoritative
projection and consumer verification.
