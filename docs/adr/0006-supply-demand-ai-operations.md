# ADR 0006 — Supply, demand, market readiness and governed AI Operations

- Status: Accepted for F10 implementation
- Date: 2026-09-10
- Base: F9 closure `f2ffb4426ddc8bf7194e04aa61f46c75051ea203`
- Owners: Platform, Operations, Markets, Security, Privacy, Finance and Data
- Production and market activation: Not authorized

## Context

F10 adds operational intelligence without creating another source of truth. F1-F9 already own authoritative events, telemetry, financial facts, administrative authorization, durable jobs, Growth conversions, consent, automation, Markets/geography and experiments/content. Supply, demand and readiness must be deterministic projections over those authorities. AI may explain validated projections and propose investigations, but it cannot calculate authoritative KPIs, activate a Market, move money, publish content, discipline users or execute arbitrary tools.

## Authority map

```text
F1 canonical events + outbox + idempotency ---------\
F2 telemetry/health/incidents -----------------------+
F3 ledger/pricing/refunds (read-only aggregates) ----+--> deterministic aggregation
F5 durable work + dead-letter -----------------------+      -> versioned observations/snapshots
F6 first-party intent/conversion facts --------------+      -> readiness/expansion evaluations
F8 automation registry/execution --------------------+
F8.5 Market/Policy/Geography/ServiceArea ------------+
F9 guardrails/content readiness ---------------------/

validated snapshot + evidence references
  -> governed AI operation
     -> provider/model/data policy
     -> versioned prompt + redacted allowlisted context
     -> strict structured-output validation
     -> immutable artifact + cost/audit evidence
     -> human review for HIGH risk
     -> recommendation only
```

PostgreSQL remains the system of record. Admin Web is API-only. F10 does not introduce another event bus, scheduler, ledger, identity, geography, conversion or automation engine.

## Supply and demand decision

Metric definitions are immutable, versioned contracts. Each declares its kind, unit, authoritative source, numerator/denominator semantics, deduplication, supported windows, dimensions, lateness allowance and formula version. Definitions cannot contain SQL or executable expressions.

Observations preserve source event time and processing time. Snapshots bind a Market, optional official division and Service, exact metric-definition versions, event-time window, snapshot time, source watermark, data-quality state, component values, algorithm version and canonical input digest. Repeating an equivalent calculation is idempotent; late data creates a new immutable snapshot rather than rewriting history.

Supply counts only operationally eligible professionals: valid status, active Market/policy, active administrative-division service area and applicable active services. Demand distinguishes intent, requests, booking attempts, bookings, completed work, cancellations, unmatched/no-supply outcomes and time-to-match. SEO traffic is not economic demand by itself. Composite balance and anomaly outputs expose every input, weight, threshold, confidence and missing-data reason.

Windows use a closed registry (`HOUR`, `DAY`, `SEVEN_DAYS`, `THIRTY_DAYS`) or a bounded administrative range up to 366 days. Event, processing and snapshot times remain distinct.

## Readiness and expansion decision

`MarketReadinessPolicy` is immutable after activation and versions required dimensions and thresholds for supply, demand, geography, professional verification, support, financial configuration, identity/legal policy, observability, incident response, content/SEO, staffing and data quality. An evaluation stores component results, evidence, blockers and one explainable outcome: `NOT_READY`, `CONDITIONALLY_READY` or `READY`.

Readiness is evidence, not activation. It cannot update `Market.status` or `MarketPolicyVersion`; those F8.5 authorities and their human workflow remain separate.

Expansion candidates cover Market, geography, Service or coverage changes. Evaluations record evidence, rule version, confidence, guardrails, blockers and missing evidence. Review only accepts the recommendation as reviewed; it never executes expansion, pricing, financial or publication changes.

## AI Operations decision

AI Operations is a governed registry with versioned providers, model-routing policies, prompts, operation definitions, executions, input references, immutable output artifacts, evaluations, approvals and cost records.

The closed operation registry initially permits only internal, non-authoritative operations:

- `SUMMARIZE_OPERATIONAL_INCIDENT`
- `CLASSIFY_OPERATIONAL_SIGNAL`
- `EXPLAIN_MARKET_READINESS`
- `SUGGEST_EXPANSION_HYPOTHESES`
- `SUMMARIZE_SUPPLY_DEMAND_ANOMALY`
- `DRAFT_INTERNAL_CONTENT`
- `RECOMMEND_INVESTIGATION_STEPS`

There is no arbitrary-prompt endpoint. Provider adapters implement one bounded contract and are selected by audited model policy using operation type, capability, latency/cost ceiling, data class, context size, locale/Market and purpose allowlists. Clients cannot select a model and no silent fallback is allowed.

Production provider execution is independently disabled by default. Tests inject a contract-conforming adapter; runtime missing/disabled providers fail explicitly.

## Risk and approval decision

Operations are `LOW`, `MEDIUM`, `HIGH` or `PROHIBITED`. `PROHIBITED` cannot execute. `HIGH` outputs enter `PENDING_REVIEW` and require a distinct authorized reviewer. Approval binds the exact output hash, operation/prompt versions and model policy. Regeneration, supersession or expiry invalidates prior approval. Approval never means the recommended domain action executed.

AI output is untrusted input. Machine-consumed output passes strict schema, enum/bound/length/reference, domain and authorization validation. Invalid output is rejected, not silently repaired. Models cannot emit executable SQL, shell, HTTP destinations, filesystem paths, credentials, permission changes, Market activation, financial commands or publication commands.

## Prompt, data and tool boundary

Prompts are immutable versions separating system policy, trusted template and untrusted context. Required variables and output schema are explicit. External content is delimited data and cannot override policy. Prompt/model changes require a new version and reevaluation where policy requires it.

Data classes are `PUBLIC`, `INTERNAL`, `CONFIDENTIAL` and `RESTRICTED`. Provider/model policies declare allowed classes, regions and purposes. Input is field-allowlisted, size-bounded, pseudonymized and centrally redacted before dispatch. Secrets, credentials, identity documents, payment instruments and unnecessary contact/address data are forbidden. Full prompts/outputs are not default logs or metric labels.

The tool registry is read-only and closed. Initial tools retrieve only already-authorized bounded F10 snapshots, readiness evidence and safe F2 incident projections. There is no arbitrary shell, SQL, HTTP, filesystem, GitHub or Notion access. A future write tool requires a separate ADR and approval boundary.

## Durability, cost and failure decision

Executions are PostgreSQL-backed, idempotent by operation version and request key, lease claimed with `FOR UPDATE SKIP LOCKED`, bounded by attempts, exponential backoff and a terminal dead-letter state. No in-memory scheduler is authoritative. F5 Operations exposes safe execution/dead-letter status.

Budgets apply per execution, operation, provider/model and Market/workspace over hourly, daily and monthly windows. Token/input/output limits, bounded concurrency, rate limits, queue age and circuit-breaker state are enforced before provider invocation. Retries reserve budget and cannot multiply cost without bound.

Provider unavailable, missing policy, disallowed data class, invalid output, failed safety gate, missing approval or exhausted budget all yield explicit states. There is no fallback to an unapproved provider/model.

## Evaluation and activation decision

Every executable operation version requires a versioned evaluation dataset, evaluator version, schema/safety assertions, injection fixtures, quality threshold, latency ceiling and cost ceiling. Model or prompt changes invalidate the prior gate unless compatibility is proven.

Deterministic anomaly rules run before AI and are versioned. AI receives only structured evidence and may add summary, hypotheses and investigation suggestions; it never invents metric values.

## Security, privacy, observability and access

F10 uses narrow permissions for supply/demand read, readiness read/manage, expansion read/review, AI operation read/manage/execute, execution read, approval, provider read/manage and cost read. Endpoints use F4 sessions, backend authorization, bounded pagination/date ranges and audit. High-risk approval enforces four-eyes.

Metrics use bounded non-PII labels for aggregation duration, staleness, data lag, anomalies, execution outcome, provider latency, token/cost bands, rate limits, schema/safety rejection, approval time and evaluation regression. Request, correlation, trace and operation-execution IDs connect safe logs, audit and durable evidence.

All F10 tables use additive restrictive foreign keys, forced RLS, no public policies and no Supabase API-role grants.

## Rejected alternatives

- One opaque readiness score: not explainable or auditable.
- All registered professionals as supply: registration is not eligibility.
- SEO traffic as confirmed demand: intent and economic demand differ.
- Automatic activation/expansion: evaluation and recommendation are not authority.
- Free-form prompts, `eval`, user SQL or arbitrary HTTP/tools: injection and authority escalation.
- Direct LLM KPI computation: operational facts must be deterministic.
- Provider-specific domain models: routing and regional policy must remain portable.
- Default prompt/output logging: sensitive-data and retention risk.

## Rollout and rollback

Deploy additive schema/RBAC, then services/Admin Web, then workers. Keep `SUPPLY_DEMAND_ENABLED`, `AI_OPERATIONS_ENABLED`, `AI_PROVIDER_EXECUTION_ENABLED` and `AI_OPERATIONS_WORKER_ENABLED` false in production. Rehearse migrations, RLS, concurrency, budgets, injection, provider failure and four-eyes review before any later go-live authorization.

Rollback disables F10 flags/workers, restores the prior application and preserves definitions, snapshots, evaluations, executions, artifacts, approvals, costs, audit and outbox evidence. Populated F10 tables are never dropped and Markets remain inactive.

## Acceptance evidence

Closure requires deterministic/reproducible metric tests, readiness/expansion non-execution tests, AI registry/schema/injection/privacy/budget/concurrency/approval/evaluation tests, clean PostgreSQL replay, forced-RLS/default-deny, synchronized RBAC, F1-F9 regression, frontend builds, zero HIGH/CRITICAL dependency findings, tracked/full-history secret scans and green remote CI.
