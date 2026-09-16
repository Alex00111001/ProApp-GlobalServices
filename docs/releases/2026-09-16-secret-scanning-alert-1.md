# Secret-scanning alert 1 remediation evidence

Date: 2026-09-16  
Branch: `feature/production-control-plane-phase-11`  
Domain: Security / Repository hygiene  
Risk: HIGH  
Capability tier: DEEP  
Production activation: NO  
Markets activation: NO  
CASH activation: NO

## Finding

GitHub secret scanning alert 1 classified a Google API key embedded in a minified dependency file
under `mobile-client/node_modules/@react-native/debugger-frontend` as a public leak. The file came
from the React Native debugger's vendored Chromium DevTools frontend, not from HomeServices source or
configuration. The same Chromium CrUX key is published in multiple upstream and downstream public
repositories.

The alert points to historical commit `7013db4e595320c61d05eb65fcb34aa8f7d3ae82`. That commit is no
longer reachable from a current local or remote branch. The current tree tracks no file below any
`node_modules` directory, and the repository-level `.gitignore` excludes `node_modules/`.

No production, staging, preview, or local provider credential was read, copied, rotated, revoked, or
changed during this review. The detected value is an upstream public client key, not a HomeServices
credential.

## Remediation

- Confirmed that the dependency tree is absent from the current development branch and `main`.
- The repository-wide ref audit found the alerted dependency path still present in legacy branches
  `expo-build-error-fix-12f61` and `prisma-boolean-filter-issues-5e7b0`; other legacy branches also
  contain dependency/cache artifacts. Historical cleanup is therefore still required.
- Confirmed that dependency directories are ignored and no `node_modules` file is tracked on the
  current development branch.
- Extended `scripts/reject-secret-shaped-fixtures.cjs` to reject concrete Google API key-shaped
  literals as well as Stripe webhook signing-secret-shaped literals.
- The guard reports only file, line, and category; it never prints a detected value.
- The guard remains part of root `npm run verify`, making the CI quality job fail if either pattern is
  reintroduced into the tracked tree.

No key rotation or provider revocation was performed because the finding is not a HomeServices
credential. Changing an upstream public Chromium key is neither possible nor an appropriate
repository remediation.

## Verification

- Current development branch tracked `node_modules` files: 0.
- Secret fixture guard: zero tracked findings for Stripe webhook and Google API key shapes.
- Migration: NONE.
- Implementation SHA: `b2ae55aeba99a17cf657c3489bd21c29f8494eee`.
- [Platform verification #44](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/35066796609): SUCCESS for the exact implementation SHA; build/unit/contracts, PostgreSQL migration/integration and full-history secret scan all passed.

## Alert disposition

GitHub alert 1 remains open pending explicit human authorization to close it as a false positive.
The current development branch is protected independently from that administrative action. The
repository-wide historical dependency cleanup remains open and requires approval for a history
rewrite plus GitHub Support removal of read-only PR refs and cached views.

## Rollback

Revert the guard extension and this evidence record. This does not change application runtime,
database state, credentials, providers, or environment flags.
