# Secret-scanning alert 2 remediation evidence

Date: 2026-09-16  
Branch: `feature/production-control-plane-phase-11`  
Domain: Security / Observability  
Risk: HIGH  
Capability tier: DEEP  
Production activation: NO  
Markets activation: NO  
CASH activation: NO

## Finding

GitHub secret scanning alert 2 classified a Stripe webhook signing-secret-shaped value in
`backend/test/observability.test.js` as a public leak. The value was a deterministic synthetic
redaction fixture, not an application credential: it used an obvious sequential test pattern,
appeared only as test input, had unknown validity, and the same fixture is present in unrelated
public repositories. No production, staging, preview, or local secret store was read or changed
during this review.

The alert points to historical commit `d4e04ec7a737494ad06d6d1d257d3f3f3fb8b189`, which is no
longer reachable from a current local or remote branch. A semantically equivalent test fixture was
still present on active feature-branch history, so treating the alert as harmless without changing
the repository would leave the false-positive pattern available to future scanners.

## Remediation

- Secret-shaped Stripe webhook fixtures are assembled only at test runtime; no complete
  `whsec_...` token-shaped literal remains in the tracked tree.
- The telemetry redaction assertion remains unchanged in behavior and still verifies that a
  Stripe webhook secret is removed from text.
- The production fail-closed configuration test also assembles its invalid webhook credential at
  runtime.
- `scripts/reject-secret-shaped-fixtures.cjs` enumerates Git-tracked files and rejects concrete
  Stripe webhook signing-secret-shaped literals without printing their values.
- The guard is part of the root `npm run verify` path, so the required Platform verification job
  fails before build/test completion if this pattern is reintroduced.

No secret rotation or provider revocation was performed because the detected value is not a real
credential. Rotation of any live secret remains a separate human-authorized operation.

## Verification

- Focused billing and observability tests: 47/47 passed.
- Root verification: passed.
  - Backend: 264/264 tests; syntax check: 196 files.
  - Admin Web: lint, 15/15 tests, production build.
  - Public Web: lint, 4/4 tests, production build.
  - Client: typecheck and 4/4 tests.
  - Professional: typecheck.
- Secret fixture guard: passed with zero tracked findings.
- Dependency audits: zero vulnerabilities on root, backend, Admin Web, Public Web, Client, and
  Professional workspaces.
- Migration: NONE.

## Remote evidence

- Implementation commit: `5779a9b4f49f1057e36a77a9de7061d9473b5bfc`.
- Push: `origin/feature/production-control-plane-phase-11` verified at the implementation commit.
- GitHub Actions: [Platform verification #43](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/35066387108), SUCCESS for the exact implementation SHA.
- Required jobs: build/unit/contracts SUCCESS; clean PostgreSQL migration/integration SUCCESS;
  full-history secret scan SUCCESS with `No leaks detected`.
- Alert disposition: pending explicit human authorization to close GitHub alert 2 as a false positive.

The repository remediation and exact-SHA verification are complete. The alert remains open only as
an external administrative state and must not be interpreted as evidence of a live credential.

## Rollback

Revert the remediation commit. This restores only test-fixture representation and the new CI guard;
it does not change runtime behavior, database state, provider credentials, or environment flags.
