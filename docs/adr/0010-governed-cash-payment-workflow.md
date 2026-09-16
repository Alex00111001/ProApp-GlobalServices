# ADR 0010 — Governed cash payment workflow and professional fee collection

- Status: **ACCEPTED — OPTION B COMPATIBILITY RETIREMENT**
- Date: 2026-09-16
- Owners: Product, Finance, Billing, Marketplace, Professional Experience, Security, Legal/Privacy and Operations
- Supersedes: none; extends [ADR 0009](0009-cash-payment-quarantine.md), which remains accepted and in force
- Governing architecture: [Billing](../BILLING_SYSTEM.md), [Markets](../MARKETS_IDENTITY_GEOGRAPHY.md), [PRR execution plan](../production-readiness/PRODUCTION_REMEDIATION_EXECUTION_PLAN.md)
- Scope: PRR-101 Option B decision and compatibility retirement only
- Runtime/schema/migration change: legacy rejection only; no schema or migration change

## Context and non-authorizations

ADR 0009 quarantines an unsafe legacy command that confused a customer declaration, professional
acceptance, provider payment and booking confirmation. `CASH_PAYMENT_ENABLED` remains fail-closed and
disabled. The current `Payment` aggregate represents provider-processed payment evidence, and the current
booking completion service requires a `Payment` in `COMPLETED`. Neither fact may be silently reinterpreted.

This ADR compares two valid product decisions:

- **Option A — governed CASH:** the customer pays the professional offline; HomeServices later collects
  only its authorized platform fee from a reusable provider-tokenized professional card.
- **Option B — remove CASH permanently:** remove CASH from product contracts and user interfaces through
  a versioned compatibility retirement, while retaining historical evidence and the fail-closed legacy
  response during the announced migration window.

The repository owner selected Option B on 2026-09-16. This authorizes the compatibility-retirement
implementation only. It does not activate a Market, enable CASH, create a SetupIntent, charge a card,
move real money, or alter Prisma data.

## Decision

The recorded human decision is `PERMANENTLY REMOVE CASH FROM PRODUCT` (Option B). Option A is rejected
for the current product scope and its detailed design remains historical context, not an implementation
authorization.

The architecture recommendation is **Option B for the initial production scope**, because no reviewed
business evidence currently demonstrates that incremental CASH conversion outweighs collection loss,
support, dispute, accounting and multi-market compliance cost. Option A is technically viable and fully
specified below; it becomes the recommended path only if Product and Finance accept its operating model
and Security and qualified Legal/Privacy reviewers approve the controls per Market. Absence of any one
approval leaves Option A rejected by default and CASH quarantined.

| Dimension | Option A — governed CASH | Option B — permanent removal |
|---|---|---|
| Benefit | Payment choice; possible conversion/access benefit | Simpler customer promise and one provider-backed settlement model |
| Financial risk | Failed professional fee collection, debt, chargebacks, write-offs | Lost bookings where cash is demanded; no cash-fee receivable |
| Operational risk | Retry queues, disputes, collections, suspensions, reconciliation | Compatibility retirement and support communication only |
| Charge/failure risk | Card on file is not a guarantee; SCA, expiry, declines and outages remain | No off-session fee charge |
| Compliance/privacy | New professional payment purpose, terms, disclosures, retention and debt controls per Market | Removal copy/contract review; lower payment-data scope |
| UX | Extra professional setup, notices and recovery; customer offline ambiguity | Fewer choices; predictable provider payment |
| Support | Three dispute types plus payment-method/debt recovery | Questions about removal and legacy clients |
| Reconciliation | Offline memo evidence + receivable + provider fee charge | Existing provider capture/refund/payout reconciliation |
| Fraud | Collusion, false declarations, fee avoidance, token abuse | Cash-specific fraud surface removed |
| Complexity | High and ongoing across Billing, Booking, Professional, Markets, Privacy and Admin | Low-to-medium one-time contract retirement |
| Rollback | Disable by Market/cohort; stop new obligations; reconcile in-flight charges/debt | Restore only through a new approved ADR/workflow; do not revive legacy endpoint |
| ES/BR/CL | Independently OFF until policy, provider, legal and operational gates pass | CASH unavailable in all three; market-specific communications remain possible |

## Domain boundary and money model for Option A

```text
Customer --physical cash, outside platform--> Professional
Booking --canonical completion event--> CashFeeObligation
CashFeeObligation --authorized amount only--> provider PaymentIntent (professional card)
Provider success --> platform fee collected + immutable ledger evidence
Provider failure/requires_action --> professional debt/collection workflow (never success)
```

The following facts are separate and cannot be collapsed:

| Fact | Authority | Financial meaning |
|---|---|---|
| Service value | frozen F3 booking pricing snapshot | value of service; not platform cash |
| Cash settlement | `CashSettlement` declarations/acknowledgements | bounded offline evidence, never provider settlement proof |
| Platform fee | F3 pricing policy/version frozen on booking | amount owed to HomeServices under approved terms |
| Tax basis | reviewed Market tax-policy reference | separate input; this ADR makes no tax conclusion |
| Professional debt | `ProfessionalFinancialDebt` backed by obligations/adjustments | outstanding receivable, never hidden by rewriting history |
| Provider charge | tokenized-card PaymentIntent for fee only | external collection attempt, not total service payment |
| Ledger evidence | immutable balanced postings | receivable/collection/adjustment truth |

The current `Payment` record must not represent the service's cash value. PRR-102 must first introduce a
versioned booking settlement-satisfaction contract so `Booking.COMPLETED` can distinguish provider-paid
service settlement from approved offline settlement evidence without weakening the existing card path.

## Single authority for professional eligibility

`ProfessionalCashEligibility` is a server-computed decision, not a client field or durable manually
editable boolean. It is evaluated at offer time, booking acceptance and immediately before fee collection.
It returns `ELIGIBLE` only when every input is current and affirmative:

1. professional and user are active and the professional verification/approval state is valid;
2. booking service/category and professional service eligibility are valid;
3. the authoritative Market is active and its effective reviewed `MarketPolicyVersion` explicitly enables
   CASH for the environment/cohort; missing, stale or unreviewed policy fails closed;
4. F3 produced a frozen fee definition, version, digest, amount and ISO currency for that booking;
5. one reusable `ProfessionalPaymentMethod` owned by the same professional/provider customer is `READY`;
6. setup authentication completed and provider evidence has not been revoked, detached or expired;
7. exact current CASH, fee collection, off-session and contractual versions were accepted with immutable
   evidence in the required locale/Market;
8. no blocking open debt, financial suspension, CASH dispute restriction or unacceptable risk state exists;
9. independent feature and execution gates are enabled for the exact Market/environment/cohort.

Unknown provider state, timeout, forged Market, stale consent, ownership mismatch or policy-resolution
failure yields an explicit ineligible reason and no CASH offer. Clients may render the decision but cannot
produce or override it.

## Tokenized method and provider strategy

Option A uses Stripe's setup primitives behind the existing provider adapter. The implementation design is:

- create or resolve the professional's platform-side provider customer inside the trusted service;
- create a SetupIntent (or provider-equivalent approved primitive) for future off-session card use;
- collect card data only in Stripe-hosted/SDK UI; HomeServices never receives or stores PAN, CVC, track
  data, cryptograms or complete card details;
- accept readiness only from a signed provider event or verified server retrieval that binds the
  SetupIntent, customer and PaymentMethod to the same professional and intended usage;
- persist opaque provider customer/payment-method/setup references and bounded display metadata only:
  brand, last four, expiry month/year, funding/type where approved, provider status and timestamps;
- never accept an arbitrary `paymentMethodId` from a client as ownership or readiness proof.

The provider lifecycle projection is:

```text
NO_PAYMENT_METHOD -> SETUP_REQUIRED -> READY
SETUP_REQUIRED -> REQUIRES_ACTION | FAILED | REVOKED
READY -> EXPIRED | REQUIRES_ACTION | FAILED | REVOKED
EXPIRED | FAILED | REQUIRES_ACTION -> SETUP_REQUIRED
REVOKED -> SETUP_REQUIRED
```

`NO_PAYMENT_METHOD` is absence/derived state, not a fake provider object. `READY` means setup evidence is
currently usable under policy; it does not guarantee future authorization or funds.

Stripe's current guidance requires explicit terms for future/off-session use and warns that later charges
can fail or require the professional to return and authenticate. PRR-102 must pin the provider API version
and validate the exact sandbox behavior before implementation approval. Technical source reviewed
2026-09-14: https://docs.stripe.com/payments/save-and-reuse and
https://docs.stripe.com/strong-customer-authentication.

## SCA and off-session collection

Initial setup occurs while the professional is present and authenticates whenever the issuer/provider
requires it. The evidence records purpose, expected timing/frequency, amount-determination method,
Market, terms/document digest, locale, timestamp and channel. It is not marketing consent.

When the fee becomes collectible, the worker creates one PaymentIntent for the exact fee amount/currency,
with `off_session=true`, confirmation requested, stable idempotency and bounded internal metadata. Results:

- success: reconcile provider identity/amount/currency, then settle the obligation transactionally;
- `requires_action`: open/retain debt, pause automated retries, notify the professional to authenticate in
  a new on-session recovery flow; never mark charge or obligation paid;
- declined/insufficient funds: retain failure category, schedule only policy-authorized retries and debt;
- expired/detached/revoked method: make eligibility fail, request replacement, retain the debt;
- provider timeout/unknown result: do not create a second PaymentIntent; retrieve/reconcile the original
  idempotent command before retrying;
- provider outage: keep the obligation due, do not change Booking completion, and alert Operations.

## F3 fee authority and authoritative trigger

F3 remains the only amount authority. At booking creation/acceptance, the existing pricing snapshot and
effective `PricingPolicy`/`MarketPolicyVersion` must freeze: service value, platform fee definition,
professional commission/fee basis, exact minor-unit fee, currency, Market, booking/service references,
policy IDs/versions/digests and effective timestamp. CASH cannot submit or recalculate an amount.

The single fee-right trigger is the committed canonical `Booking -> COMPLETED` transition. It is strongest
because acceptance or start can still cancel, while either actor's cash button is unverifiable and
actor-biased. Completion must use the approved Booking evidence policy and CAS transition. The obligation
is created atomically with that transition/outbox/audit write, at most once per booking and fee type.

The right to a fee and the attempt to collect it are distinct. Collection is scheduled only after the
Market-configured dispute/grace interval. A service dispute opened before execution freezes collection;
an offline-cash disagreement alone does not fabricate settlement. Cancellation creates no completed-
service fee; any future cancellation fee requires its own F3 policy and is outside this ADR. Partial
service requires an approved Booking adjustment before completion and a compensating financial decision,
never an arbitrary percentage supplied by an actor.

## State machines

### Offline cash settlement

`CashSettlement` records assertions, not verified platform receipt.

```text
NOT_APPLICABLE -> DECLARATION_PENDING              (booking selects governed CASH)
DECLARATION_PENDING -> DECLARED_RECEIVED           (professional; booking IN_PROGRESS/COMPLETED)
DECLARATION_PENDING -> CUSTOMER_ACKNOWLEDGED       (customer; booking IN_PROGRESS/COMPLETED)
DECLARED_RECEIVED <-> ACKNOWLEDGED                  (other actor supplies matching acknowledgement)
any nonterminal -> DISPUTED                         (customer/professional/support with reason)
DECLARATION_PENDING|DECLARED_RECEIVED|CUSTOMER_ACKNOWLEDGED|ACKNOWLEDGED -> CLOSED
DISPUTED -> CLOSED                                  (approved dispute resolution only)
```

Declarations are append-only facts behind a projected state. `CLOSED` never proves cash moved. Duplicate
same-actor/same-booking/same-declaration-version requests replay; conflicting payload digests return 409.
Terminal Booking states are never changed by this machine.

### Fee obligation and collection

```text
SCHEDULED -> DUE -> COLLECTION_PENDING -> SETTLED
                              |-> COLLECTION_FAILED -> DUE
                              |-> REQUIRES_ACTION -> DUE (after authenticated recovery)
SCHEDULED|DUE|COLLECTION_PENDING|COLLECTION_FAILED|REQUIRES_ACTION -> DISPUTED
DISPUTED -> DUE | WAIVED | ADJUSTED
DUE|COLLECTION_FAILED|REQUIRES_ACTION -> DEBT_OPEN
DEBT_OPEN -> DUE | SETTLED | WAIVED | ADJUSTED
```

`SETTLED`, `WAIVED` and a fully compensated `ADJUSTED` outcome are terminal for that obligation. They
cannot return to payable state; a correction is a new linked adjustment/reversal. Provider attempts have
their own `CREATED -> PROCESSING -> SUCCEEDED|FAILED|REQUIRES_ACTION|CANCELLED` lifecycle. Only verified
provider success can produce `SETTLED`.

Allowed actors are: Booking service creates the obligation; a trusted worker creates/retries attempts;
signed webhooks or verified server retrieval finalize provider outcomes; professional/customer create
their own declarations/disputes; narrow administrators review disputes and propose/approve adjustments.
No UI or generic administrator may set success states directly.

## Disputes

Three scopes remain separate:

- **service dispute:** whether/how the service was delivered; may freeze the fee and cause a Booking/F3
  adjustment through an approved workflow;
- **cash settlement dispute:** conflicting offline assertions; cannot reverse provider evidence or prove
  either party paid;
- **platform fee dispute/chargeback:** dispute over HomeServices' fee charge; reconciled against provider
  evidence and the fee obligation, not the service cash amount.

| Scenario | Required behavior |
|---|---|
| customer says paid, professional says not | open cash dispute; no platform cash entry; fee follows completion/dispute policy |
| professional says received, customer disputes | preserve both assertions; freeze if service dispute qualifies |
| fee already collected then approved reduction | compensating credit/refund decision and ledger reversal; never edit charge/history |
| fee not yet collected and dispute opens | freeze attempt; obligation remains visible until resolution |
| fee chargeback | open platform-fee dispute/debt; reconcile provider event; do not alter service cash evidence |
| booking cancelled | no completed-service obligation; cancel unaccepted scheduled work, retain evidence |
| partial service | require reviewed Booking/F3 adjustment; prohibit actor-supplied amount |

## Debt and suspension policy

`ProfessionalFinancialDebt` is an aggregate projection of immutable fee obligations, collections,
adjustments and waivers. It does not store a manually editable balance. Market policy versions:

- retry schedule and maximum attempts by safe failure category;
- grace period and notice cadence;
- minor-unit debt and aging thresholds for losing CASH eligibility and broader financial suspension;
- whether multiple obligations aggregate by professional and currency (currencies never mix);
- reactivation prerequisites: cleared/reconciled debt, READY method, current terms and risk review;
- manual-review thresholds and owners;
- write-off/waiver authority, four-eyes limits, reason taxonomy and evidence retention.

Missing values fail closed: CASH is ineligible and no automated charge executes. An unpaid fee moves from
receivable aging to `DEBT_OPEN`; it is never concealed by changing the original obligation or attempt.
Suspension is a separate reasoned decision (`NONE -> CASH_RESTRICTED -> FINANCIAL_SUSPENDED -> RESOLVED`)
with policy version, effective time, notice and audit. Resolution restores eligibility only after all
current gates re-evaluate successfully.

## Idempotency, concurrency and transaction boundaries

- one unique obligation per `(bookingId, feeType, pricingPolicyId, pricingPolicyVersion)`;
- one logical collection command per obligation/version; attempts use `(obligationId, attemptNumber)`;
- one provider PaymentIntent ID per attempt and one provider event per provider/event ID;
- all commands use durable idempotency key + canonical request digest; same key/different digest conflicts;
- Booking completion CAS, obligation, audit and outbox commit in one PostgreSQL transaction;
- provider command is claimed with a bounded lease, executed outside the transaction and finalized with
  state/version comparison; an unknown outcome is retrieved before retry;
- signed events persist in the integration inbox before processing and are replay-safe;
- cancellation/completion and dispute/charge races lock or conditionally update the same authoritative
  rows; no terminal Booking resurrection and no charge after a qualifying freeze;
- app offline replay returns the existing declaration/decision without duplicate side effects.

Financial invariant: one booking produces at most the one frozen authorized fee, less approved
compensating credits; total successful collections cannot exceed the obligation and currency must match.

## Conceptual ledger postings

The ledger does not record the cash held by the professional as platform cash. Optional memo evidence may
record offline service value without debit/credit or cash-account impact.

| Event | Debit | Credit | Notes |
|---|---|---|---|
| fee becomes due | Professional fee receivable | Platform fee revenue/deferred revenue | exact accounting account requires Finance approval |
| provider fee charge succeeds | Provider clearing/cash | Professional fee receivable | fee amount only; provider fee separately reconciled |
| provider processing fee | Payment processing expense | Provider clearing/payable | only from provider balance evidence |
| failed/requires-action attempt | none | none | operational evidence; receivable remains |
| approved reduction/waiver/write-off | contra revenue or approved expense | Professional fee receivable | immutable compensating transaction |
| fee refund/chargeback | approved reversal/receivable accounts | provider clearing/cash | linked to original collection and provider event |

Every posted transaction balances in one currency, uses Decimal/minor units, is immutable and idempotent,
and links obligation, attempt, booking, policy and provider evidence. Finance must approve recognition
timing and account mapping before PRR-102.

## Conceptual implementation contract

No model below exists in Prisma in PRR-101.

| Aggregate | Ownership and immutable fields | Mutable projection/state | Uniqueness/invariants | Audit and retention |
|---|---|---|---|---|
| `ProfessionalPaymentMethod` | professional; provider/customer/setup/payment refs, created evidence | readiness, display metadata, checked/revoked times | provider ref unique; same owner/customer; never PAN/CVC | audit setup/replacement/revoke; provider/payment retention review |
| `ProfessionalCashEligibility` | derived decision; professional, Market/policy versions, input digest, evaluatedAt | none; new evaluation replaces cache | cannot be manually set; all gates required | bounded decision reasons; short cache; decision evidence retention reviewed |
| `CashSettlement` | booking + actors; declaration rows/times/digests | projected state/dispute link | one actor/declaration version; no financial success semantics | append-only assertions and audit; legal retention per Market |
| `CashFeeObligation` | booking, professional, fee/currency, policy IDs/versions/digests, trigger event | collection/debt/dispute projection | one frozen fee per booking/type; collected <= due | financial retention; no update/delete of source facts |
| `CashFeeCollectionAttempt` | obligation, attempt no., idempotency/digest/provider intent | processing/outcome/category/times | one provider command per attempt; signed reconciliation | financial/provider evidence; sanitized failures |
| `ProfessionalFinancialDebt` | professional/currency; linked source obligations/adjustments | aging/restriction projection | balance derived; no mixed currencies/manual overwrite | long-lived financial/audit evidence; reviewed write-off retention |
| `CashDispute` | scope, booking/obligation, opener, reason category, evidence digest | reviewed lifecycle/outcome | scope explicit; no cross-domain state rewrite | sensitive access, immutable events, reviewed retention |

No cascade delete may remove financial/audit/provider evidence. Data-subject workflows may anonymize
non-required identity only under an approved policy while preserving legally required accounting proof.

## Proposed API contract

All paths are design-only and versioned. Identity and ownership come from authentication and database
relations; amounts, professional, Market and success states are server-derived.

| Actor | Endpoint | Semantics |
|---|---|---|
| Professional | `POST /api/v1/professional/payment-methods/setup-intents` | create/replay provider setup for authenticated professional and resolved Market purpose |
| Professional | `GET /api/v1/professional/payment-methods` | bounded masked methods and readiness only |
| Professional | `DELETE /api/v1/professional/payment-methods/:id` | revoke/detach when no policy hold; never accepts provider ID as path |
| Professional | `GET /api/v1/professional/cash-eligibility` | server-derived decision/reasons/policy version |
| Customer/Professional | `POST /api/v1/bookings/:id/offline-settlement-declarations` | actor-owned declaration/acknowledgement/dispute intent; idempotency required |
| Admin | `GET /api/v1/admin/cash/obligations` | paginated financial read |
| Admin | `GET /api/v1/admin/cash/debts` | paginated debt read |
| Admin | `GET /api/v1/admin/cash/disputes` | paginated dispute read |
| Admin | `POST /api/v1/admin/cash/disputes/:id/reviews` | reasoned review, no direct financial success |
| Admin | `POST /api/v1/admin/cash/adjustments` | create compensating proposal from server-calculated source |
| Admin | `POST /api/v1/admin/cash/adjustments/:id/approvals` | distinct reviewer, exact digest and threshold |

Forbidden inputs include fee amount/formula, arbitrary professional/Market/provider IDs, provider outcome,
ledger accounts and `chargeSuccessful`. The legacy `/payments/cash` command is never rebuilt.

## RBAC and four-eyes

Future additions aligned to the real dotted permission catalog are:

- `cash.read`, `cash.disputes.read`, `cash.disputes.review`;
- `cash.debts.read`, `cash.debts.manage`;
- `cash.adjustments.create`, `cash.adjustments.approve`;
- `cash.reconciliation.run`.

There is no generic `cash.manage`. Backend permissions are authoritative. Significant waiver, debt
cancellation, manual financial adjustment and exceptional settlement correction require requester !=
reviewer, exact immutable decision digest, policy threshold, reason and audit. Execution identity is also
separate where provider money movement occurs. `SUPER_ADMIN` does not bypass separation-of-duty rules.

## Observability and privacy-safe events

Future domain events use dotted canonical names:

`cash.settlement.declared`, `cash.service.completed`, `cash.fee.due`,
`cash.fee.collection.attempted`, `cash.fee.collection.succeeded`,
`cash.fee.collection.failed`, `cash.fee.collection.requires_action`, `cash.debt.opened`,
`cash.professional.suspended`, `cash.dispute.opened`, `cash.adjustment.approved`.

Metrics use bounded Market, outcome, failure category, policy version and provider-adapter labels. Events
carry opaque booking/obligation/ledger references plus request/correlation/trace IDs. Never log or label
PAN, CVC, card fingerprint, raw provider payload, full provider token, names, contact data, addresses,
cash-dispute prose or unbounded issuer errors. Alerts cover duplicate-command invariant violation,
reconciliation mismatch, stuck attempt, debt aging, abnormal decline/chargeback rates and unauthorized
admin attempts; each requires an owner and runbook.

## Threat model

| Threat | Preventive control | Detection | Required test |
|---|---|---|---|
| fake cash confirmation | declarations have no settlement authority; completion CAS owns fee trigger | conflicting declarations/dispute metric | declaration cannot complete Booking or settle fee |
| client enables CASH | server MarketPolicy + eligibility, fail closed | denied reason count | forged flag/Market rejected |
| professional avoids fee | obligation atomic with completion; debt/eligibility gate | overdue aging/reconciliation | completed booking creates one obligation |
| replay/duplicate charge | durable key/digest, unique attempt/provider IDs | duplicate/conflict counters | concurrent replay yields one provider command |
| forged booking state | Booking service CAS and ownership | transition-conflict audit | skipped/terminal transitions rejected |
| terminal resurrection | terminal state immutable; separate aggregates | critical invariant alert | cancelled/completed booking never revived |
| compromised token reference | token opaque, encrypted where required, narrow access; provider re-verification | anomalous ownership/use audit | copied token/wrong owner rejected |
| arbitrary PaymentMethod ID | resolve server-side under expected provider customer | ownership mismatch event | foreign/detached method rejected |
| IDOR | authenticated ownership + RBAC + opaque internal IDs | 403 audit/rate alert | cross-professional/customer/admin tests |
| admin adjustment abuse | narrow permissions, four-eyes, digest/threshold | proposal/approval audit | self/stale/different-digest approval rejected |
| webhook forgery | signature + raw body + inbox before process | invalid signature metric | forged/replayed/out-of-order events |
| cancellation race | row lock/CAS + collection freeze check | race outcome metric | charge versus cancellation in PostgreSQL |
| dispute race | versioned state/lock; freeze before command | race/reconciliation alert | charge versus dispute interleavings |
| debt bypass | every eligibility evaluation reads authoritative debt/restriction | ineligible override attempt | stale cache/client boolean cannot enable |
| amount/currency tamper | F3 frozen snapshot and provider reconciliation | mismatch alert/dead letter | arbitrary amount/cross-currency rejected |

## Privacy, consent and Market requirement-control matrix

No row below declares legal compliance. `TECHNICALLY DEFINED` describes the engineering control only;
each Market remains OFF until qualified review and business authorization are recorded.

| Requirement | Technical control/version | ES | BR | CL | Approval owner |
|---|---|---|---|---|---|
| CASH terms | immutable document ID/digest, locale, Market, effective interval | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | Legal/Product |
| fee authorization | F3 fee method, amount basis, timing and cap acceptance | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | Legal/Finance |
| saved-method usage | provider purpose and reusable-method terms | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | Legal/Security |
| off-session authorization/SCA | setup evidence + recovery; no SCA bypass claim | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | Legal/Provider |
| privacy notice/provider disclosure | purpose, processor/recipient, transfer and rights references | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | Privacy |
| retention | policy by evidence class with hold/anonymization rules | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED | Legal/Privacy/Finance |
| debt/suspension terms | versioned thresholds, notices, review/appeal | BUSINESS APPROVAL REQUIRED + LEGAL REVIEW REQUIRED | same | same | Product/Finance/Legal |
| token/data minimization | provider-hosted capture; opaque IDs + bounded display metadata | TECHNICALLY DEFINED | TECHNICALLY DEFINED | TECHNICALLY DEFINED | Security |
| activation | reviewed `MarketPolicyVersion` + separate flags/cohort | BUSINESS APPROVAL REQUIRED | BUSINESS APPROVAL REQUIRED | BUSINESS APPROVAL REQUIRED | Product/Finance |

The evidence record includes subject, purpose, terms/policy IDs and digests, Market, locale, version,
timestamp, source/channel and integrity metadata. Withdrawal/revocation prevents new CASH bookings and
future collection attempts where legally/contractually applicable; it does not erase already incurred
obligations or mandatory evidence. The exact effect requires qualified review.

## COUNTRY/MARKET VARIATION GATE

1. This is operating policy, not territorial geography.
2. It belongs to `Market`/`MarketPolicyVersion`, while Billing owns money.
3. Existing payment-policy reference, F3 pricing and F7 evidence boundaries are extended, not duplicated.
4. Every rule and decision is server-authoritative.
5. All mutable legal, financial and operational rules are versioned.
6. All frontends consume contracts and do not encode national rules.
7. Unknown/disabled/stale/unreviewed state fails closed.
8. PRR-102 must test ES, BR, CL and unknown/disabled Markets.
9. Current card contracts remain unchanged; CASH legacy stays quarantined until versioned retirement or
   approved replacement.
10. Activation requires Product, Finance, Security, qualified Legal/Privacy, provider sandbox, Operations
    and a separately authorized release.

Initial state is `ES: OFF`, `BR: OFF`, `CL: OFF`. Deploying code or accepting this ADR can never switch it.

## Mandatory PRR-102 test contract

PRR-102 cannot start until the human decision selects Option A and the approval packet is complete. Its
minimum automated evidence is:

- eligibility: no/expired/revoked/foreign method, wrong Market, inactive/suspended professional, service
  ineligible, debt threshold, stale/revoked terms, provider unavailable;
- Booking: valid lifecycle, cancelled/completed/terminal rows, wrong actor, duplicate and concurrent
  completion, cash declaration independent of completion;
- fees: exact frozen version/amount/currency, one obligation, decline, insufficient funds,
  requires-action, expiry, timeout retrieval, authorized retry, success and duplicate/out-of-order webhook;
- concurrency: two declarations, completion/cancellation, charge/cancellation, charge/dispute, webhook/API,
  offline replay and processing-lease recovery on real isolated PostgreSQL;
- security: IDOR, forged provider reference/Market/amount/outcome, unauthorized admin, self-approval,
  stale/digest-mismatch approval, invalid webhook, redaction;
- financial: Decimal/minor-unit arithmetic, balanced/immutable ledger, collected <= due, one fee,
  currency isolation, debt aging/reactivation, compensating adjustment/waiver audit;
- provider contract: Stripe sandbox SetupIntent, authentication, off-session success/decline/
  requires-action, idempotent PaymentIntent retrieval and signed webhook replay; fakes supplement only;
- product contracts: customer/professional/admin states, accessibility, offline retry, ES/BR/CL and unknown
  Market, current card flow regression;
- operational: metrics/cardinality/redaction, reconciliation, alerts/runbooks, rollback and in-flight
  convergence.

## Consequences and risks

Option A creates a new platform receivable and collections operation even though the service money stays
offline. It increases support and legal review, can suspend supply after failed charges, and needs durable
provider/ledger/debt reconciliation. Its benefit must be measured against those costs.

Option B reduces financial and security surface and accelerates production readiness, but may reduce
access/conversion and requires a clear deprecation path for clients that still show CASH. It does not
permit deleting historical CASH evidence.

## Rollout and rollback

For Option A, future rollout is additive and application-first: schema/RBAC with flags OFF; provider
sandbox; shadow eligibility/fee calculation; internal cohort; one reviewed Market/canary; reconciliation
window; controlled expansion. Abort on any double command, unbalanced journal, provider/internal mismatch,
unbounded failure category, invalid permission result, debt bypass or legal/policy expiry. Rollback stops
new CASH offers and new obligations, then disables automated collection while reconciling accepted
provider commands and retaining debts/evidence.

For Option B, remove CASH from advertised capabilities and clients, retain the authenticated no-store
compatibility rejection for a versioned support window, publish minimum client enforcement, then retire
the route in a separately reviewed breaking-contract release. Retain audit and financial history. A later
return of CASH requires a new accepted ADR and full Option A gates.

## Approval evidence

Alejandro selected Option B explicitly in the repository work session on 2026-09-16. That instruction
authorizes this code and contract-retirement work, not a claim of qualified Legal/Privacy review or a
production/Market release decision. The companion [approval packet](../production-readiness/PRR-101-APPROVAL-PACKET.md)
records the remaining support-communication and residual-data review evidence. ADR 0009 remains in force
throughout the compatibility window. PRR-102 (the governed-CASH implementation) is rejected for this
scope; a future return of CASH requires a new accepted ADR and all Option A gates.
