# F8 Referrals & Automation

## Status and boundary

F8 provides versioned referral programs and a durable trigger/condition/action engine on PostgreSQL. The implementation is complete in the test environment; production activation is not authorized. F3 remains the only financial source of truth. F8 calculates and records reward eligibility but cannot post ledger entries, execute payouts/refunds, or mark a reward `FULFILLED`.

Production defaults must remain:

```text
REFERRALS_ENABLED=false
AUTOMATION_ENGINE_ENABLED=false
REFERRALS_AUTOMATION_ENABLED=false
REFERRAL_REWARD_FULFILLMENT_ENABLED=false
AUTOMATION_WORKER_ENABLED=false
AUTOMATION_MANUAL_REPLAY_ENABLED=false
```

The combined `REFERRALS_AUTOMATION_ENABLED` switch exists for controlled test/staging rollout. Separate flags permit referral UX without enabling execution workers. Every program and automation also requires an enabled database-backed feature flag.

## Architecture and ownership

PostgreSQL is the system of record. The API owns actor identity, market, lifecycle transitions, conversion authority and reward calculation. Client, Professional and Admin Web use versioned APIs only.

The principal records are:

- `ReferralProgram` and immutable `ReferralProgramVersion`: lifecycle and versioned eligibility/conversion/reward policy.
- `ReferralCode`: opaque, HMAC-derived public code with server-owned actor, limits, expiry and revocation.
- `Referral`: the unique program/referred-subject relationship and its risk/lifecycle evidence.
- `ReferralConversion`: a reference to an authoritative outbox event and, where present, the F6 `Conversion`; it does not duplicate the source fact.
- `ReferralReward`: calculated beneficiary/value/status evidence and optional financial-intent reference.
- `ReferralRiskAssessment`: explainable first-party signals and a deterministic evidence digest.
- `AutomationDefinition` and immutable `AutomationVersion`: lifecycle plus frozen trigger, condition tree and action sequence.
- `AutomationEventDelivery`: independent durable fan-out from each `OutboxEvent`; it does not compete with the F1 outbox publisher.
- `AutomationExecution` and `AutomationStepExecution`: replay-safe execution and per-action lease/retry/dead-letter evidence.

All relations to financial, audit and event evidence use restrictive deletion. All F8 tables have RLS enabled and forced, and Supabase `anon`/`authenticated` roles have no grants. The backend connection must use the reviewed bypass-RLS service role.

## Referral program contract

Program lifecycle is `DRAFT → SCHEDULED|ACTIVE|ARCHIVED`, `SCHEDULED → ACTIVE|PAUSED|ARCHIVED`, `ACTIVE → PAUSED|COMPLETED`, `PAUSED → ACTIVE|COMPLETED|ARCHIVED`, and `COMPLETED → ARCHIVED`. Transitions are server-side, optimistic-concurrency protected by `rowVersion`, and audited. Archived records cannot reopen.

Each version freezes:

- referrer and referred actor types (`CLIENT` or approved `PROFESSIONAL`);
- enabled ISO markets;
- one authoritative qualifying event (`booking.completed` in the currently supported product);
- waiting and cancellation windows;
- per-owner code/referral and per-code use limits;
- a supported reward policy;
- a SHA-256 configuration digest.

New versions are permitted only while a program is `DRAFT` or `PAUSED`. Historical referrals retain their exact `programVersionId`.

## Codes, claims and anti-fraud

Codes have the form `REF_` followed by 36 uppercase hexadecimal characters derived through HMAC-SHA-256 from program, owner and an idempotency key. They expose neither user nor professional identifiers and provide 144 bits of displayed entropy. Lookup responses are generic and rate limited.

Claiming is serialized with PostgreSQL advisory locks and guarded by unique constraints. The service rejects:

- missing, expired, revoked or exhausted codes;
- owner manipulation and self-referral;
- reversed circular relationships;
- duplicate referred identity within a program;
- cross-market claims;
- ineligible client/professional actor types;
- reused idempotency keys with different authority;
- concurrent use beyond code/program limits.

The initial risk record contains only explainable first-party signals: self-referral result, circular-referral result and same-market result. No device fingerprinting or third-party tracking is used. Automated heuristics never irreversibly block an account; non-clear outcomes require review.

## Conversion and reward lifecycle

From creation through `QUALIFIED`, `CONVERTED`, `REJECTED` or `REVERSED`, referral state changes only from authoritative domain events. Clients cannot submit qualified/converted flags, beneficiary identity or reward values.

`booking.completed` qualification loads the persisted booking and verifies that its customer is the referred user. The referral conversion uniquely references its source outbox event and optionally the matching F6 conversion. Cancellation/refund events reverse eligible referral evidence and rewards. Replays cannot create a second conversion or reward.

Supported rewards are `ACCOUNT_CREDIT` and `NON_MONETARY`. Fixed account credit is calculated in the program currency; non-monetary benefits use an allowlisted product key. Percentage rewards are deliberately unavailable because the current financial domain has no reviewed basis/rounding/tax contract for them.

Reward lifecycle is `PENDING → APPROVED|HELD|REJECTED|REVERSED`, `APPROVED → HELD|REVERSED`, `HELD → APPROVED|REJECTED|REVERSED`, and `FULFILLED → REVERSED`. F8 refuses every request to set `FULFILLED`. Account-credit approval can emit an idempotent financial intent for a future F3-owned command handler, but no handler or real disbursement is enabled in F8.

## Automation engine

Definitions use `DRAFT`, `ACTIVE`, `PAUSED` and `ARCHIVED`. Activation validates and hashes the complete version. Editing creates a new version; previous executions continue to reference the original version.

### Trigger registry

The closed trigger registry consumes F1 authoritative outbox events:

```text
booking.completed
booking.cancelled
payment.completed
refund.completed
privacy.consent.withdrawn
referral.created
referral.qualified
referral.converted
referral.reward.created
referral.reward.reversed
```

Each trigger specifies schema version 1. Adding a trigger requires code review, a documented producer contract and regression tests; administrators cannot invent event types.

### Condition registry

Conditions can read only `event.type`, `event.aggregateType`, `event.aggregateId` and the allowlisted payload fields `status`, `market`, `actorType`, `reasonCode`, `rewardType`, `beneficiarySide`, and `purpose`. Operators are `equals`, `not_equals`, `gt`, `gte`, `lt`, `lte`, `in`, `before`, `after`, and `is_true`.

`all`/`any` groups are deterministic and limited to depth 4 and 20 total nodes. Values pass the F7 privacy sanitizer. JavaScript, `eval`, templates, regex execution, arbitrary property traversal and arbitrary HTTP are not supported.

### Action registry

The closed action registry is:

- `CREATE_REFERRAL_REWARD`: calculate the frozen program-version reward only for an authoritative referral.
- `CREATE_SUPPORT_CASE`: create one F5 case with a deterministic key and safe source reference.
- `ENQUEUE_NOTIFICATION`: persist one internal notification; promotional/purpose-bound actions re-check current F7 consent immediately before execution and skip closed on denial/withdrawal.
- `EMIT_DOMAIN_EVENT`: emit only `automation.task.created` or `automation.notification.enqueued` for an allowlisted aggregate type.

External webhooks and arbitrary network requests are absent. A future adapter requires a separate allowlist, secret-store integration, egress policy, signature, rate limit, retry/idempotency contract and approval.

## Delivery, idempotency and retries

The `OutboxEvent_automation_delivery` database trigger inserts exactly one independent delivery per source event. This preserves the F1 outbox publisher's status and makes automation consumption durable.

Workers claim deliveries and steps with `FOR UPDATE SKIP LOCKED` and expiring leases. Unique keys enforce one execution per `automationVersion + triggerEvent` and one effect record per `automationVersion + triggerEvent + action`. Actions execute in the same transaction that marks the step successful. If a worker crashes before commit, the action rolls back; if it crashes after commit, the step is already terminal. Replay therefore cannot double-apply the effect.

Retries distinguish terminal 4xx domain errors from retryable provider/5xx/429 failures. Attempts are bounded per action (1–10), use capped exponential backoff, persist `nextAttemptAt`, first/last failure timestamps and a centrally redacted 1,024-character safe error. Exhausted steps and executions enter `EXHAUSTED`; exhausted deliveries enter `DEAD_LETTER`.

Manual replay is intentionally disabled. Operators must diagnose and correct the source/configuration, then use a new authoritative event or a separately reviewed recovery procedure. Blind replay is never allowed.

## API contracts

Authenticated product APIs:

```text
GET  /api/v1/referrals/programs
GET  /api/v1/referrals/codes
POST /api/v1/referrals/codes
POST /api/v1/referrals/codes/:id/revoke
POST /api/v1/referrals/claims
GET  /api/v1/referrals/me
```

Admin APIs:

```text
/api/v1/admin/referrals/programs[/...]
/api/v1/admin/referrals/codes
/api/v1/admin/referrals/referrals
/api/v1/admin/referrals/conversions
/api/v1/admin/referrals/rewards[/...]
/api/v1/admin/automation/definitions[/...]
/api/v1/admin/automation/executions
/api/v1/admin/automation/dead-letter
```

Admin collection contracts enforce server-side pagination (maximum 100), bounded search/status/market filters and a maximum 366-day range. Sensitive reads and every mutation are audited. Product responses reveal only the authenticated user's own referrals/rewards and never the referred party's identity.

## RBAC matrix

| Capability | Permission |
| --- | --- |
| Read programs/codes/referrals/conversions | `referrals.read` |
| Create/version/transition programs | `referrals.manage` |
| Read calculated rewards | `referrals.rewards.read` |
| Hold/approve/reject/reverse rewards | `referrals.rewards.manage` |
| Read definitions/versions | `automation.read` |
| Create/version definitions | `automation.manage` |
| Activate/pause/archive | `automation.activate` |
| Read execution/dead-letter evidence | `automation.execution.read` |
| Future controlled retry | `automation.execution.retry` (catalogued, no endpoint) |

No route accepts the legacy `ADMIN` role as sufficient authority. `MARKETING_ADMIN`, `FINANCE_ADMIN`, `COMPLIANCE_ADMIN` and `SUPER_ADMIN` receive only their documented subsets; denied access is audited.

## UX

Client and Professional surfaces load eligible programs from the server, create/share opaque codes through the system share sheet, apply a code and show only their own referral/reward status. Professional eligibility requires an approved professional profile, and client/professional programs remain distinct.

Admin Web is API-only and permission-derived. It provides paginated views for programs, codes, referrals, conversions, rewards, definitions/versions, executions and dead-letter evidence. It displays safe correlation/error evidence and makes the disabled replay policy explicit.

## Observability and privacy

Referral counters cover created, qualified, converted, rejected, pending/fulfilled/reversed rewards and fraud attention. Automation counters cover trigger/match/skip, action success/retry/exhaustion and queue age/execution latency. Labels contain bounded operation/outcome/reason values only—never user identifiers, codes, message bodies or metadata.

`requestId`, `correlationId`, `traceId` and source `eventId` flow through outbox, referral and automation evidence. Stored errors use F2 redaction. The F7 sanitizer rejects personal, payment, token, credential, raw anonymous-ID and secret-bearing URL data from conditions and telemetry. Notifications requiring a consent purpose query the latest current decision and fail closed after withdrawal.

## Migration and rollback

Migrations are additive:

- `202609080001_referrals_automation`: types, tables, constraints, indexes, restrictive FKs, outbox fan-out trigger, RLS and revoked Supabase API grants.
- `202609080002_referrals_automation_force_rls`: forces RLS for all F8 tables.

Rollback is application-first: set both domain flags and worker flag to false, stop the worker, keep Admin read access for investigation and preserve all evidence. Do not drop tables, delete deliveries/executions, rewrite versions, relax unique constraints or remove RLS. Database rollback is allowed only for a demonstrably unused migration in an isolated environment.

Operational procedures are in [the F8 runbook](runbooks/REFERRALS_AUTOMATION.md), and the architecture decision is recorded in [ADR 0003](adr/0003-referrals-durable-automation.md).

## F8.5 market normalization

F8.5 adds `ReferralProgramVersionMarket` and `Referral.marketId` as normalized authority while retaining `enabledMarkets` and `Referral.market` as compatibility projections. When F8.5 is enabled, every configured code must resolve to an existing Market and runtime eligibility uses the relation; unknown or cross-market claims fail closed. Referral lifecycle, idempotency, reward calculation, consent checks, automation delivery and the F3 financial boundary are unchanged.
