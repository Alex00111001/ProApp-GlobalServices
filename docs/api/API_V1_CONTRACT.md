# API v1 contract — publication blocked (PRR-105)

This is an engineering inventory, not an approved OpenAPI contract or a production-readiness certificate. The runtime authorities are mounted Express routes/middleware and their Zod validators. No independent manual response-schema authority is introduced.

## Reproduction and checks

From the repository root:

```sh
npm --prefix backend run api:inventory:generate
npm --prefix backend run api:inventory:check
npm --prefix backend test
npm run verify
```

`route-inventory.v1.json` is deterministic source-derived evidence. It includes route classifications, validation bindings, middleware, response observations and consumer call sites. `completeSchema: false`, `UNPROVEN` and `NOT_PROVEN_BY_PATH_MATCH` are intentional blockers, not warnings that establish compatibility. A matching path/method does not prove response, enum or pagination compatibility.

CI rejects a stale inventory and exercises source-inventory tests. The isolated PostgreSQL job additionally exercises payment-intent/capture concurrency using real application services and database transactions; only external provider I/O is replaced. This acceptance check must not be skipped or softened to close PRR-105.

## Versioning boundary

`CANONICAL_V1` identifies existing non-admin `/api/v1` routes. Administrative, internal and webhook operations remain separately classified; the inventory is not public API publication. Legacy routes remain supported and are not removed here. Registration normalizes `name` into canonical name fields; booking normalizes `zipCode` and `scheduledTime` and consumes those aliases before strict validation. Unknown fields remain rejected. Bodyless cancellation/rejection retains the existing optional-reason behavior.

An approved v1 baseline still requires complete input/output/error/auth/pagination parity. Endpoint removal, narrowing accepted inputs, adding required inputs, incompatible output/status/auth changes and incompatible enum changes require explicit versioning/security review. Compatible optional additions may remain v1 after consumer verification. Deprecation requires an explicit support policy, replacement, consumer migration evidence and removal approval; no v2 or legacy removal is introduced.

## Remaining acceptance work

- Publish a valid generated OpenAPI 3.1 contract without losing Zod transforms or cross-field rules.
- Establish authoritative response projections and PRR-103 safe-error parity, not just observed top-level fields.
- Verify pagination defaults, bounds, ordering/tie-breakers and empty/next-page behavior.
- Resolve dynamic consumer calls and verify required fields, responses, enums and pagination for all four actual consumers.
- Protect an approved contract baseline and wire the breaking-change detector into a complete contract gate. Its current unit tests alone do not establish that gate.
- Execute isolated PostgreSQL financial acceptance and record exact-SHA CI and all security/regression evidence.

Never publish raw provider/database errors, infrastructure values, credentials or real personal examples. The source inventory contains repository-relative evidence locations and is not a public OpenAPI artifact.

## Rollback and delivery

No migration, deployment, market activation or financial-provider configuration change is included. Revert reviewed compatibility/inventory commits if necessary; preserve existing error/validation gates. Observe validation/error rates and booking cancellation/rejection failures before any separately authorized release. Production, Markets and F11 remain paused; CASH remains retired. PRR-105 stays PARCIAL until every acceptance gate is verified.
