# PRR-101 — Human approval packet

- Status: **OPTION B SELECTED — RESIDUAL REVIEW OPEN**
- Decision proposal: [ADR 0010](../adr/0010-governed-cash-payment-workflow.md)
- Decision matrix: [PRR-101 CASH decision](PRR-101-CASH-DECISION.md)
- Current safe state: CASH OFF; ES/BR/CL OFF; PRR-102 not started; production and live money unauthorized

## Decision to record

Exactly one option may be selected for this decision revision:

- [ ] **OPTION A — APPROVE CASH WORKFLOW FOR IMPLEMENTATION** under every condition below. This
  authorizes a separately planned PRR-102 implementation/test slice only; it does not activate CASH,
  Markets, Stripe live, production or real-money collection.
- [x] **OPTION B — REMOVE CASH PERMANENTLY** through a versioned compatibility-retirement plan. This
  does not authorize deletion or rewriting of historical payment/audit evidence.
- [ ] **NO DECISION — KEEP QUARANTINED** and retain `AWAITING HUMAN APPROVAL`.

Decision source: `Alejandro, explicit repository instruction on 2026-09-16; organizational role not independently asserted`

Decision revision/digest: `recorded by ADR 0010; delivery SHA remains pending CI`

## PRODUCT approval

Decisions to accept:

- quantified customer/professional value and affected segments for keeping CASH, or accepted conversion/
  access impact of permanent removal;
- completion trigger, offline declaration wording, partial-service and three-scope dispute UX;
- debt notice, grace, restriction, suspension, appeal/reactivation and support ownership;
- Market/cohort rollout order and success/abort thresholds;
- if Option B, client capability removal, minimum version, support window and communications.

Risks: false user confidence about offline payment, supply loss after suspension, conversion loss after
removal, support volume, inconsistent Market UX and accidental claim that HomeServices handled the cash.

Conditions/evidence:

- [ ] decision rationale and measurable expected benefit/cost;
- [ ] customer and professional journeys reviewed, including accessibility/offline/failure states;
- [ ] support/dispute ownership and service levels;
- [ ] ES/BR/CL each explicitly OFF or included in a later separately approved rollout;
- [ ] no client-authoritative CASH/Market/amount/success input.

Impact of rejection: Option A cannot proceed. Product may approve Option B; otherwise quarantine remains.

- Reviewer/name: `PENDING`
- Role/authority: `PENDING`
- Decision: `PENDING`
- Date: `PENDING`
- Evidence link: `PENDING`
- Exact proposal SHA/digest: `PENDING`

## FINANCE approval

Decisions to accept:

- F3 fee basis/version, recognition trigger and exact accounting postings;
- receivable aging, retry categories/schedule, grace, thresholds and currency isolation;
- provider cost/decline/chargeback exposure and reconciliation ownership;
- waiver, write-off, refund/credit, partial-service adjustment and four-/three-eyes thresholds;
- financial suspension/reactivation and maximum tolerated loss;
- Option A operating economics versus Option B foregone conversion.

Risks: uncollectible debt, duplicate/overcharge, premature revenue recognition, provider fee/chargeback
loss, mixed currencies, irreconcilable offline claims and unfair suspension.

Conditions/evidence:

- [ ] account mapping and recognition timing signed by Finance;
- [ ] per-Market/currency thresholds and retry schedule versioned (no missing defaults);
- [ ] immutable balanced ledger and provider reconciliation acceptance criteria;
- [ ] charge/adjustment/waiver separation of duties;
- [ ] sandbox scenario plan and abort thresholds;
- [ ] no service cash recorded as platform cash.

Impact of rejection: Option A is not economically authorized. Option B is the recommended resolution.

- Reviewer/name: `PENDING`
- Role/authority: `PENDING`
- Decision: `PENDING`
- Date: `PENDING`
- Evidence link: `PENDING`
- Exact proposal SHA/digest: `PENDING`

## SECURITY approval

Decisions to accept:

- Stripe-hosted/tokenized setup boundary and provider customer/method ownership validation;
- authentication/SCA recovery, signed webhook inbox, idempotency and concurrency controls;
- RBAC permissions, four-eyes thresholds and administrator non-bypass;
- data classification, encryption/access, RLS/default deny, safe metadata and redaction;
- threat model, abuse monitoring, secrets/API-version management and incident runbooks;
- Option B residual route retirement and historical-data protections.

Risks: PAN/CVC leakage, stolen/foreign PaymentMethod IDs, IDOR, forged Market/state/amount, duplicate
charge, webhook forgery, admin fraud, debt bypass, terminal resurrection and sensitive dispute leakage.

Conditions/evidence:

- [ ] threat table accepted with an owner/test for every threat;
- [ ] no card data enters HomeServices server/logs/analytics;
- [ ] exact provider refs are server-resolved and access-restricted;
- [ ] permission and separation-of-duty matrix approved;
- [ ] provider sandbox, negative security and PostgreSQL race tests required for PRR-102;
- [ ] secret/history scan, dependency audit and exact-SHA CI gates remain mandatory.

Impact of rejection: Option A remains blocked. Quarantine is retained; Option B may proceed.

- Reviewer/name: `PENDING`
- Role/authority: `PENDING`
- Decision: `PENDING`
- Date: `PENDING`
- Evidence link: `PENDING`
- Exact proposal SHA/digest: `PENDING`

## LEGAL/PRIVACY review

Decisions to review—not legal conclusions in this packet:

- applicable CASH, fee authorization, saved-method and off-session terms per ES/BR/CL;
- SCA/mandate/card-network treatment and professional notice/interaction requirements;
- service, cash-settlement and fee dispute wording/rights;
- debt, retry, suspension, appeal, waiver/write-off and collections terms;
- controller/processor/recipient roles, provider disclosure and cross-border transfers;
- lawful purpose/basis, minimization, rights, retention/holds and controlled anonymization;
- tax/invoicing implications delegated to qualified tax/finance review;
- if Option B, removal communications, contract changes and retention of legacy evidence.

Risks: invalid or unclear authorization, unfair/unnoticed off-session charge, excessive retention,
incorrect provider disclosures, unlawful automated suspension, jurisdictional drift and presenting
engineering assumptions as compliance.

Conditions/evidence for every Market proposed for future activation:

- [ ] authoritative source URL, version/date and qualified reviewer recorded;
- [ ] exact policy/document IDs, digests, locales and effective intervals;
- [ ] approved retention table by data/evidence class and legal hold behavior;
- [ ] approved notice, withdrawal/revocation and previously incurred obligation effects;
- [ ] DPA/transfer/provider review and data inventory;
- [ ] unresolved Market remains OFF with a tested fail-closed decision.

Impact of rejection: rejected Market stays OFF. If all Markets reject Option A, choose Option B or retain
quarantine. Engineering must not substitute a legal answer.

- Reviewer/name: `PENDING`
- Role/authority/jurisdiction: `PENDING`
- Decision: `PENDING`
- Date: `PENDING`
- Sources/evidence link: `PENDING`
- Exact proposal SHA/digest: `PENDING`

## Cross-functional implementation-entry gate

PRR-102 may become dependency-ready only when all of the following are true:

- [ ] Option A is explicitly selected; otherwise PRR-102 is rejected/re-scoped to removal work;
- [ ] all four sections contain authorized named decisions for the exact proposal SHA/digest;
- [ ] D01–D17 have no unresolved approval required for the selected initial Market scope;
- [ ] exact initial Markets are named; all others remain OFF;
- [ ] provider API/account model and sandbox acceptance suite are approved;
- [ ] implementation plan is split into additive schema, backend, provider, frontend/admin, tests,
  reconciliation/runbooks and release gates, with flags OFF by default;
- [ ] no production, live-money, Market activation or destructive operation is bundled into that approval.

## Approval outcome record

- Selected option: `OPTION B — REMOVE CASH PERMANENTLY`
- Product/Finance decision: `repository instruction recorded; organizational roles not independently asserted`
- Security: `legacy endpoint and no-mutation regression evidence required in the exact-SHA CI`
- Legal/Privacy: `REQUIRED before public communication, Market activation or endpoint deletion`
- PRR-101 status: `COMPATIBILITY RETIREMENT IN PROGRESS`
- PRR-102 status: `REJECTED FOR THIS SCOPE / NOT STARTED`
- Production/Markets/CASH: `OFF / NOT AUTHORIZED`
