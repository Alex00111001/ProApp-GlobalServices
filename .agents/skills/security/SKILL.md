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

Do not rotate secrets, change live access, scan systems outside scope, or deploy fixes without explicit authorization. Produce evidence-backed findings with severity, exploit preconditions, affected assets, safe remediation, and regression tests.
