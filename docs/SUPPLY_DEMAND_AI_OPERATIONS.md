# F10 Supply, Demand and AI Operations

## Purpose and authority map

F10 is the operational-intelligence layer. It computes explainable supply/demand evidence, evaluates readiness, records expansion recommendations and governs bounded AI assistance. It consumes F1–F9 and never creates a parallel authority:

- F1 owns canonical events, outbox and idempotency; F2 owns telemetry, health, incidents and trace context.
- F3 owns pricing, ledger, refunds, payouts and every financial mutation.
- F4/F5 own Admin sessions, RBAC, audit and durable operations control.
- F6 owns Campaign, Lead, Conversion and funnel evidence; F7 owns consent, pseudonymous identity and privacy.
- F8 owns trigger/condition/action automation; F8.5 owns Country, Market, policy, geography and service areas.
- F9 owns experiments, content, SEO and their guardrails.

Readiness is not activation. Expansion review is not execution. AI output is untrusted, non-authoritative input. F10 never updates Market status, pricing, ledger, payments, refunds, payouts, permissions or published content.

## Supply/demand metric and snapshot model

`SupplyDemandMetricDefinition` versions meaning, source, dimensions, window, deduplication, timezone and formula. `SupplyDemandObservation` stores immutable metric evidence. `SupplyDemandSnapshot` stores reconstructable components, balance, anomalies, quality, watermark, algorithm version and input digest.

| Key | Kind | Authoritative definition |
| --- | --- | --- |
| `eligible_professionals` | supply | Active verified professionals eligible for the Market and optional service/geography |
| `verified_professionals` | supply | Verified profiles; registration alone is excluded |
| `active_service_areas` | supply | Active F8.5 ProfessionalServiceArea rows |
| `declared_capacity_hours` | supply | Bounded declared availability in the window |
| `request_demand` | demand | Deduplicated first-party service-request intent; SEO traffic alone is excluded |
| `booking_attempts` | demand | Authoritative booking attempts |
| `completed_bookings` | demand | Completed Booking facts; F10 creates no conversion |
| `unmet_demand` | balance | Request demand without an authoritative match |
| `fulfilment_rate` | balance | Completed divided by bookings, with a safe zero denominator |
| `cancellation_pressure` | guardrail | Cancelled divided by bookings |
| `requests_per_professional` | balance | Request demand divided by eligible supply |
| `geographic_coverage` | balance | Covered active divisions divided by eligible divisions |

Components remain visible; no opaque score becomes authoritative. `supply-demand-v1` canonicalizes inputs and records a SHA-256 digest. PostgreSQL transaction advisory locks keyed by catalog/snapshot plus unique constraints serialize equivalent concurrent requests.

Supported windows are hour, day, seven days, thirty days and a positive custom range capped at 366 days. Every observation distinguishes event watermark, window end, processing time and snapshot time. Late authoritative events produce new evidence; history is never rewritten.

Quality is `COMPLETE`, `PARTIAL`, `STALE`, `INSUFFICIENT` or `FAILED`, with explicit missing evidence. Versioned deterministic rules detect supply collapse, demand spike, fulfilment degradation, cancellation increase and coverage gaps. AI can explain those results but cannot calculate or alter them.

## Market readiness and expansion

`MarketReadinessPolicy` is versioned, immutable after activation and independently reviewed. Weights total exactly 10,000 basis points. Each evaluation covers:

1. supply and demand evidence;
2. geography coverage and professional verification;
3. support and operational staffing;
4. financial configuration presence, read-only from F3;
5. identity/legal Market policy;
6. observability and incident response;
7. content/SEO readiness;
8. data quality.

The persisted component results expose threshold, actual value, weight and evidence. Outcomes are `NOT_READY`, `CONDITIONALLY_READY` and `READY`. An inactive Market always adds `market_inactive` and evaluates `NOT_READY`; the audit explicitly records `activationChanged=false`. Only F8.5 can activate a Market.

`ExpansionCandidate` represents a Market, geography, service or coverage hypothesis. Geography must belong to the Market's Country and be active; services must be authoritative and active. `ExpansionEvaluation` returns a recommendation, confidence, reasons, blockers, missing evidence and guardrails. Four-eyes review accepts the evidence record but cannot activate Market/service/coverage, change pricing or execute financial work.

## Governed AI Operations

AI Operations is durable governance, not scattered LLM calls:

- `AIProvider` stores a fixed adapter, capability/purpose allowlists, region, classification ceiling, timeout, concurrency, rate and circuit breaker. It stores only a secret-store environment-name reference.
- `AIModelPolicy` versions provider/model routing, operation/purpose/capability allowlists, Market/locale scope, tokens, timeout, cost and classification.
- `AIPromptTemplate` and immutable `AIPromptVersion` separate trusted policy/template from untrusted context and bind the output schema.
- `AIOperationDefinition`/`AIOperationVersion` bind a closed kind to schemas, read-only tools, risk, retries, cost, evaluation and approval.
- Execution, input references, output artifact, evaluation, approval and cost are separately persisted and auditable.

Provider execution and its worker default off. The worker refuses to start unless AI Operations and provider execution are both enabled. The migration activates no provider, Market or production feature.

### Provider and model routing

The adapter registry has only fixed OpenAI Responses and Anthropic Messages HTTPS endpoints. Custom endpoints are rejected. Credentials are resolved immediately before dispatch from an allowlisted `AI_PROVIDER_...` reference and are never persisted or logged.

Routing requires an active operation/version, reviewed prompt, passing evaluation for the exact model-policy key, active provider, matching provider/model capability and purpose, matching operation, safe classification, Market/locale scope, token/timeout/cost bounds, available budgets and provider capacity. There is no silent fallback.

### Closed operation and tool registries

| Operation | Risk | Only allowed result |
| --- | --- | --- |
| Summarize operational incident | low | Internal safe summary |
| Classify operational signal | medium | Bounded classification |
| Explain Market readiness | medium | Narrative over deterministic evidence |
| Suggest expansion hypotheses | high | Reviewable hypotheses, never execution |
| Summarize supply/demand anomaly | low | Narrative over an immutable snapshot |
| Draft internal content | medium | Internal draft with `publishable=false` |
| Recommend investigation steps | medium | Read-only suggestions |

There is no arbitrary-prompt operation. Tools can only read safe incident, snapshot, readiness and expansion evidence. Shell, SQL, filesystem, GitHub/Notion writes, arbitrary HTTP and database-mutation tools do not exist.

### Prompts, structured output and injection

Trusted system policy/template are stored separately from `<validated_untrusted_data>`. Customer/professional/imported text is always data. Instruction override, exfiltration, executable-tool, URL and role-tag patterns fail before dispatch.

Machine-consumed output uses strict Zod/provider JSON schemas: no extra fields, bounded arrays/strings, closed enums and referenced IDs. SQL-like commands, arbitrary URLs and secret-shaped output are rejected. Invalid output is not silently repaired. Prompt/model changes require a new immutable version and evaluation.

### Risk and approval

- `LOW`: internal reversible summary with no effect.
- `MEDIUM`: operational recommendation under normal authorized review.
- `HIGH`: could influence activation, money, security, moderation or regulation; PostgreSQL requires approval.
- `PROHIBITED`: cannot be queued.

HIGH output stops at `AWAITING_APPROVAL`. Requester and reviewer must differ; reason and exact immutable artifact digest are mandatory. Regeneration invalidates prior approval. Approval does not execute any recommendation.

### Privacy and data classification

Classes are `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`; external API contracts accept at most confidential and restricted data has no provider route. Operations/providers each declare a ceiling. References are re-read and digest-checked against forged or stale evidence.

The F7 boundary rejects email, phone, address, payment instruments, raw anonymous IDs, credentials, tokens and secret-like values. Prompt/input/output bodies are not telemetry labels. Logs use safe IDs, operation/outcome/reason, provider key, timing, tokens and cost only.

### Cost, rate, retries and durability

Execution has a unique idempotency key. A PostgreSQL advisory lock and uniqueness serialize concurrent duplicates; reuse with another version or digest fails. Workers claim due rows with `FOR UPDATE SKIP LOCKED`, leases and bounded batches.

Retry uses bounded exponential backoff. Provider timeout/rate/5xx may retry; policy/schema/privacy/safety errors become terminal. Safe errors are redacted and capped. `EXHAUSTED` is observable dead-letter evidence; there is no blind replay API.

Budgets reserve against the lower operation/model ceiling and are checked hourly, daily and monthly, optionally by Market. Token and micro-cost records are immutable. Provider concurrency, requests/minute and recent-failure circuit thresholds add backpressure.

### Evaluation quality gate

An operation cannot activate without a passing evaluation for its exact operation version and model-policy key. Evaluation versions the evaluator, fixture dataset/digest, prompt/operation/model target, sample size, schema/safety rates, quality, p95 latency, estimated cost, thresholds and results. Prompt/model changes create a new evaluation target.

## API, RBAC and Admin Web

All endpoints use F4 Admin sessions, context propagation, narrow permission middleware, validation and audit:

- `/api/v1/admin/supply-demand/metrics|snapshots`
- `/api/v1/admin/readiness/policies|evaluations`
- `/api/v1/admin/expansion`
- `/api/v1/admin/ai/providers|model-policies|operations|prompts|executions|approvals|evaluations|costs`

Lists are server-paginated (maximum 100); ranges are capped at 366 days. `AI_OPERATIONS_ADMIN` has the F10 permissions but no payout, refund, pricing, Market-management or publication authority. Existing roles were not expanded.

The API-only Admin page shows supply/demand components, quality, readiness/blockers, expansion evidence, closed AI definitions, executions/dead letters, provider policy, costs and exact-output approvals. Permission-derived loading/error/empty/read-only states use shared controls; there are no mocks or browser database access.

## Observability, audit and storage

Metrics cover snapshot duration/freshness/lag, aggregation outcomes, AI outcomes/latency/provider, schema/safety rejection, tokens and cost. Labels contain no PII. Operations overview exposes AI execution states and explicitly states that autonomous sensitive actions are disabled.

Audit includes actor, action, resource, safe before/after, reason, request/correlation/trace IDs. Worker completion reconstructs the original actor/context. AI evidence stores safe reference/output hashes, not credentials or unnecessary personal data.

Migration `202609100001_supply_demand_ai_operations` extends the 25-migration F9 baseline to 26. It is additive, uses restrictive FKs/checks/indexes/immutability triggers and no cascade deletes. All 20 tables have RLS enabled and forced, no permissive policies, and revoke PUBLIC, `anon`, `authenticated` and `service_role` access.

## Threat-control summary

| Threat | Control |
| --- | --- |
| Forged Market/geography/service | authoritative lookup/FK and cross-Country/lifecycle checks |
| Metric tampering | deterministic computation, immutable digest/evidence, forced RLS |
| Unbounded queries | typed pagination and 366-day cap |
| Readiness auto-activation | inactive blocker and no Market write |
| Arbitrary AI/model/tool | closed registries and server-side routing |
| Injection/exfiltration | trust separation, pattern gate, allowlist and redaction |
| Malicious output | strict schema/safety rejection and no automatic action |
| Self/stale approval | four-eyes and exact artifact digest |
| Replay/cost multiplication | advisory lock, unique key, lease, one artifact/cost boundary |
| Privilege escalation | dedicated RBAC plus audited 401/403 |

F10 closure does not make the product globally production-ready. Real provider execution, traffic and Market activation require a later go-live gate with legal, infrastructure, operational, cost and load/soak approval.
