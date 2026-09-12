# PRR-0 cash payment quarantine — release evidence

- Date: 2026-09-12
- Phase: PRR-0
- Domain: Payments, Booking, Security, Legal/Privacy, Operations
- Risk: CRITICAL
- Capability tier / model: DEEP / operator-selected Codex
- Skills used: payments, booking-engine, security, database-prisma, backend-fastapi,
  architecture-guardian, testing, release, legal-compliance
- Escalated: yes; repository commit and push were explicitly authorized
- Implementation commit: `4aa4718f7f5018f77d33802e506099d0bcad998c`
- Delivery reference: [GitHub commit](https://github.com/Alex00111001/ProApp-GlobalServices/commit/4aa4718f7f5018f77d33802e506099d0bcad998c)
- Exact-SHA CI: [Platform verification #34](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34710574714) — SUCCESS
- Migration: not applicable; containment is application/configuration only and changes no data
- Feature flag / rollback: `CASH_PAYMENT_ENABLED=false` is mandatory; rollback must preserve the deny path

## Delivered controls

- The authenticated legacy `POST /api/payments/cash` contract remains addressable but returns HTTP `409`,
  `CASH_PAYMENT_DISABLED` and `Cache-Control: no-store`.
- Rejection occurs before booking reads, payment writes, booking state changes, transactions or provider calls.
- Configuration defaults the cash capability off and refuses application startup if anyone sets the flag to
  `true` before a governed workflow is accepted.
- The runbook defines verification, incident handling and a no-regression rollback boundary.
- ADR 0009 and the billing roadmap now require future cash eligibility to be limited to professionals with
  a reusable provider-tokenized card for platform usage fees, versioned market-specific consent, required
  setup authentication and no blocking debt/risk state. No PAN/CVC is stored and card registration is not
  treated as successful collection.

## Tests and evidence

Local checks executed before commit:

- `node --test test/cash-payment-quarantine.test.js test/foundation.test.js`: 16/16 passed.
- `npm test` in `backend`: 248/248 passed.
- `node --test test/cash-payment-quarantine.test.js test/foundation.test.js test/http-contract.test.js`:
  28/28 passed after adding the route authentication regression.
- `npm run verify`: passed across backend, Admin Web, Public Web, Client Mobile and Professional Mobile.
  Backend geography manifests remained deterministic (ES 8,203; BR 5,598; CL 418), backend tests passed
  248/248, Admin Web passed 15/15, Public Web passed 4/4, Client Mobile passed 4/4, and all builds/typechecks
  completed successfully.
- `git diff --check`: passed.

GitHub Actions run #34 verified the exact implementation SHA:

- Build, unit and contract gates: SUCCESS (1m32s).
- PostgreSQL migrations and integration gates: SUCCESS (1m03s).
- Secret scan: SUCCESS (13s).
- Gitleaks artifact digest:
  `sha256:0db6af4b358c7683222006e15c248811dc0e6ac70a9b5146f9b91771604f62a5`.

## Acceptance gate

PRR-002 is satisfied when this evidence record is itself committed, pushed and verified by CI for its exact
SHA. The unsafe cash mutation is no longer executable by application traffic. This stage does not claim a
cash-settlement workflow, historical data correctness, live provider activation or production deployment.

## Remaining PRR-0 work

- Execute and retain the aggregate-only, repeatable-read, read-only impact inventory (PRR-003).
- Link the final inventory evidence and exact-SHA CI in Notion before marking PRR-0 complete.
- Keep cash absent from client payment choices until the future workflow and all market/legal/provider gates
  are separately approved and verified.
