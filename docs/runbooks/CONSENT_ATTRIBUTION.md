# Consent and attribution runbook

This runbook operates F7 only. It does not authorize production activation, legal-policy approval, ad-provider integration, F8 automation or deletion of immutable privacy evidence.

## Owners and prerequisites

- Platform on-call owns API/database availability and correlation-based diagnosis.
- Privacy Operations owns policy lifecycle and withdrawal investigation.
- Growth Operations owns attribution-model versions and sanitized touchpoint quality.
- A qualified privacy reviewer owns legal basis, document wording, country/locale applicability and retention approval.

Required configuration:

- stable environment-specific `GROWTH_PSEUDONYM_SECRET`;
- independent `GROWTH_IDENTITY_PROOF_SECRET` of at least 32 characters;
- `IDENTITY_PROOF_TTL_HOURS` between 1 and 168 (default 24);
- `CONSENT_ATTRIBUTION_ENABLED=false` until all test/staging gates pass;
- F6 `GROWTH_DATA_ENABLED` deliberately configured;
- migrations `202609070001_consent_attribution`, `202609070002_consent_attribution_active_uniqueness` and `202609070003_consent_attribution_evidence_integrity` applied;
- RBAC catalog synchronized with `npm run seed:rbac`.

Never paste database URLs, proofs, subject keys, consent evidence, user IDs or referrer query strings into tickets, chat or dashboards.

## Test/staging activation

1. Confirm `npx prisma migrate status` is current and RLS/default-deny checks pass.
2. Confirm the previous application build is available for application rollback.
3. Set independent environment secrets and keep `CONSENT_ATTRIBUTION_ENABLED=false`.
4. Have Privacy Operations create a draft policy with document SHA-256, reference, country, locale, purpose, enforcement and retention setting.
5. Have a different qualified administrator approve the draft with a review reference.
6. Activate exactly one policy per purpose/country/locale.
7. Create and activate the intended first/last-touch model versions and windows.
8. Run self-service grant, denied and withdrawal journeys. Confirm marketing denial does not affect registration, booking, payment or support.
9. Run a signed anonymous proof/reconciliation journey and verify cross-account replay returns 409.
10. Set `CONSENT_ATTRIBUTION_ENABLED=true` only in the approved test/staging deployment.
11. Verify accepted/sanitized/rejected touchpoints, both attribution results, metrics, outbox, audit and correlation/trace evidence.
12. Observe error/denial/unattributed rates for at least one agreed release window before further rollout.

Production remains blocked until a separate release decision records all qualified legal and operational approvals.

## Diagnose with correlation ID

1. Obtain the response `correlationId`; never request a proof, token, raw anonymous ID or full URL.
2. Search structured logs by the exact bounded correlation ID.
3. With the proper permission, filter Admin Web Consent History, Touchpoints or Attribution by operational context and inspect its correlation/trace IDs.
4. Inspect `AuditLog` for policy/model lifecycle, sensitive reads or `AUTHORIZATION_DENIED`.
5. Inspect the matching outbox aggregate and event type; payloads contain only internal row IDs and bounded classifications.
6. Use the trace ID in the configured observability backend for HTTP/Prisma latency. Do not add subject IDs or URLs as span attributes.

## Common failures

| Code/symptom | Meaning | Action |
|---|---|---|
| `CONSENT_ATTRIBUTION_DISABLED` | Feature flag is off | Expected during rollback/unactivated environments; do not enable without prerequisites |
| `CONSENT_POLICY_UNAVAILABLE` | No active reviewed policy matches purpose/country/locale/time | Check policy scope, review and effective interval; never bypass enforcement |
| `CONSENT_GRANT_REQUIRED` | No grant for the exact current policy version | Present the current policy and collect a new explicit decision |
| `CONSENT_ENFORCEMENT_DENIED` | Latest fact is denied/withdrawn | Stop processing; do not retry until the person makes a later valid decision |
| `IDENTITY_LINK_CONFLICT` | Anonymous proof is already bound elsewhere | Treat as possible spoofing/account-sharing; do not relink manually |
| `PRIVACY_BOUNDARY_VIOLATION` | Context contains prohibited private/payment/credential data | Fix the client payload; do not log the rejected value |
| high sanitized touchpoint rate | Clients send query/fragment-bearing URLs | Fix client capture to send pathname/origin only |
| `UNATTRIBUTED` | No eligible touchpoint in the frozen window | Confirm policy, subject reconciliation, timestamps and model window |
| `BLOCKED_CONSENT` | Calculation was disallowed by decision state | Expected privacy outcome; never override manually |

## Withdrawal verification

After a reported withdrawal problem:

1. Confirm a new immutable `WITHDRAWN` row exists after the prior `GRANTED` row.
2. Confirm the row references the original policy version and carries correlation evidence.
3. Submit a new isolated touchpoint and confirm a 403 enforcement denial.
4. Confirm contractual endpoints remain healthy.
5. Confirm historical touchpoints/attributions remain unchanged and access-controlled.
6. Open an F5 incident if new processing continued after the withdrawal timestamp.

## Rollback

Application rollback is the only routine rollback:

1. Set `CONSENT_ATTRIBUTION_ENABLED=false`.
2. Restore the prior backend and client/Admin Web artifacts if required.
3. Leave policy/history/link/touchpoint/attribution, audit and outbox records intact.
4. Confirm new F7 writes stop while contractual services remain ready.
5. Reconcile any in-flight request by correlation ID and retain its evidence.
6. Forward-fix code or schema; do not edit applied migrations.

Do not drop F7 tables, disable immutable triggers, rewrite decisions, relink subjects or recalculate historical attribution. The transaction-local `homeservices.allow_immutable_cleanup` database setting exists only for isolated automated test teardown and is not an operational recovery tool.

## Secret rotation

The proof-signing secret can rotate only with a defined overlap or forced proof renewal plan; existing short-lived proofs will otherwise fail. Rotating the pseudonym secret changes identity keys and requires a reviewed migration and privacy impact assessment. Immediately rotate either secret if exposure is confirmed, disable F7 first, and open an incident without copying secret material into evidence.
