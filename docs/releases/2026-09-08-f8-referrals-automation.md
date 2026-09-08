# F8 Referrals & Automation release evidence

## Release identity

- Branch: `feature/referrals-automation-phase-8`
- Base: `95ce43b6b4c02639963a6461a100b59d934326ed`
- Core implementation: `ac563c4c94e9a9d3e6ec498af113c11941b4e5a1`
- Implementation closure: `d942507be7bbe9ab13ed110faa046762b41f7136`
- Security closure: `782c2c4a1a91fb6a842205d3a2bf58c8bc7ec9df`
- Documentation/release revision: pending publication
- Production activation: **NO**
- F9 started: **NO**

## Delivered controls

- Versioned referral programs, safe opaque codes, server-owned claims, strict lifecycle and explainable anti-fraud.
- Authoritative `booking.completed` conversion linked to F6 evidence, with cancellation/refund reversal.
- Versioned rewards with concurrent idempotency and explicit F3 boundary; fulfillment and real money disabled.
- Versioned trigger/condition/action definitions with closed registries and no arbitrary code/HTTP.
- Independent database-backed outbox fan-out, leased workers, exactly-once-effect keys, bounded retry/backoff and terminal dead-letter evidence.
- Current F7 consent enforcement for purpose-bound actions.
- F4 RBAC/admin sessions/audit, F5 Operations visibility, F2 metrics/redaction/correlation.
- Client, Professional and Admin Web API-only surfaces without permanent mocks.
- Additive constraints/indexes/restrictive FKs and forced RLS/default-deny Supabase grants.

## Migrations

- `202609080001_referrals_automation`
- `202609080002_referrals_automation_force_rls`

Both were applied with `prisma migrate deploy` to the configured Supabase test environment. `prisma migrate status` reports 21 migrations and an up-to-date schema. Production was not targeted.

## Verification evidence

- Root `npm run verify`: passed.
- Backend syntax/build: 140 JavaScript files passed; Prisma Client 7.10 generated.
- Backend unit/contract regression: 139/139 passed, including 16 focused F8 tests.
- PostgreSQL/Supabase integration regression: 15/15 passed in a clean full-suite run.
- Focused F8 PostgreSQL/Supabase scenario: 2/2 passed after final concurrency-priority hardening.
- F8 scenario proves one claim/use under concurrent replay, one automation execution/step/effect under two workers, restricted ledger boundary, and 401/403 plus denial audit.
- Admin Web: lint passed, 8/8 tests passed, TypeScript/Vite production build passed.
- Client: TypeScript passed; Jest had no test files and exited successfully under `--passWithNoTests`.
- Professional: TypeScript passed.
- RLS: every application table enabled and forced; `anon` and `authenticated` retain no public-schema/table grants; trusted backend role bypass verified.
- Dependency audits: all five npm surfaces report zero vulnerabilities.
- Tracked working-tree Gitleaks 8.24.3 scan: approximately 1.90 MB scanned with no leaks.
- Published-branch Gitleaks 8.24.3 history scan: 97 commits and approximately 295.55 MB scanned with no leaks before this release-record-only commit. Two pre-rewrite commits remain reachable only through the local, unpushed `refs/stash`; they are absent from the branch and are not part of published history.
- [Platform verification 34256942669](https://github.com/Alex00111001/ProApp-GlobalServices/actions/runs/34256942669): build/unit/contract, clean PostgreSQL migrations/integration and Secret Scan all passed.

### Secret-scan compatibility closure

Platform verification run `34221356002` passed build/unit/contract and PostgreSQL migration/integration, but its Gitleaks 8.24.3 job reported one `generic-api-key` finding in implementation commit `ac563c4c`, line 124 of `backend/test/referrals-automation.test.js`. The extracted value, `claim-revoked-1`, is a deterministic idempotency-key fixture and not a credential.

The former global `regexTarget = "match"` entry was insufficient because `match` evaluates the complete detector match (including the `idempotencyKey` assignment), not only the extracted secret. In addition, Gitleaks 8.24.3 represents the global exception as the single `[allowlist]` table; top-level `[[allowlists]]` arrays are not consumed by that version. The closure therefore extends only the existing `generic-api-key` rule via `[[rules.allowlists]]`, targets `secret`, and anchors the exact fixture with `^claim-revoked-1$`. It does not exempt a path, commit, identifier family, detector or history range.

`node scripts/verify-gitleaks-allowlist.cjs <gitleaks-8.24.3-binary>` is the reproducible negative-control procedure. It proves that the exact fixture is classified while `claim-revoked-2` and a runtime-generated high-entropy value assigned to `idempotencyKey` are both still reported by `generic-api-key`. The original failing three-commit range and the complete published branch history were scanned separately with the same 8.24.3 binary and configuration. Replacement run `34256942669` passed its full-history checkout Secret Scan.

The final regression also replaced a fixed-date identity proof in one F7 unit test with a proof issued at test execution time. This prevents calendar-driven expiry without changing the production TTL, verification logic or any runtime policy.

## Defects found by real database rehearsal

The first F8 Supabase run exposed missing initial `ReferralProgramVersion.version` and missing `ReferralCode.idempotencyKey` writes. Both were corrected before the implementation commit. Durable fan-out also revealed that F1–F7 integration teardowns had to delete dependent delivery rows explicitly; tests were updated without destructive cascades. The RLS gate detected enabled-but-not-forced F8 tables, resulting in the dedicated FORCE RLS migration. No defect was waived.

## Requirement-to-evidence matrix

| Requirement | Control | Evidence |
| --- | --- | --- |
| Program/code lifecycle | optimistic transitions, HMAC code, expiry/revocation/limits | focused unit tests + PostgreSQL scenario |
| Self/circular/spoof/replay prevention | server identity, advisory locks, unique constraints | unit claim matrix + concurrent integration |
| Authoritative conversion | persisted booking event and F6 reference | service contract, schema constraints, tests |
| Reward idempotency/reversal | unique referral/side and source event | unit lifecycle tests + migration constraints |
| F3 boundary | fulfillment rejected; financial intent only | unit test + integration ledger-reference assertion |
| Versioned automation | immutable version/digest and activation validation | definition tests + schema constraints |
| Safe conditions/actions | closed registries, bounds, sanitizer | injection/registry unit tests |
| Exactly-once effect | fan-out uniqueness, execution/step keys, transactional action | two-worker PostgreSQL scenario |
| Retry/dead-letter | leases, bounded retry, safe errors, terminal states | unit retry/redaction tests + Admin views |
| Consent | latest F7 decision checked at action time | focused tests + unchanged F7 regression |
| RBAC/audit | narrow permissions and F4 sessions | 401/403 integration and audit assertion |
| RLS/default deny | forced RLS and revoked API-role grants | full PostgreSQL RLS suite |
| UX | real API screens on three surfaces | Admin tests/build + both mobile typechecks |
| Observability/privacy | F2 metrics/correlation/redaction, no PII labels | unit checks and architecture review |

## Residual risks and blocked activation items

- No production feature flag, worker, reward fulfillment, financial command handler or manual replay is enabled.
- Account-credit fulfillment requires a future separately authorized F3 command handler and reconciliation policy; this is an explicit product boundary, not an incomplete F8 execution path.
- Program terms, reward tax/accounting treatment and jurisdiction-specific eligibility require qualified Finance/Legal approval before production.
- Capacity/retention thresholds for one delivery per outbox event require load evidence and an approved retention procedure before production.
- Store-signed mobile builds, physical-device share flows and production-like worker soak remain release-rehearsal gates.
- Client currently has no Jest component files; typecheck and API-contract coverage pass, but device/UI automation remains a later release-rehearsal requirement.

This revision is the F8 closure candidate. It becomes final only if its own remote GitHub Actions run is completely green; any regression keeps F8 partial and reopens correction.
