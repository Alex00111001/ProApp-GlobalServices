# PRR-101 CASH compatibility retirement — evidence record

- Date: 2026-09-16
- Phase: PRR-1 / PRR-101
- Status: **TECHNICAL IMPLEMENTATION COMPLETE — RESIDUAL HUMAN REVIEW OPEN**
- Risk: HIGH
- Capability tier: DEEP
- Base SHA: `d74b27c2b6378e4207a2264b234148e9b53cdcc0`
- Architecture commit: `9562dac0fff98b364098601c5343cf1ebba49c8d`
- Implementation SHA: `8053e85fef1f2093a4d6cb260f65a6b7899f52d0`
- Exact-SHA CI: [Platform verification #57](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/35098194354) — SUCCESS
- Migration: NONE
- PostgreSQL behavioral change: NONE
- Production/Markets/live money: not authorized and not activated
- PRR-102: rejected for the Option B scope; no CASH workflow implementation started

## Delivered decision artifacts

- [ADR 0010 — governed CASH workflow](../adr/0010-governed-cash-payment-workflow.md), accepted for
  Option B compatibility retirement;
- [D01–D17 decision matrix](../production-readiness/PRR-101-CASH-DECISION.md), with the recorded
  permanent-removal decision;
- [Option B compatibility-retirement plan](../production-readiness/PRR-101-CASH-RETIREMENT.md);
- [approval packet](../production-readiness/PRR-101-APPROVAL-PACKET.md), retained for residual review;
- the ADR index and PRR execution-plan projection.

The recorded product decision is permanent removal of CASH. The client no longer offers a CASH action or
calls a CASH API; the old route is a no-store authenticated `409 CASH_PAYMENT_DISABLED` compatibility
rejection which reaches neither PostgreSQL nor a provider. Existing historical CASH values remain read-only
evidence. This does not activate a Market, production, a provider or live money.

## Verification evidence

For implementation SHA `8053e85fef1f2093a4d6cb260f65a6b7899f52d0`, local `npm run verify` completed
successfully:

- Backend: 264 passed, 0 failed, 0 skipped;
- Admin Web: 15 passed and production build successful;
- Public Web: 4 passed and production build successful;
- Client Mobile: 5 passed and typecheck successful, including the rendered checkout regression proving
  CASH is absent and card checkout still follows the provider-backed flow;
- Professional Mobile: typecheck successful.

`git diff --check`, required secret/hygiene checks, Prisma validation and the repository verification gate
passed. No migration or production configuration changed.

Platform verification #57 ran the exact implementation SHA and completed all jobs successfully:

- Build, unit and contract gates: SUCCESS;
- PostgreSQL migrations and integration gates: SUCCESS;
- Secret scan (Gitleaks): SUCCESS, with `No leaks detected`; artifact
  `gitleaks-results.sarif` is retained by CI (SHA-256
  `5a0f6d4c2864e0a54278c004df1b7cea0f2be4c2ad649c964defae1b52a389fa`).

## Governance and residual gates

ADR 0010 is the required governance artifact because the original CASH direction could have changed a
provider strategy, financial invariant, security boundary and Market policy. The accepted Option B records
the narrower retirement decision. Existing `MODEL_ROUTING.md`, skill catalog and PostgreSQL/API-only
architecture remain sufficient and were not changed.

The technical code stage is closed by the exact-SHA CI above. Qualified Legal/Privacy review remains
required before public removal communication or deletion of the legacy compatibility endpoint; Support must
also name the minimum supported client version and support window. Those residual items keep the overall
production-release gate open. They do not reopen CASH, authorize PRR-102, activate a Market or authorize
production/live money.

Rollback is application-only: correct a presentation defect while retaining the legacy denial. It must not
restore a mutating CASH command or offer. Reintroducing CASH requires a new accepted ADR and the complete
governed-CASH workflow; it is not a rollback of this retirement.
