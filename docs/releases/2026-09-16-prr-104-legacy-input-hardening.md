# PRR-104 — Legacy HTTP input hardening

- Date: 2026-09-16
- Branch: `feature/production-control-plane-phase-11`
- Status: **IMPLEMENTED — EXACT-SHA CI PENDING**
- Phase: PRR-1 / PRR-104
- Domain: Legacy Express HTTP input boundary, booking/payment compatibility, administration
- Risk: HIGH
- Migration: NONE
- Production, Markets and live money: OFF / not authorized

## Model routing decision

- Mandatory design/final-review tier: DEEP, because this touches a public card-payment input boundary and authorization-sensitive legacy APIs.
- Selected model: `gpt-5.6-sol` for design and final review. The bounded controller conversion and deterministic regression fixture are eligible for `gpt-5.6-terra` only after that review.
- Lower-tier exclusion: Luna cannot own this task because malformed input must be proven unable to reach payment, persistence or privileged administrative operations.
- Escalation triggers: any public compatibility disagreement; a payment/provider call before validation; a migration, authorization or state-transition change; or two non-mechanical verification failures.
- Required evidence: negative pre-persistence tests, backend regression, repository verification, exact-SHA CI, no migration, and no provider/live-money operation.
- Resolved execution model: **NOT SELECTABLE BY THIS RUNNER**. The current task inherits its runner; this record states the required model and does not claim an unperformed model switch.

The routing policy now requires this record for each meaningful sub-task and maps deterministic work to Luna, bounded approved implementation to Terra, and security/payment/privacy/production review to Sol; Astra is reserved for evidenced exceptional escalation.

## Delivered boundary

The shared validator module applies typed, bounded request contracts before side effects in these legacy surfaces:

- booking lookup, client/professional list, confirm, reject, start, complete and cancellation;
- card payment intent creation/confirmation and payment history;
- notification list/read/delete and favorites list/create/toggle/check/remove;
- public/admin category identifiers and category create/update bodies;
- pending document queue, document approve/reject and audit-log list.

Pagination now rejects non-integers, zero/negative values, over-limit requests and unknown query fields. Booking status filters use the closed persisted status set. Resource identifiers are UUIDs. Category creation/update rejects undeclared fields, unsafe text/control characters, invalid slugs and non-HTTPS icon URLs. Existing cancellation/rejection reason trimming is retained and the existing public validation responses for card input, favorite input and document rejection remain compatible.

Invalid input terminates before a Prisma operation; invalid card payment input terminates before the owned booking lookup and therefore before a Stripe call. Valid requests retain their existing authorization, ownership, booking state transition, provider, transaction, idempotency, ledger and audit behavior.

## Verification before remote CI

- `node --test test/legacy-request-validation.test.js`: 2 passed, 0 failed. The test replaces persistence entrypoints with throwing sentinels and proves malformed booking, notification, payment, favorite, category and administrative requests do not reach them.
- `npm test` in `backend`: 266 passed, 0 failed, 0 skipped.
- `npm run verify` from the repository root: passed, including secret-fixture scan, market geography validation, Prisma client generation, backend syntax/tests, Admin Web lint/tests/build, Public Web lint/tests/build, Customer Mobile typecheck/tests and Professional Mobile typecheck.
- Syntax validation passed for every touched backend controller and validator.
- `git diff --check`: passed.

The Admin Web production build retains a pre-existing non-blocking Vite warning that its main JavaScript bundle is slightly above 500 kB. The build succeeds; bundle splitting remains a separately tracked performance concern and is not hidden by this delivery.

## Compatibility, rollout and rollback

This is an application-only, fail-closed hardening change. No schema, migration, data backfill, feature flag, provider configuration, Stripe command or financial state is modified. Invalid clients receive `400`; valid clients keep the same paths and successful response shapes. The only intentional restriction is that previously malformed, oversized or unknown input is rejected instead of reaching an internal Prisma/provider failure.

Rollback is an application revert of this commit set. It must be considered only for an evidenced valid legacy client incompatibility; it must not reintroduce a path that permits malformed input to invoke Stripe or persistence. Reintroducing an unbounded compatibility variant requires a new reviewed contract.

## Closure gate

This record remains open until the delivery commit SHA and its successful Platform verification run are added. A later evidence-only commit must itself receive exact-SHA CI before the technical stage can be marked complete.
