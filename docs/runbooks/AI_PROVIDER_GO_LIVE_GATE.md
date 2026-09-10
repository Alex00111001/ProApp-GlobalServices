# AI provider go-live gate

## Status and purpose

This gate is **NOT APPROVED**. F10 is complete, but external AI provider execution, production AI traffic and Market activation remain disabled. Passing F10 CI proves the governed platform; it does not authorize a provider, credential or production rollout.

This document is the durable checklist for a future human or agent review. An agent must fail closed when evidence, ownership or approval is missing. It must not provision credentials, enable flags or infer approval from a successful test run.

## Authorities and non-negotiable boundaries

- F3 remains the only financial authority. AI cannot change pricing, fees, ledger entries, payouts, refunds or revenue.
- F7 remains the privacy/consent authority. Data minimization and lawful-purpose checks apply before dispatch.
- F8.5 remains the Market activation authority. Readiness or AI recommendations never activate a Market.
- F9 remains the content publication authority. AI-generated drafts are not approved or published content.
- External model output is untrusted input and must pass schema, authorization and domain validation.
- No arbitrary prompt, shell, SQL, HTTP, filesystem or administrative write tool may be introduced for go-live.
- HIGH-risk output requires exact-artifact four-eyes approval; approval is not downstream execution.

## Required human owners

Every row must name a person and contain dated evidence. One person may hold multiple operational roles, but security/privacy approval and business acceptance must remain independently reviewable.

| Responsibility | Required decision |
| --- | --- |
| Product owner | operation purpose, user impact, rollout and stop criteria |
| Security owner | provider posture, credential design, threat model and incident controls |
| Privacy/legal owner | lawful purpose, data classification, residency, retention, DPA/subprocessors and consent boundary |
| Platform/SRE owner | capacity, alerts, runbook, rollback, on-call and provider failure behavior |
| FinOps/business owner | measured unit cost, budgets, forecast and cost stop limits |
| Operation owner | evaluation dataset, quality threshold, human review workflow and ongoing regression ownership |

Missing owner or approval means **NO-GO**.

## Gate A — provider and data-processing review

- [ ] Provider legal entity, service, API and exact model/version are identified.
- [ ] DPA and current subprocessor list are reviewed and linked.
- [ ] Processing and storage regions are documented for every enabled Market.
- [ ] Cross-border transfer mechanism and Market-specific restrictions are approved.
- [ ] Provider retention, deletion, abuse monitoring and training-on-customer-data behavior are documented and configured.
- [ ] Provider incident-notification, availability and deletion commitments are accepted.
- [ ] Allowed data classes are explicitly mapped. `RESTRICTED` has no external route.
- [ ] Input/output retention inside HomeServices has a documented purpose, duration and deletion procedure.
- [ ] F7 consent or other lawful-processing configuration is validated for each operation.

Any unknown residency, retention or training behavior is **NO-GO**.

## Gate B — credentials and environments

- [ ] Development, test and production credentials are distinct.
- [ ] Production credential exists only in the approved secret store.
- [ ] The database stores only the environment-variable reference, never the credential.
- [ ] Runtime access is least privilege and limited to the AI worker identity.
- [ ] Rotation, revocation, expiry and emergency-disable procedures have been exercised.
- [ ] Logs, traces, prompts, errors, audit records, Notion and Git contain no credential value.
- [ ] Secret scanning and a provider-key canary/negative control are green.
- [ ] Production flags remain off until the signed rollout step.

Required configuration order is `AI_OPERATIONS_ENABLED`, then `AI_PROVIDER_EXECUTION_ENABLED`, then `AI_OPERATIONS_WORKER_ENABLED`. The worker must refuse invalid combinations.

## Gate C — model policy and routing

- [ ] Provider and model policy are created in `DISABLED`/draft state and independently reviewed.
- [ ] Operation, purpose, capability, Market, locale, data class, region, token and timeout allowlists are exact.
- [ ] A passing evaluation exists for the exact operation version and model-policy key.
- [ ] Routing evidence is auditable and deterministic by configured priority.
- [ ] No silent fallback exists to an unevaluated, cheaper, broader or less-safe model.
- [ ] Model retirement and emergency suspension behavior are tested.
- [ ] Prompt/model changes create new immutable versions and trigger reevaluation.

## Gate D — privacy and safety

- [ ] Field allowlists and pseudonymous references are reviewed against realistic payloads.
- [ ] Email, phone, address, payment instruments, raw anonymous IDs, tokens and credentials are rejected/redacted.
- [ ] Direct and indirect prompt-injection fixtures pass.
- [ ] Oversized input, malicious structured output, schema bypass, tool injection and data-exfiltration attempts fail closed.
- [ ] Prompt bodies and raw provider payloads are absent from default telemetry.
- [ ] Output schemas use closed types, enums, lengths, counts and authoritative-reference validation.
- [ ] HIGH-risk four-eyes, self-approval rejection and stale-artifact rejection are proven.
- [ ] No AI output can directly activate Markets, publish content, discipline users or move money.

## Gate E — evaluation and regression

For each operation/model/prompt tuple, preserve an immutable evaluation record containing:

- fixture dataset version and digest;
- evaluator version and acceptance methodology;
- schema and safety pass rates;
- measurable factuality/grounding criteria;
- prompt-injection/refusal cases;
- quality threshold and observed score;
- p50/p95 latency and timeout rate;
- input/output token distribution;
- measured cost per execution;
- regression comparison with the prior approved tuple.

- [ ] All thresholds pass before activation.
- [ ] Dataset represents every intended locale/Market without using uncontrolled sensitive data.
- [ ] Evaluation failure or regression prevents activation automatically.
- [ ] A recurring reevaluation owner and cadence are recorded.

“The output looks good” is not acceptable evidence.

## Gate F — cost calibration

- [ ] Provider billing units and current prices are captured with date/source.
- [ ] Actual test token usage and provider-reported cost are reconciled with `AICostRecord`.
- [ ] Per-operation maximum cost is set from measured percentiles, not guesses.
- [ ] Hourly, daily, monthly and Market/workspace budgets are configured.
- [ ] Worst-case retries and concurrent requests are included in the forecast.
- [ ] Budget exhaustion is tested and fails closed without an unapproved fallback.
- [ ] Alert thresholds, owner and response time are documented.
- [ ] A hard monthly stop and emergency kill switch are approved.

Cost calibration evidence must include expected low/base/high traffic, unit cost, retry multiplier and maximum monthly exposure. Any unbounded scenario is **NO-GO**.

## Gate G — load, soak and provider-failure evidence

The test plan must record environment, dataset, worker count, concurrency, duration, request shape and expected production multiple. Results must include queue age, throughput, p50/p95/p99 latency, timeout/rate-limit/schema-error rates, token/cost totals and database/provider saturation.

- [ ] Sustained-load test meets the approved expected peak plus safety margin.
- [ ] Soak test runs for the approved duration without queue growth, cost drift, memory growth or lost leases.
- [ ] Burst/backpressure behavior remains bounded.
- [ ] Duplicate delivery and concurrent claims produce one durable effect.
- [ ] Worker crash after dispatch and during persistence is exercised.
- [ ] Provider timeout, 429, 5xx, malformed output and outage are exercised.
- [ ] Retry backoff, max attempts, circuit breaker and `EXHAUSTED` visibility behave as documented.
- [ ] Database reconnect and worker restart recover without replaying completed effects.
- [ ] No test calls a production-sensitive downstream action.

Load/soak must use non-production or explicitly isolated traffic and approved spend caps.

## Gate H — operational readiness

- [ ] Dashboards cover executions, success/failure, provider latency, queue age, tokens, cost, rate limits, schema/safety rejection, approval time and evaluation regressions.
- [ ] Alerts are actionable, deduplicated and assigned to an on-call owner.
- [ ] Correlation/trace/execution IDs connect request, queue, provider attempt, artifact and audit record.
- [ ] Dead-letter diagnosis and safe reprocessing policy are documented; blind replay remains disabled.
- [ ] Provider suspension, worker shutdown, credential revocation and application rollback have been rehearsed.
- [ ] Incident exercise covers suspected data exposure and cost runaway.
- [ ] Customer/support communications and regulatory notification ownership are defined where applicable.
- [ ] The Admin bundle/performance baseline is measured on supported operator devices.

## Staged rollout

Each stage requires a dated decision, owner, evidence window and explicit stop criteria. Advancement is manual.

1. Internal non-production fixtures only.
2. Internal production operators with synthetic/non-sensitive inputs and a strict cost cap.
3. One LOW-risk operation for a bounded cohort in an already authorized Market.
4. Gradual percentage increase after quality, latency, privacy, incident and cost review.
5. MEDIUM/HIGH operations only through their separate approval workflows.

Market activation, provider activation and operation activation are distinct decisions. Do not combine them in one toggle or approval.

Automatic rollback/stop conditions must include unexpected data classification, secret/PII detection, safety/schema regression, budget exhaustion, uncontrolled queue growth, repeated provider failures, audit gaps or approval bypass.

## Rollback and emergency stop

1. Stop `AI_OPERATIONS_WORKER_ENABLED`.
2. Disable `AI_PROVIDER_EXECUTION_ENABLED`.
3. Suspend the affected operation/model policy/provider through audited controls.
4. Revoke/rotate the provider credential if compromise is possible.
5. Preserve executions, approvals, artifacts, costs, audit and trace evidence.
6. Redeploy the last verified application revision if needed.
7. Do not drop F10 tables, delete migrations or rewrite evidence.
8. Complete incident, privacy and cost reconciliation before any reactivation.

## GO/NO-GO decision record

Copy this block into a dated release record; do not edit this template to imply approval.

```text
Decision: GO | NO-GO
Date/time and timezone:
Target environment:
Provider / API / model version:
Operation and prompt versions:
Markets/locales/data classes:
Rollout stage and percentage:
Evaluation record(s):
Load/soak report:
Privacy/legal/residency evidence:
Credential/rotation evidence:
Cost calibration and hard limits:
Dashboards/alerts/runbook:
Rollback rehearsal:
Known risks and expiry/review date:
Product owner:
Security owner:
Privacy/legal owner:
Platform/SRE owner:
FinOps owner:
Operation owner:
Independent approver(s):
Final decision reason:
```

No blank, expired or verbal approval satisfies this gate. A later production launch should link the immutable artifacts and exact deployed Git revision.
