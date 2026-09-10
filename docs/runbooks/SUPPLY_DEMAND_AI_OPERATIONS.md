# F10 Supply, Demand and AI Operations runbook

## Safety posture

F10 does not activate production, Markets or providers. Readiness, expansion review and AI approval never execute a recommendation. F3 remains financial authority and F8.5 remains Market activation authority.

## Deployment

1. Confirm ancestry from the verified F9 closure and a clean worktree.
2. Run Prisma format/validate/generate.
3. Replay all 26 migrations on clean PostgreSQL and run history/baseline checks.
4. Apply the additive migration with `prisma migrate deploy` to test.
5. Synchronize RBAC; verify existing roles gained no F10 privilege and `AI_OPERATIONS_ADMIN` has no financial/Market activation permission.
6. Deploy API/Admin with provider execution and worker off.
7. Run backend, Admin, public web, Client, Professional, PostgreSQL/RLS, audit and secret gates.
8. Do not enable external execution without separately approved provider/model/prompt/evaluation/budget records.

## Configuration

| Variable | Production default | Purpose |
| --- | --- | --- |
| `SUPPLY_DEMAND_ENABLED` | false | Deterministic aggregation/readiness |
| `AI_OPERATIONS_ENABLED` | false | Governed definitions and queue |
| `AI_PROVIDER_EXECUTION_ENABLED` | false | External dispatch |
| `AI_OPERATIONS_WORKER_ENABLED` | false | Durable worker; requires both prior capabilities |
| `AI_OPERATIONS_WORKER_POLL_MS` | 2000 | Bounded poll interval |
| `AI_OPERATIONS_WORKER_BATCH_SIZE` | 10 | Bounded claim size |
| hourly/daily/monthly budget variables | explicit | Global/Market micro-cost ceilings |

Credentials exist only in the approved secret store and are referenced by environment-variable name. Never place credentials in Prisma data, logs, issues, Notion, prompts or Git.

## Operating supply/demand

1. Select Market, optional authoritative geography/service and a bounded window.
2. Generate a snapshot through the Admin API.
3. Inspect watermark, quality, missing evidence and every component before using a ratio.
4. Diagnose deterministic anomaly key/version before requesting AI explanation.
5. Trace via correlation ID and immutable snapshot/audit ID.

Concurrent equivalent requests return one snapshot. Late authoritative inputs generate a new digest/row; never overwrite prior evidence.

## Operating readiness and expansion

1. Create a complete 12-dimension policy draft.
2. Obtain independent review, then activate the reviewed version.
3. Evaluate against immutable evidence. Treat `READY` as evidence only.
4. Inactive Markets must remain `NOT_READY` with `market_inactive`.
5. Evaluate/review an expansion hypothesis independently.
6. Route any actual Market, service, coverage or pricing change to its authoritative workflow.

## Onboarding an AI operation

1. Create a disabled fixed-adapter provider with purpose/capability/classification/region/rate/circuit policy.
2. Create and independently review a model policy.
3. Create a closed-registry operation and independently review its prompt version.
4. Run the versioned fixture dataset and persist thresholds/results.
5. Activate only after schema, safety, quality, latency and cost thresholds pass.
6. Keep environment execution/worker flags off until a separate approval.

## Execution and HIGH approval

1. Submit only digest-matched immutable references with an idempotency key.
2. Inspect routing, attempts, safe errors, trace, token and cost evidence.
3. For HIGH risk, compare exact artifact digest/evidence and record a reason.
4. Requester cannot approve; stale/regenerated artifacts cannot reuse approval.
5. Approval does not execute Market, financial, disciplinary, regulatory or publication action.

## Signals to monitor

- snapshot failure, stale watermark or data lag;
- supply collapse, demand spike, fulfilment/cancellation/coverage anomalies;
- missing readiness evidence or unexpected policy version;
- queue age, retries or `EXHAUSTED` state;
- provider latency/rate/circuit-open failures;
- schema/safety rejection or evaluation regression;
- budget exhaustion or unusual approval time.

Start with correlation ID, then inspect immutable evidence, audit and trace. Never copy full prompts, inputs, outputs or provider payloads into logs.

## Failure procedures

### Aggregation or freshness

Stop using the snapshot, inspect source freshness/event time, definition version and scope, then recompute after authority recovery. Preserve the old evidence. Any readiness depending on stale data is not ready.

### Provider unavailable/circuit open

Do not silently fallback. Inspect safe error/attempt/nextAttempt, suspend the provider if persistent, stop the worker if safety/cost is uncertain, and re-enable only after provider/model/evaluation review.

### Invalid or unsafe output

Preserve the rejected execution. Never repair/approve under the same digest. Correct prompt/schema/policy with a new version, rerun evaluation, obtain review, then activate.

### Budget exhaustion

Do not bypass or loop retries. Inspect immutable cost by operation/model/Market/window. Any cap change requires an audited policy change and owner approval.

### Approval incident

Reject self, stale or superseded approval; preserve audit, suspend the operation/provider for repeated attempts, and verify requester/reviewer/digest/version. Approval never grants downstream execution authority.

## Rollback

Rollback is application-first and non-destructive:

1. Disable/stop the AI worker.
2. Disable provider execution.
3. Suspend affected provider/operations through audited controls.
4. Disable AI Operations and/or supply-demand endpoints if required.
5. Redeploy the prior application version.
6. Preserve all 20 F10 tables, audit, approvals, costs and evidence.
7. Never drop tables, delete migrations or mutate published evidence.

The additive schema may remain under older code. Cleanup/retention requires a later reviewed migration.

## Acceptance versus go-live

F10 closure requires complete local and remote CI: clean 26-migration replay, PostgreSQL concurrency, forced RLS/default deny, RBAC sync, all apps, audits and secret scans. That proves the phase only. External providers, real traffic, production and Markets require the separate [AI provider go-live gate](AI_PROVIDER_GO_LIVE_GATE.md), whose evidence covers secret-store provisioning, legal/data-processing and residency review, evaluation, operational ownership, cost calibration, load/soak and rollback.
