---
name: security
description: Threat-model, implement, or review HomeServices authentication, authorization, RBAC, ownership, secrets, uploads, APIs, dependencies, privacy boundaries, and security-sensitive changes.
---

# Security

Use the deep/critical model tier for security design and final review. Work defensively within the authorized repository.

## Review model

1. Identify assets, actors, trust boundaries, entry points, data classifications, providers, and abuse cases.
2. Trace authentication, authorization, ownership, validation, persistence, output, logging, and audit end to end.
3. Prefer deny-by-default, least privilege, explicit allowlists, short-lived credentials, and server-side enforcement.
4. Verify safe failure, rate/size limits, replay/idempotency, concurrency, and recovery.

## Repository invariants

- Production startup fails closed on missing/placeholder secrets.
- JWT/session checks do not substitute for resource ownership or RBAC permission checks.
- Privileged mutations use narrow permissions and auditable approval controls.
- Errors expose stable codes/correlation IDs, not stacks, SQL, tokens, or provider secrets.
- Logs/events use allowlisted metadata and redact credentials, personal data, card data, and documents.
- Uploads validate authentication, authorization, size, content/type, storage path, and deletion scope.
- CORS, headers, body limits, and rate limits are environment-aware and fail safely.
- Identity documents are sensitive: store only purpose-necessary protected representations, never log or label document values, restrict reads beyond ordinary profile access, and validate market/country/geography relationships server-side.

Do not rotate secrets, change live access, scan systems outside scope, or deploy fixes without explicit authorization. Produce evidence-backed findings with severity, exploit preconditions, affected assets, safe remediation, and regression tests.

## API abuse review and retained gates

For a security-analysis dry run, read only: trace untrusted input to query/command/template/file
sinks, object merges and deserialization; inspect field allowlists against mass assignment,
RBAC plus per-object ownership against IDOR, resource/rate limits against abuse, output and logs
against sensitive-data exposure, and environment-specific startup defaults against fail-open
configuration. Include cross-user/cross-market and unauthorized/overprivileged caller cases.
Cite paths and reachable flows; distinguish confirmed findings, hypotheses and untested boundaries.
Never print secret values, enumerate credential stores, run live probes or fix code in dry-run mode.

This review is additional to all existing gates: dependency audits, tracked-tree secret scan,
full-history secret scan, secret-shaped fixture guard and repository artifact hygiene. None may
be skipped, replaced or relaxed. Codex Security/plugin availability alone is not evidence that
a scan ran. Findings flow into the existing PRR process; no parallel backlog or automatic fixes.
