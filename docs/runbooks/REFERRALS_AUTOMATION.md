# F8 Referrals & Automation runbook

## Scope

This runbook covers non-production rollout, monitoring, incident diagnosis and application-first rollback for F8. It does not authorize production, money movement, reward fulfillment or manual replay.

## Preconditions

1. Confirm the target is an isolated PostgreSQL/Supabase test or staging environment.
2. Record release owner, target revision and backup/restore point.
3. Run `npx prisma validate`, `npx prisma migrate status` and the clean migration rehearsal.
4. Verify forced RLS/default deny and that the backend role explicitly bypasses RLS.
5. Run root verification, full integration, dependency audits and both secret scans.
6. Confirm F3 financial execution flags remain false and Stripe credentials are test-only.
7. Confirm `AUTOMATION_MANUAL_REPLAY_ENABLED=false` and `REFERRAL_REWARD_FULFILLMENT_ENABLED=false`.

## Staged enablement

1. Deploy the application with `REFERRALS_ENABLED=false`, `AUTOMATION_ENGINE_ENABLED=false`, `AUTOMATION_WORKER_ENABLED=false`.
2. Apply `202609080001_referrals_automation` and `202609080002_referrals_automation_force_rls` with `prisma migrate deploy`.
3. Run `npm run seed:rbac`; verify the F8 permission matrix and 401/403 audit evidence.
4. Create one reviewed feature flag and one `DRAFT` program/version for a test market and actor type.
5. Activate the program with the expected `rowVersion`; enable referrals for a bounded internal cohort.
6. Test code creation, replay, expiry/revocation, self/circular/cross-market rejection and client privacy.
7. Create a `DRAFT` automation using only registered triggers/conditions/actions; inspect its digest and version.
8. Activate it, then start one automation worker. Observe queue age, delivery status and one known test event.
9. Scale workers only after concurrent execution confirms one execution/step/effect.
10. Keep account-credit rewards held/approved only; verify no ledger count/change is attributable to F8.

## Normal diagnosis

Start from `correlationId`, `traceId` or source `eventId`—never from personal data.

1. Locate the source `OutboxEvent` and `AutomationEventDelivery`.
2. If delivery is `PENDING`, inspect `availableAt` and worker flag/health.
3. If `PROCESSING` is stale, confirm the lease age; the next worker may safely reclaim it.
4. Locate `AutomationExecution` by `triggerEventId` and inspect its frozen version, condition outcome and steps.
5. For `FAILED`, compare attempts/nextAttemptAt with the action retry policy and safe error.
6. For `EXHAUSTED`/`DEAD_LETTER`, open an F5 incident/support case and preserve event/execution identifiers.
7. For consent skips, verify current F7 policy/decision/withdrawal. Do not reinterpret historical consent or force the action.
8. For referral issues, inspect program version, code state/limits, market, risk evidence and authoritative conversion event.

## Alert guidance

Alert on sustained delivery queue age, repeated retry/exhaustion, dead-letter growth, referral rejection spikes, reward reversal spikes and fraud-attention changes. Route operational failures to Operations, authorization/privacy failures to Security/Compliance, and reward/account-credit anomalies to Finance. Metrics labels must never contain codes, user IDs, emails, phone numbers or payload text.

## Dead-letter handling

Manual replay is disabled. Do not update statuses or timestamps directly. Determine whether the failure is configuration, consent, invalid source data or a software defect. Correct through a reviewed definition version/deployment. If a new effect is required, use a newly authorized domain command/event with its own idempotency evidence. Record the decision and link incident, old execution and new source event.

## Reward incident handling

1. Set the affected program to `PAUSED` with an audited reason.
2. Stop automation if it can create additional rewards.
3. Compare referral conversion evidence with booking/cancellation/refund facts.
4. Put eligible rewards on `HELD`; never mark `FULFILLED` from F8.
5. Confirm F3 ledger/payment/payout/refund tables are unchanged by F8.
6. Reverse only through the supported lifecycle with evidence and independent operational review.

## Emergency rollback

1. Set `AUTOMATION_WORKER_ENABLED=false` and stop worker instances.
2. Set `AUTOMATION_ENGINE_ENABLED=false` and `REFERRALS_ENABLED=false`.
3. Disable relevant database feature flags and pause active definitions/programs when Admin API is healthy.
4. Verify existing bookings, payments, consent and Admin/Operations endpoints remain ready.
5. Preserve all F8 tables, outbox deliveries, executions, audit logs and correlation evidence.
6. Open/maintain the incident and record configuration revision and last processed event.

Do not drop migrations, disable constraints/RLS, delete events, rewrite versions or bulk-replay. Database rollback is permitted only before any F8 write in an isolated environment and after explicit database-owner review.

## Recovery

Deploy the corrected revision with flags false, run regression/integration gates, review affected dead-letter evidence, create a new version where configuration changed, then re-enable one bounded cohort/worker. Monitor at least one agreed operational window before scaling.
