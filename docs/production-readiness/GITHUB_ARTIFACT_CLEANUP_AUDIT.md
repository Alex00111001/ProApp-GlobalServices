# GitHub artifact cleanup audit

Date: 2026-09-16  
Branch: `feature/production-control-plane-phase-11`  
Audited SHA: `b2ae55aeba99a17cf657c3489bd21c29f8494eee`  
Scope: refreshed origin branch heads, tags, reachable history, and advertised PR heads  
Risk: CRITICAL for history rewrite; HIGH for repository hygiene  
Status: AUDIT COMPLETE / CLEANUP PENDING AUTHORIZATION

## Confirmed findings

24 remote branch heads and zero tags were audited after `git fetch origin --prune`.
The current development branch and `main` have zero dependency/cache/environment artifact findings.
Six legacy branch tips still contain prohibited generated content:

| Branch | Suspect paths | Content |
|---|---:|---|
| `expo-build-error-fix-12f61` | 43,285 | mobile dependency tree |
| `prisma-boolean-filter-issues-5e7b0` | 43,285 | mobile dependency tree |
| `migrating-react-navigation-to-expo-router-48e48` | 8,059 | mobile dependency tree |
| `home-services-platform-58707` | 946 | root dependency tree |
| `error-correction-on-screens-794bd` | 3 | Expo cache |
| `react-native-forwardref-error-cf577` | 3 | Expo cache |

Reachable history contains 51,641 unique suspect paths, predominantly `node_modules` and `.expo`,
plus a generated Android debug keystore. These counts are path inventories, not unique file blobs.
No current branch-tip `.env` finding was returned. This does not prove that GitHub-retained old PR
history or cached commit views have been physically purged.

GitHub advertises 36 read-only `refs/pull/*/head` refs. Locally available PR heads 17-25 and 33-35
still contain dependency/cache artifacts; some PR objects were unavailable locally and remain
unverified. The existing sensitive-history runbook records a prior `.env` purge but requires GitHub
Support to dereference PR refs and remove cached views. No support ticket or completion evidence was
found in repository documentation.

## Required cleanup sequence

1. Obtain explicit authorization to rewrite published history while preserving application source,
   migrations, tests, documentation, and branch names.
2. Create an access-restricted temporary backup and immutable old/new ref map in an isolated mirror;
   never overwrite the shared working tree or restore tainted history to origin.
3. Remove dependency directories and Expo caches from every branch's history. Review the generated
   debug keystore separately; no production signing key is in scope for deletion.
4. Remove secret-shaped synthetic test literals without weakening their runtime assertions.
5. Verify allowed source-tree changes only, zero prohibited paths, secret scans, and representative
   branch functionality. Rewritten SHA identities invalidate prior exact-SHA CI evidence, so rerun
   required CI for the final development SHA.
6. Push only the approved branch ref map using explicit per-ref leases. Do not use an unrestricted
   mirror push and do not deploy production.
7. Obtain action-time authorization and submit a GitHub Support sensitive-data-removal request for
   affected read-only PR refs and cached commit views; include no secret values.
8. Verify from a fresh clone after Support confirms server-side purge, publish recovery instructions,
   and close alerts only with a truthful disposition and linked evidence.

## Prevention delivered

- `node_modules/` and `.expo/` are ignored.
- Current tracked-tree guard covers Stripe webhook and Google API key shapes, dependency/cache
  directories, and real environment files. It fails closed if a tracked file cannot be inspected,
  reports no values, and runs in required root verification.
- Implementation commits `5779a9b4` and `b2ae55ae` were pushed with exact-SHA CI #43 and #44 SUCCESS.
- Root regression: backend 264/264; Admin 15/15; Public 4/4; Client 4/4; Professional typecheck; all six
  dependency audits report zero vulnerabilities.

Production, Markets and CASH remain OFF; F11 runtime and PRR-102 remain unstarted. This audit is not
a completed historical purge and does not close the independent GitHub Support gate.

## CI reader correction

Platform verification #45 correctly failed because the new filesystem reader attempted to read a
tracked directory symlink as an ordinary file on Linux. The two `backend/.claude/skills` links point
to registered skill directories inside the repository; they are not dependency/cache artifacts.
The reader now inspects the symlink target text with `readlinkSync` and never dereferences it.
Unreadable ordinary tracked files still fail closed; no path or secret allowlist was added.
