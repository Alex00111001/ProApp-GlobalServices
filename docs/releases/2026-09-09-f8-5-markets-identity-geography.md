# F8.5 Markets, Identity and Geography release evidence

## Release identity

- Branch: `feature/markets-identity-geography-phase-8-5`
- Base F8 SHA: `dc17780b0d026b422a9917c0bfbc20c0edddcbda`
- Architecture/ADR: `c68cd572c9ca0467186a03e9834a013aaa6ca68d`
- Backend/domain implementation: `0b4bd43a`
- Product surfaces: `bc5bb4eb`
- Documentation/release revision: pending publication
- Status: **closure candidate; remote CI pending**
- Production activation: **NO**
- F9 resumed: **NO**
- F10 started: **NO**

## Delivered controls

- Explicit Country versus operating Market model, disabled-by-default lifecycle and immutable reviewed Market Policy versions.
- Closed ES/BR/CL identity adapters, randomized AES-256-GCM protection, independent keyed lookup digest, generic duplicate response and masked-only privileged reads.
- Deterministic official geography manifests, provenance/checksums, hierarchy validation, idempotent import and immutable change evidence.
- Normalized Address and independent division-based ProfessionalServiceArea, with ownership and cross-market checks.
- Server-authoritative Registration Schema consumed dynamically by Client and Professional; no frontend owns national validation rules.
- Admin Markets lifecycle, four-eyes policy review, official import evidence and permission-derived access.
- Additive F6/F7/F8/F3 market relations while preserving existing public contracts and each phase's authority boundary.
- Forced RLS/default deny, narrow RBAC, audit evidence, redaction and bounded telemetry.
- Feature flag off and ES, BR and CL seeded `DISABLED`; no production or market activation.

## Migration

`202609090001_markets_identity_geography` is additive. It introduces the F8.5 tables and nullable compatibility relations, performs explicit compatibility backfills, forces RLS on every new table, and revokes Supabase API-role access. It never resets data, drops a legacy field or activates a market.

## Official geography evidence

| Country | Official source/reference | Rows | Normalized SHA-256 |
| --- | --- | ---: | --- |
| ES | INE relation 2026-01-01 | 8,203 | `d96b1280f8783de15ec30fcccf8a6cde75d55dd4ac4db046f5d4979b329953bb` |
| BR | IBGE Localidades retrieved 2026-09-09 | 5,598 | `6fe816d78db0e3f0899ad8afc0817b05057bdc258cfe9e94cfda04af47fe7d57` |
| CL | SUBDERE CUT 2018 v04 | 418 | `0cfb59bb34114c83170d6dd7c2f96b0f3da15e6ff0b4435d78dd9f590f9ba4c4` |

The Chilean snapshot remains activation-blocked until the official CUT relation is rechecked against newer SUBDERE boundary cartography and qualified territorial/legal review confirms it is current for the intended purpose.

## Requirement-to-evidence matrix

| Requirement | Control | Evidence |
| --- | --- | --- |
| Country/Market separation | distinct schema, lifecycle and policy resolution | Prisma schema, ADR 0004, market service tests |
| Server-authoritative national rules | closed adapters and declarative schema | arbitrary-market frontend test + ES/BR/CL adapter tests |
| Protected identity | randomized encryption, keyed lookup, masked projection | crypto/adapter tests + PostgreSQL scenario |
| Duplicate/cross-market resistance | generic conflict, ownership and market checks | service/route tests + integration scenario |
| Official hierarchical geography | deterministic manifests, parent/type validation | offline manifest validator + hierarchy tests |
| Safe import/change lifecycle | digest/idempotency/change evidence | admin service tests + integration scenario |
| Four-eyes policy activation | author cannot review; digest/evidence gates | policy lifecycle unit and integration tests |
| Address versus service area | separate normalized aggregates | schema/service tests + Client/Professional typechecks |
| F3/F7/F8 preservation | references rather than duplicated authority | compatibility tests and architecture review |
| RBAC/audit | narrow permissions and masked-read audit | 401/403 and audit integration assertions |
| RLS/default deny | forced RLS and revoked public roles | migration contract + PostgreSQL RLS gate |
| Observability/privacy | bounded labels and recursive sanitizer | unit tests and observability documentation |
| Rollout/rollback | off-by-default flag and application-first rollback | config tests, runbook and migration seed state |

## Local verification evidence

- Offline official-geography validation passed for ES 8,203, BR 5,598 and CL 418 normalized rows.
- Prisma format/validate/generate passed using a non-live validation URL.
- Backend build/syntax passed for 152 JavaScript files.
- Backend unit/contract regression passed: 153/153.
- Admin Web lint, 9/9 tests and production build passed.
- Client TypeScript and its dynamic Registration Schema test passed: 1/1.
- Professional TypeScript passed.
- Full root verification, dependency audits, working-tree secret scan and remote PostgreSQL/Supabase-compatible CI evidence are pending this release-record publication.

## Closure gates still pending

- Apply every migration to a clean isolated PostgreSQL 17 database and run all integration scenarios, including the focused F8.5 fixture.
- Prove forced RLS/default deny and unchanged backend bypass behavior in that database.
- Run all five dependency audits and the working-tree/full-history secret scans.
- Publish this branch and obtain a completely green GitHub Actions Platform Verification run for the final documentation revision.
- Update the development control record to `HECHO` only after the exact CI evidence is recorded.

## Residual risks and activation blockers

- No qualified Legal/Compliance approval exists for final identity, retention, passport, tax or payment policy in any market.
- Chile requires the official-source freshness check described above.
- Identity-key provisioning and rotation/re-encryption rehearsal have not occurred in production-like infrastructure.
- Store-signed mobile builds, physical-device onboarding and operational load/soak remain later release-readiness gates.
- No production deployment or market activation is authorized by this record.

This revision remains **PARCIAL** until every closure gate is green. F9 is preserved and paused; even after F8.5 closes it becomes dependency-ready only and requires a new explicit instruction to resume.
