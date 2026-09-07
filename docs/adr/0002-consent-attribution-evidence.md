# ADR 0002 — Consent, first-party identity and reproducible attribution evidence

- Status: Accepted for engineering; legal content pending qualified review
- Date: 2026-09-07
- Owners: Platform Engineering, Privacy Operations, Growth Operations
- Supersedes: none
- Governing architecture section: [Implementation plan — Phase 7](../IMPLEMENTATION_PLAN.md#phase-7--consent-and-attribution)

## Context

F6 records first-party growth events, campaigns, pseudonymous leads and conversions. Registration also stores mutable acceptance timestamps and document versions on `User`. Those fields are useful compatibility projections, but they cannot prove an immutable sequence of consent decisions, enforce purpose-specific processing, reconcile an anonymous browser with an authenticated account safely, or reproduce an attribution result under a particular model and window.

F7 must add those capabilities without making Growth a source of financial truth or making contractual service access conditional on marketing consent. The engineering boundary must work across supported countries while legal bases, policy text, evidence-retention periods and country-specific requirements remain configurable and subject to qualified privacy review.

## Decision

### Consent policies and decisions

`ConsentPolicy` is the versioned, country/locale-aware policy record. A policy declares a stable purpose, legal basis label, enforcement mode, document reference and digest, effective interval, evidence-retention setting, and legal-review evidence. Drafts may be prepared; activation requires approved review metadata and a valid effective date. An active version is never edited into a materially different policy. It is retired and replaced by a new version.

`ConsentDecision` is append-only evidence. `GRANTED`, `DENIED` and `WITHDRAWN` are distinct rows linked to the exact policy version, trusted subject key, source, bounded evidence, event time and request/correlation/trace context. Idempotency keys make retries deterministic. A withdrawal never deletes or overwrites an earlier grant.

Server-side enforcement resolves the currently effective policy and the latest applicable decision for the subject and purpose. It fails closed when the policy is missing, stale, prohibited, withdrawn, denied, or lacks the required explicit grant. The frontend is only a presentation and collection client; it is never the enforcement authority. Marketing denial or withdrawal does not block contractual booking, payment, support or account functions.

### Identity boundary

Raw anonymous and session identifiers are never persisted in F7 records. The server issues a short-lived, HMAC-authenticated proof for a pseudonymous subject derived with the F6 growth pseudonym secret. Anonymous consent and touchpoint requests must present that proof. Reconciliation is allowed only while authenticated and links the verified anonymous subject to the authenticated subject. A unique proof digest and one-to-one anonymous link prevent replay into a different account. Submitted user IDs or unhashed anonymous IDs are not accepted as authority.

Identity links are append-only evidence. They can expand the trusted subject-key set used for consent and attribution but cannot merge accounts or rewrite historical subjects.

### Touchpoints and privacy boundary

`Touchpoint` is a first-party, append-only acquisition observation. It stores bounded campaign/source/medium/channel values, HTTPS referrer origin/path without credentials/query/fragment, a landing pathname without query data, sanitized context, a trusted pseudonymous subject, exact consent-policy context, and request/correlation/trace evidence. Idempotency and stable uniqueness prevent duplicate ingestion.

Email, phone, postal address, payment data, credentials, tokens, raw anonymous IDs and secret-bearing URL components are rejected or removed before persistence and telemetry. Logs and metric labels contain only bounded classifications and opaque database IDs; they do not contain subject keys, evidence bodies, URLs or personal data.

### Reproducible attribution

`AttributionModel` versions an immutable model type (`FIRST_TOUCH` or `LAST_TOUCH`), purpose and lookback window. Activating a revised definition requires a new version. For each F6 `Conversion` and model version, `Attribution` records either the selected touchpoint or a bounded unattributed/consent-blocked reason, the evaluation window, calculation time and a canonical input digest. The unique conversion/model pair makes retries idempotent and prevents silent recalculation.

Candidate touchpoints must belong to the conversion's trusted subject-key set, precede the conversion, fall inside the model window, and carry the required consent context. Selection has a stable tie-breaker (`occurredAt`, then `id`). Attribution never changes `Conversion.value`, creates revenue, or mutates F3 financial records.

## API and authorization contracts

Public/self-service endpoints are versioned under `/api/v1/privacy`. They expose effective policies, signed anonymous-subject proofs, append-only decisions, current-user decision history, withdrawal, touchpoint ingestion, controlled identity reconciliation and current-user attribution evidence. Anonymous operations require a valid server proof; authenticated operations derive identity exclusively from the access token.

Administrative endpoints are versioned under `/api/v1/admin/privacy` and `/api/v1/admin/attribution`. Policy lifecycle and attribution-model lifecycle require their respective manage permissions. Consent-history, withdrawal, touchpoint and attribution reads use separate narrow permissions and write an administrative audit record because privacy evidence is sensitive operational data. Lists are server-paginated and bounded.

## Alternatives considered

- Continue overwriting registration acceptance columns: rejected because it destroys decision history and cannot prove withdrawal or purpose-specific enforcement.
- Trust a client `consent=true` value or raw anonymous ID: rejected because either can be forged and used for arbitrary account linking.
- Put UTM/referrer data in generic event metadata only: rejected because generic metadata cannot enforce the F7 privacy boundary, consent context or reproducible attribution contract.
- Recalculate attribution dynamically on every read: rejected because results would change silently as models or windows change.
- Copy conversion value into an attribution revenue table: rejected because F3/F6 already own the financial and conversion facts.

## Consequences and risks

The system stores additional immutable privacy evidence and therefore needs an approved retention/anonymization procedure before production activation. A fail-closed policy intentionally causes collection gaps when configuration or legal review is absent. Administrators must publish reviewed policies and models before enabling F7 collection.

Attribution is deterministic evidence for the configured model, not a claim of legal or scientific causality. Anonymous-to-authenticated reconciliation establishes an application identity link, not proof that two real-world people are the same.

## Contracts and data migration

The additive migration series `202609070001_consent_attribution`, `202609070002_consent_attribution_active_uniqueness` and `202609070003_consent_attribution_evidence_integrity` creates policies, immutable decisions, immutable identity links, immutable touchpoints, versioned models and immutable results. It adds foreign keys, uniqueness, indexes, concurrency-safe active-version constraints, cross-evidence integrity triggers, forced RLS and default-deny grants. Existing registration columns remain compatibility projections; they are not backfilled as consent evidence because doing so would invent evidence that was never collected under this contract.

No existing F1–F6 row is rewritten. No cascade delete is permitted from the new evidence tables. Database triggers reject update/delete of immutable evidence. Test cleanup requires an explicit transaction-local database setting.

## Security, privacy, and financial impact

The feature uses dedicated privacy/attribution permissions. Administrative sensitive reads and all lifecycle mutations are audited with actor and correlation context. HMAC secrets are validated in production and never returned. Evidence and context are allowlisted, bounded and centrally sanitized.

This phase does not execute payments, calculate ledger value or change billing records. Historical legal/financial evidence is preserved during withdrawal and rollback.

## Legal-source boundary

The engineering controls are informed by, but do not replace, qualified legal review. Source references used for the configurable contract are:

- EU: [GDPR Article 7 and related consent provisions](https://eur-lex.europa.eu/legal-content/EN/TXT/?qid=1510829288571&uri=CELEX%3A32016R0679+), [EDPB Guidelines 05/2020 on consent](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_en.pdf), and [AEPD consent guidance](https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/5-bases-legitimadoras-del-tratamiento/FAQ-0211-segun-el-rgpd-como-debe-solicitarse-el-consentimiento-de-los-interesados-para-tratar-sus-datos-personales).
- Brazil: [official English LGPD text](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/brazilian-data-protection-law.pdf) and [ANPD data-subject rights guidance](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).
- Chile: [Law 21.719 official consolidated future text](https://www.bcn.cl/leychile/Navegar?idNorma=1209272&idParte=10527471&idVersion=2026-12-01), whose cited version takes effect on 2026-12-01.

Policy wording, applicable legal basis, effective jurisdictional rules and evidence-retention durations remain `PENDING` until recorded qualified review. Engineering defaults must not be treated as legal conclusions.

## Observability and verification

Safe counters and structured events cover decisions, withdrawals, enforcement denials, accepted/rejected/sanitized touchpoints, reconciliation, attribution calculations and unattributed conversions. All operational events carry request/correlation/trace IDs where available. Tests prove redaction and prohibit PII in labels/logs.

Required evidence includes policy lifecycle, immutable decision history, stale/forged consent, withdrawal enforcement, identity spoofing/reconciliation, malicious URL normalization, idempotency, both attribution models/windows/versioning/reproducibility, F6 conversion integration, RBAC/audit, PostgreSQL/Supabase RLS and migration rehearsal, all clients, full F1–F6 regression, dependency audit, secret scan and remote GitHub Actions.

## Rollout and rollback

`CONSENT_ATTRIBUTION_ENABLED` defaults to false. In the test environment, enable it only after reviewed test policies and active attribution models exist. Production activation requires explicit release authorization plus qualified approval of each production policy, evidence-retention configuration, policy documents, locale/country applicability and operational ownership.

Rollback is application-first: disable F7 ingestion and calculation, leave policy/history/link/touchpoint/attribution evidence readable to authorized operations, and continue serving contractual product flows. Do not drop tables, rewrite decisions, delete links/results, or remove audit/outbox evidence. A database rollback is limited to a demonstrably unused migration in an isolated environment.

## Approval evidence

The repository owner explicitly authorized implementation and publication of F7 in the Codex task on 2026-09-07. That authorization does not activate production or approve legal policy content.
