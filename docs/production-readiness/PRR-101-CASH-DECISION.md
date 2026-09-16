# PRR-101 — CASH decision record

- Status: **OPTION B SELECTED — COMPATIBILITY RETIREMENT IN PROGRESS**
- Date: 2026-09-16
- Baseline: `d74b27c2b6378e4207a2264b234148e9b53cdcc0`
- Governing proposal: [ADR 0010](../adr/0010-governed-cash-payment-workflow.md)
- Existing containment: [ADR 0009](../adr/0009-cash-payment-quarantine.md)
- Migration: **NONE**
- PostgreSQL behavioral change: **NONE**
- PRR-102: **REJECTED FOR THIS SCOPE — governed-CASH implementation will not start**

## Recommendation

Recommend **permanent removal of CASH for the initial production scope (Option B)**. It materially reduces
collection, debt, dispute, support, security and jurisdictional risk, while the repository contains no
approved business case demonstrating that CASH benefit pays for the continuing control plane.

Option A remains documented as a rejected alternative. CASH stays permanently unavailable in ES, BR and
CL; any later return requires a new accepted ADR and the complete Option A approval gate.

## Recorded resolution

Alejandro explicitly selected **Option B — permanent removal** in the repository work session on
2026-09-16. This is sufficient authority for the safe implementation work: remove CASH from active client
contracts and retain the authenticated, no-store rejection for legacy clients. It is not evidence of a
qualified Legal/Privacy review or a production/Market release decision.

The detailed Option A rows below are retained as decision evidence only. They do not block Option B
retirement work. Residual Legal/Privacy and support-communication evidence remains required before any
public release or route deletion.

## Decision matrix

Only the permitted statuses `PROPOSED`, `TECHNICALLY_RESOLVED`, `HUMAN_APPROVAL_REQUIRED` and `REJECTED`
are used. `TECHNICALLY_RESOLVED` means the architecture has one coherent answer; it does not grant
business, financial, security, legal, release or production authority.

| Decision | Recommended option | Alternatives | Technical rationale | Financial impact | Security impact | Legal/Privacy review | Business approval | Status |
|---|---|---|---|---|---|---|---|---|
| D01 Keep or remove CASH | Remove permanently | Governed Option A is rejected for current scope | Lowest-complexity production-safe contract; Option A remains specified as historical architecture | avoids receivable/loss; may reduce conversion | removes cash/token/debt abuse surface | REQUIRED for removal messaging and any future retention | User decision recorded; organization role not independently asserted | REJECTED |
| D02 Eligible professional definition | all server-derived gates in ADR 0010 | narrower Market-specific gates only if stricter | one `ProfessionalCashEligibility`; deny on any unknown | prevents exposure to ineligible/debtor supply | no client boolean or stale cache authority | review verification, debt and suspension effects | Product/Finance thresholds REQUIRED | TECHNICALLY_RESOLVED |
| D03 Tokenized payment method authority | verified Stripe SetupIntent/Customer/PaymentMethod binding | approved PSP adapter equivalent | provider-hosted capture; opaque refs only | setup cost; no collection guarantee | prevents PAN/CVC scope and arbitrary token use | purpose/disclosure/retention REQUIRED | provider strategy REQUIRED | HUMAN_APPROVAL_REQUIRED |
| D04 Fee trigger | canonical committed Booking `COMPLETED` transition | approved partial-service adjustment; never declaration | strongest existing service-delivery authority; atomic obligation | avoids charging accepted/cancelled work | CAS prevents forged/duplicate trigger | service/fee terms REQUIRED | Product/Finance REQUIRED | HUMAN_APPROVAL_REQUIRED |
| D05 Fee policy/version authority | F3 frozen pricing + effective MarketPolicyVersion | none | no duplicate formula or actor amount | exact minor-unit receivable | tamper-resistant server authority | tax/fee applicability REQUIRED | Finance REQUIRED | TECHNICALLY_RESOLVED |
| D06 Off-session strategy | authenticated setup, explicit terms, idempotent off-session attempt, on-session recovery | no automated collection (manual settlement) | accepts SCA/requires-action reality | failure and recovery cost | provider verification/webhook/inbox | SCA/mandate/terms per Market REQUIRED | Finance/Product REQUIRED | HUMAN_APPROVAL_REQUIRED |
| D07 Failed charge behavior | preserve due obligation, categorized attempt, policy retry/debt; never success | immediate suspension; manual-only | convergent state and honest evidence | creates aging/possible loss | stops duplicate/unsafe retry | notices/fairness REQUIRED | Finance/Product thresholds REQUIRED | TECHNICALLY_RESOLVED |
| D08 Debt threshold | versioned minor-unit + aging threshold per Market/currency; missing means CASH ineligible | zero tolerance; manual review | no global guessed number | determines exposure/write-off | limits bypass/aggregation errors | collections/fairness REQUIRED | Finance/Product value REQUIRED | HUMAN_APPROVAL_REQUIRED |
| D09 Suspension policy | staged CASH restriction then financial suspension under versioned policy | CASH-only permanent block; case review | separate, audited lifecycle and re-evaluation | reduces loss but can reduce supply | no silent/manual bypass | notice/appeal/proportionality REQUIRED | Product/Finance REQUIRED | HUMAN_APPROVAL_REQUIRED |
| D10 Retry policy | failure-category allowlist, capped schedule, stop on action/expiry/unknown | no automatic retry | provider-safe idempotent convergence | balances collection/cost | limits brute/replay/duplicate charge | timing/notice REQUIRED | Finance REQUIRED | HUMAN_APPROVAL_REQUIRED |
| D11 CASH settlement state machine | declarations/acknowledgement/dispute separate from fee | no settlement record under Option B | does not claim unverifiable offline truth | no platform cash posting | prevents legacy confirmation abuse | evidence purpose/retention REQUIRED | Product workflow REQUIRED | TECHNICALLY_RESOLVED |
| D12 Dispute behavior | separate service, offline-cash and platform-fee scopes; freeze/compensate | support-only under Option B | prevents cross-domain state corruption | preserves receivable/reversal integrity | narrow actors and immutable events | dispute rights/evidence REQUIRED | Ops/Product/Finance REQUIRED | HUMAN_APPROVAL_REQUIRED |
| D13 Manual adjustment rules | compensating proposal only, linked source, exact digest/reason | prohibit adjustments | immutable financial history | explicit credit/waiver/write-off | no direct status/amount override | retention/authority REQUIRED | Finance REQUIRED | TECHNICALLY_RESOLVED |
| D14 Four-eyes controls | distinct requester/reviewer; separate executor for money movement | stricter three-person control for all values | matches existing high-impact pattern | reduces error/fraud cost | blocks self/stale approval | governance review REQUIRED | Finance/Security REQUIRED | TECHNICALLY_RESOLVED |
| D15 Market activation rules | ES/BR/CL OFF; effective reviewed MarketPolicy + independent flags/cohort/release | permanent OFF | deployment never activates behavior | contains Market exposure | fail closed on stale/unknown | qualified review per Market REQUIRED | Product/Finance release approval REQUIRED | TECHNICALLY_RESOLVED |
| D16 Consent/version requirements | immutable exact CASH/fee/off-session/privacy evidence by Market/locale | removal notice/version only | reproducible authorization context | supports fee enforceability evidence | prevents stale/replayed terms | REQUIRED; no compliance claim | Product terms REQUIRED | HUMAN_APPROVAL_REQUIRED |
| D17 Retention/audit requirements | class-specific versioned retention; immutable financial/audit, controlled anonymization | shortest lawful removal evidence | evidence survives rollback and correction | supports reconciliation/write-off | narrow reads, redaction, RLS | exact periods/transfers REQUIRED | Finance/Security owners REQUIRED | HUMAN_APPROVAL_REQUIRED |

## Human resolution rule

- Selecting **Option A** requires explicit acceptance of D01 and every `HUMAN_APPROVAL_REQUIRED` row by
  the named owners, plus recorded legal sources/reviewer/date for ES, BR and CL or an explicit decision to
  keep a Market OFF.
- Selecting **Option B** requires a recorded product decision and a versioned contract/support retirement.
  Security and Legal/Privacy must confirm the residual data/communication treatment before public release
  or endpoint deletion. The user decision is recorded above; those specialist reviews are not claimed.
- No response, partial approval or CI success is an approval. In those cases PRR-101 remains
  `AWAITING HUMAN APPROVAL`, CASH remains quarantined and PRR-102 remains blocked.
