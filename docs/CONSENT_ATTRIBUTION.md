# Consent and attribution architecture

F7 adds purpose-specific privacy evidence and reproducible first-party attribution to F6. PostgreSQL is the system of record. `Conversion` remains the F6 conversion fact, and F3 remains the only financial source of truth. F7 never creates revenue or edits a payment, booking, ledger transaction or conversion value.

Production is not activated. `CONSENT_ATTRIBUTION_ENABLED=false` is the default in every environment and remains the required production value until the release owner and qualified privacy reviewer approve the policies, documents, country/locale scope, legal bases and evidence-retention settings.

The durable decisions and threat model are recorded in [ADR 0002](adr/0002-consent-attribution-evidence.md).

## Data contract

| Record | Purpose | Mutability |
|---|---|---|
| `ConsentPolicy` | Versioned purpose, country/locale, legal basis label, document reference/digest, effective interval, enforcement and review evidence | Draft editable; active/retired definition immutable; retire then create next version |
| `ConsentDecision` | Exact `GRANTED`, `DENIED` or `WITHDRAWN` fact for a trusted pseudonymous subject and policy version | Append-only; update/delete blocked by PostgreSQL trigger |
| `SubjectIdentityLink` | Proof-bound anonymous → authenticated subject link | Append-only; one anonymous subject and proof digest cannot link twice |
| `Touchpoint` | Consent-bound first-party acquisition observation | Append-only and idempotent |
| `AttributionModel` | Versioned first/last-touch definition and lookback window | Draft editable; active/retired definition immutable |
| `Attribution` | Frozen result for one F6 conversion and model version | Append-only; one result per conversion/model |

Two partial unique indexes prevent concurrent activation of more than one policy for a purpose/country/locale or more than one version of the same model key. All six tables have forced RLS and grant no access to `PUBLIC`, `anon` or `authenticated`. Only the protected backend database role accesses them.

Existing registration fields (`termsAcceptedAt`, `termsVersion`, `privacyAcceptedAt`, `privacyVersion`, `marketingConsentAt`) remain compatibility projections. They are not backfilled into F7 because that would invent policy and collection evidence.

## Policy and decision lifecycle

Policy flow is `DRAFT → ACTIVE → RETIRED`. A draft must carry independent `APPROVED` review evidence before activation. Creator and reviewer must be different administrators. An active scope must be retired before the next version becomes active.

Decisions never transition in place:

```text
GRANTED row ──later──> WITHDRAWN row
DENIED row  ──later──> GRANTED row under the then-effective reviewed policy
```

Enforcement runs on the server at processing time. It resolves the active policy by purpose/country/locale, validates an optional exact policy ID/version, reads the latest decision across trusted reconciled subject keys and fails closed for missing/stale grant, denial, withdrawal or `PROHIBITED` policy. A `POLICY_ONLY` mode can be configured only through a reviewed policy and still respects a later denial/withdrawal.

Withdrawal works even when the originally granted policy has since retired: the new row references the original grant version, preserves all prior evidence and immediately blocks dependent new processing. It does not delete financial, contractual, security, audit or legal evidence.

## Identity reconciliation

`POST /api/v1/privacy/identity-proofs` accepts a bounded client-generated anonymous identifier and returns a short-lived opaque proof. The proof contains only its HMAC-derived pseudonymous subject, nonce and lifetime and is authenticated with `GROWTH_IDENTITY_PROOF_SECRET`. The raw identifier is not persisted.

An anonymous consent or touchpoint request must present the proof. `POST /api/v1/privacy/identity/reconcile` additionally requires an authenticated user. It links the verified anonymous subject to the subject derived from that access token. Submitted account IDs are not accepted. Reusing the proof for another account returns `IDENTITY_LINK_CONFLICT`; a safe replay for the same account is idempotent.

`GROWTH_PSEUDONYM_SECRET` and `GROWTH_IDENTITY_PROOF_SECRET` are independent 32+ character production secrets. Rotating the pseudonym secret changes subject keys and requires a reviewed identity migration; do not rotate it as a routine credential operation.

## Touchpoint privacy boundary

A touchpoint requires a current server-side consent decision and stores:

- normalized `source`, optional `medium` and `channel` identifiers;
- optional linked internal campaign, lead and F6 marketing event;
- HTTPS referrer origin and path only;
- landing pathname only;
- bounded allowlisted context;
- exact policy/decision context and request/correlation/trace IDs.

Query strings, fragments and URL credentials are never stored. Non-HTTPS or credential-bearing referrers are rejected. Context keys and values that contain email, phone, address, location, raw anonymous/session IDs, credentials, tokens, payment/card/bank data or similar protected content are rejected. Subject keys are never returned by public/admin read APIs or placed in logs/metric labels.

## Attribution contract

Supported versioned models are `FIRST_TOUCH` and `LAST_TOUCH`, with 1–366 day windows. Candidates must share the conversion's trusted subject set, occur no later than the conversion, fall within the frozen window, reference the model purpose and use a policy still effective when calculation occurs. A latest denial/withdrawal produces `BLOCKED_CONSENT`; no eligible candidate produces `UNATTRIBUTED`.

Selection order is stable: `occurredAt,id` ascending for first-touch and descending for last-touch. The result stores the model ID/version, selected touchpoint or reason, window and SHA-256 digest of canonical model/conversion/candidate inputs. Retrying returns the existing row. Changing a model creates a new version and never silently changes historical results.

## HTTP APIs

Self-service contracts under `/api/v1/privacy`:

- `GET /policies?countryCode=ES&locale=es&purposes=marketing_attribution`
- `POST /identity-proofs`
- `POST /identity/reconcile` (authenticated)
- `POST /consents` (`GRANTED` or `DENIED`)
- `GET /consents/history` (authenticated, server-paginated)
- `POST /consents/withdrawals`
- `POST /touchpoints`
- `GET /attributions` (authenticated, server-paginated)

Administrative contracts under `/api/v1/admin`:

- `/privacy/policies` create/list/update-draft/review/activate/retire;
- `/privacy/consents`, `/privacy/withdrawals`, `/privacy/touchpoints` paginated reads;
- `/attribution/models` create/list/update-draft/activate/retire;
- `/attribution/results` paginated reads;
- `/attribution/conversions/:id/calculate` idempotent manual calculation.

Every mutation uses strict schemas and a bounded reason where administrative. Sensitive administrative reads create audit evidence.

## RBAC

| Permission | Scope |
|---|---|
| `privacy.policy.read` | Policy definitions and review state |
| `privacy.policy.manage` | Draft/review/lifecycle mutations |
| `privacy.consent.read` | Sensitive consent and withdrawal history |
| `touchpoints.read` | Sanitized first-party touchpoints |
| `attribution.read` | Models and frozen results |
| `attribution.manage` | Model lifecycle and calculation request |

`COMPLIANCE_ADMIN` manages policies and reads decision history, touchpoints and attribution. `MARKETING_ADMIN` reads policies/touchpoints and manages attribution but cannot read consent evidence. `ANALYST` receives none of the F7 permissions. `SUPER_ADMIN` continues to receive the synchronized catalog. Authorization denials and sensitive reads are audited.

## Observability

Prometheus counters `homeservices_privacy_operations_total` and `homeservices_attribution_operations_total` use only bounded operation/outcome/reason labels. Durable outbox signals cover policy lifecycle, decisions, withdrawals, identity reconciliation, accepted/rejected/sanitized touchpoints and attribution status. Database rows and outbox metadata carry request/correlation/trace context; asynchronous outbox metadata additionally carries a valid W3C trace carrier when available.

Use a `correlationId` to join the HTTP response, structured request log, audit row, domain evidence and outbox event. No evidence bodies, subject keys, proof values, URLs, user IDs, PII or payment identifiers are metric labels.

## Legal-review and retention boundary

The engineering model implements configurable controls; it does not decide applicable law. Source material and qualification limits are recorded in ADR 0002. `retentionDays=null` means no automated deletion schedule is approved. No F7 evidence deletion worker is enabled in this phase. Before production, qualified review must approve each policy and a retention/anonymization procedure for every supported jurisdiction and evidence category.

## Verification

Run from the repository root:

```powershell
npm run verify
```

Run the deliberate database suite from `backend/` against the isolated test database:

```powershell
$env:RUN_DATABASE_INTEGRATION_TESTS='true'
npm run test:integration
```

See [the F7 runbook](runbooks/CONSENT_ATTRIBUTION.md) for rollout, diagnosis and rollback.
