# PRR-103 — Safe public error boundary

Date: 2026-09-15  
Branch: `feature/production-control-plane-phase-11`  
Base SHA: `407c0390792e75f2d19171d8c6c8d3aedcb62fe9`  
Implementation SHA: `ce994e8b`  
Security-test SHA: `07ff623d`  
Status: **HECHO when the final evidence commit has exact-SHA CI SUCCESS; otherwise PARCIAL**
Migration: **NONE**

## Classification and authority

Task classification:

- Phase: approved PRR wave, PRR-103
- Domain: HTTP/API error boundary, authentication, observability
- Risk: HIGH
- Capability tier: DEEP
- Skills: architecture guardian, backend, security, observability, testing, release, repository audit
- Escalation triggers: public contract break, loss of diagnostic evidence, database schema change, production activation
- Required verification: security/unit HTTP tests, full repository regression, Prisma and clean PostgreSQL replay, RBAC/integration/concurrency, dependency and secret gates, exact-SHA CI

No governance change is required for this slice. Existing architecture already makes application services authoritative, F1 already requires correlated/redacted errors, and GOV-06 already forbids closure without exact-SHA CI. PRR-103 strengthens implementation and evidence without changing architecture, public ownership, Market Policy, payments, CASH or production authority.

## Audited flow map

| Source | Internal exception | Classification | Handler | Public response | Internal evidence |
|---|---|---|---|---|---|
| Controllers/services | domain error with proven 4xx | existing stable status/code | controller or global boundary | compatible flat `error` contract | correlated structured request log |
| Unexpected application error | any Error, hostile/non-Error/null throw | 500 `INTERNAL_ERROR` | global boundary | generic message + safe IDs only | redacted error event/group and incident evaluation |
| Prisma known conflict/missing | P2002/P2003/P2025/P2034 | 409/404 stable mapping | global boundary | no Prisma name/message/meta | redacted categorized telemetry |
| Prisma availability | P1001/P1002/P1008/P1017/P2024 | 503 `SERVICE_UNAVAILABLE` | global boundary | generic outage message | redacted database diagnosis |
| Prisma unknown | any unapproved Prisma code/error | 500 `INTERNAL_ERROR` | global boundary | generic message | redacted unexpected-error evidence |
| Provider timeout/outage | bounded network/SDK availability class | 503 `SERVICE_UNAVAILABLE` | global boundary | provider-neutral message | redacted provider/category evidence |
| Provider unknown | raw SDK/payload/error | 500 `INTERNAL_ERROR` | global boundary | generic message | redacted unexpected-error evidence |
| Authentication | proven invalid authentication/authorization | 401/403 stable code | auth middleware/global boundary | opaque non-enumerating message | bounded denial/error log |
| Readiness probe | reviewed dependency status projection | explicit operational 503 | marked readiness route | bounded statuses, no infrastructure detail | normal health telemetry |

The audit covered global middleware, all controllers, customer/admin authentication, Prisma classifications, Stripe/Cloudinary/email/push/AI adapters, upload routes, workers, Admin APIs and public/mobile APIs. Direct unexpected controller catches were changed to `next(error)` so error reporting is not bypassed. Remaining `error.message` response uses are guarded, proven 4xx outcomes and still pass through the central response serializer.

## Public contract and compatibility

The permanent response remains the existing flat schema:

```json
{
  "error": "An unexpected error occurred.",
  "code": "INTERNAL_ERROR",
  "requestId": "safe-request-id",
  "correlationId": "safe-correlation-id"
}
```

Dependency outages use HTTP 503, `SERVICE_UNAVAILABLE` and `The service is temporarily unavailable.`. The serializer removes unexpected 5xx fields rather than trusting their names and recursively scrubs internal-looking values from 4xx details. It never returns stack, SQL, Prisma metadata, paths, environment values, secrets/tokens, provider payloads, internal URLs or trace/span identifiers.

Consumer audit result: no migration is required. Client and Professional already prioritize `data.error` and fall back to `data.message`; Admin Web does the same and already reads `code`/`correlationId`; Public Web has no dependency on either error field. Preserving `error` therefore avoids a contract break and prevents a second permanent schema.

## Authentication and observability

Customer authentication already used a dummy password hash. Administrative sign-in now does the same and emits one identical 401 result for unknown account, inactive account, incorrect password and absent active RBAC assignment. Infrastructure failures are forwarded and cannot masquerade as bad credentials.

The terminal handler records category, stable code, request ID, correlation ID, route template and status. For 5xx it continues through the existing redacted error-event/group/incident pipeline. Request bodies are not added, secrets/PII/payment fields remain subject to central telemetry redaction, and public trace/span data is not emitted. This preserves diagnosis without making the public response a logging channel.

## Security and HTTP evidence

`backend/test/error-security.test.js` exercises generic/stack/nested/hostile errors, simulated secrets, SQL, paths, all non-Error forms, known and unknown Prisma errors, provider timeouts/raw errors, validation/auth/forbidden/conflict/rate limits, a real ephemeral Express boundary, controlled DB/service/provider/auth failures, and a serialized-body sensitive-pattern matcher. `backend/test/admin.test.js` verifies administrative enumeration resistance.

Local evidence completed before this record:

- Backend unit/HTTP suite: 264 passed, 0 failed.
- Backend syntax: 196 JavaScript files passed.
- Consumer source audit: Client, Professional, Admin Web and Public Web compatible without changes.
- Static 5xx response audit: no remaining direct `res.status(500)` in backend source; unexpected catches forward to the terminal boundary.

Completed verification on implementation/evidence SHA `25d5fa586dcf93c11de26f3fdc81dd6a35f204e7`:

- full `npm run verify`: PASS;
- Backend: 264 passed, 0 failed; syntax passed for 196 files;
- Admin Web: lint PASS, 15/15 tests PASS, production build PASS;
- Public Web: lint PASS, 4/4 tests PASS, production build PASS;
- Client: typecheck PASS, 4/4 tests PASS;
- Professional: typecheck PASS;
- Prisma 7.10.0: format PASS, validate PASS, generate PASS;
- dependency audits: root, Backend, Admin Web, Public Web, Client and Professional each reported 0 vulnerabilities;
- tracked-tree archive scan: 0 findings with checksum-verified Gitleaks 8.30.1;
- full-history scan: 0 findings with checksum-verified Gitleaks 8.30.1;
- [Platform verification #40](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34966391589): SUCCESS for exact SHA `25d5fa586dcf93c11de26f3fdc81dd6a35f204e7`;
- CI Build/unit/contract gate: SUCCESS;
- CI PostgreSQL 17 clean migration replay, Prisma generation, reviewed migration deploy, migration status/baseline audit, RBAC synchronization and integration/concurrency suite: SUCCESS;
- CI full-history secret scan: SUCCESS, no leaks detected.

The local machine had no running Docker engine, so no local database target was used. The required clean database evidence comes from the isolated PostgreSQL 17 CI service above; no unknown, shared or production database was touched.

## Debugging and rollback

For an incident, search authorized telemetry by the returned `requestId` or `correlationId`, then use the grouped error event and incident record. Never ask a customer to send credentials, tokens or a full request body. A 503 indicates a classified dependency availability failure; an unexpected failure remains 500 even outside production.

Rollback is application-only: revert the PRR-103 implementation and test commits together, retain all error/incident evidence, and redeploy only through the normal reviewed release path. There is no schema rollback because Migration is NONE. Production, Markets and CASH remain OFF; this work grants no activation authority.

## Final closure gate

This record update creates the final evidence commit. PRR-103 remains PARCIAL until Platform verification is green for that exact final SHA. Once verified, the conditional status above becomes HECHO without changing code, schema, runtime flags or production state. The tracker projection may then move to 100%/HECHO and must link the exact run.
