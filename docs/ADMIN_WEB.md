# Admin Web Control Center

`admin-web/` is an independent React/TypeScript application. PostgreSQL and Supabase are never accessed from the browser; all reads and mutations flow through `/api/v1/admin` and backend RBAC remains authoritative.

## Session boundary

- Login requires an active persisted administrative role assignment. The legacy `User.role=ADMIN` value grants no access by itself.
- Access JWTs are audience/issuer bound, expire after 15 minutes by default and remain only in JavaScript memory.
- The opaque refresh token is stored only as a hash in `AdminSession`; the browser receives it in a `HttpOnly`, `SameSite=Strict`, path-scoped cookie (`Secure` in production).
- A separate CSRF verifier is stored in `sessionStorage` and must accompany refresh requests. Refresh rotates both opaque values.
- Every authenticated request verifies that the server-side session is still active. Deactivation and role revocation revoke applicable sessions immediately.
- Login and refresh have a strict application limiter. Production ingress must also provide a shared/distributed rate limit; set `TRUST_PROXY_HOPS` to the exact trusted proxy count so IP controls and audit evidence remain correct.

`ADMIN_SESSION_PEPPER` is mandatory and independent from `JWT_SECRET` in production. `ADMIN_ROLE_CHANGES_ENABLED` remains `false` until the deployment migration, RBAC bootstrap and two-administrator rehearsal pass.

## Authorization and data handling

Navigation and route boundaries derive from the effective permission set returned by the backend. API routes independently enforce the same permission keys and return a stable 403 contract with `correlationId`.

- Lists are paginated and server-filtered. Contact data is masked.
- User detail requires `users.pii.read`.
- Professional and booking detail require both their domain read permission and `users.pii.read` because they contain contact data.
- Audit actors and role-change targets expose masked email only.
- Sensitive reads and all state mutations create protected audit evidence. Mutations record actor, reason, request/correlation/trace context and before/after state.
- Role changes are feature-gated, idempotent, row-locked and require a distinct requester and reviewer. Self-review and self-target review are rejected.

## Operational modules

- Dashboard: explicit metric definitions, requested period/timezone/currency, generation time and latest booking/payment freshness. Net platform revenue subtracts both refunded platform fees and the proportional professional-commission reversal.
- Users: masked searchable list, sensitive detail contract and audited activation/deactivation. Deactivation revokes active admin sessions.
- Professionals: searchable review queue and validated status state machine with audited reasons.
- Bookings: searchable operational list and permission-protected sensitive detail.
- Audit: server-side filters for action, actor, resource, outcome and correlation evidence.
- Access: current sessions, role catalog, searchable user target selection and four-eyes grant/revoke workflow.

F5 Operations and Support are real permission-derived surfaces backed by `/api/v1/admin/operations/*`. Operations presents Error Explorer, Incident Center, readiness/history, jobs, integrations, alerts and read-only financial monitoring. Support provides durable cases, assignment, strict lifecycle and internal comments.

F6 Growth is a real permission-derived surface backed by `/api/v1/admin/growth/*`. It presents first-party overview/funnel definitions, internal campaign create/edit/lifecycle, pseudonymous leads and conversion evidence without raw analytical identifiers or contact data. `MARKETING_ADMIN` receives `marketing.read` and `marketing.manage`; `ANALYST` intentionally receives neither. No advertising-provider action or causal attribution is available.

F7 Privacy and Attribution is a real permission-derived surface backed by `/api/v1/admin/privacy/*` and `/api/v1/admin/attribution/*`. It presents policy/review lifecycle, sensitive consent/withdrawal history, sanitized touchpoints, versioned models/windows and frozen attribution results. `COMPLIANCE_ADMIN` manages policies and reads decision evidence; `MARKETING_ADMIN` manages models but cannot read consent history; `ANALYST` receives no F7 access.

F8 Referrals & Automation is exposed at `/referrals-automation` and derives visibility from the dedicated referral/reward/automation permissions. It reads versioned `/api/v1/admin/referrals/*` and `/api/v1/admin/automation/*` contracts and provides server-paginated program, code, referral, conversion, reward, definition/version, execution and dead-letter views. It never displays referred-party identity, raw event payloads or unsafe errors, and explicitly shows that blind manual replay and reward fulfillment are disabled.

F8.5 Markets is exposed at `/markets`. It separates territorial Country from operating Market, shows lifecycle and current policy evidence, supports reasoned market transitions, and exposes the four-eyes identity-policy review/activation lifecycle. Geography is read as versioned import evidence; official codes cannot be edited in the browser. Masked identity-document reads use a separate permission and are not displayed on the general Markets page.

## Deployment configuration

For local development, copy `admin-web/.env.example` to `.env.local` and run `npm run dev`. `VITE_API_URL` may point to the backend `/api` base. Production defaults to same-origin `/api`; an explicit production URL must use HTTPS and cannot contain credentials.

Backend production requirements:

- explicit `CORS_ORIGINS` containing the admin origin;
- HTTPS termination and exact `TRUST_PROXY_HOPS`;
- separate 32+ character `JWT_SECRET` and `ADMIN_SESSION_PEPPER`;
- all reviewed migrations, including `202609090001_markets_identity_geography`, applied and the RBAC catalog synchronized;
- `GROWTH_DATA_ENABLED` remains false until the intended environment passes F6 gates, and production has a dedicated `GROWTH_PSEUDONYM_SECRET`;
- `CONSENT_ATTRIBUTION_ENABLED=false` until F7 activation approval, with an independent `GROWTH_IDENTITY_PROOF_SECRET` when enabled;
- `REFERRALS_ENABLED=false`, `AUTOMATION_ENGINE_ENABLED=false`, `AUTOMATION_WORKER_ENABLED=false`, reward fulfillment false and manual replay false until a separately approved F8 rollout;
- `MARKETS_IDENTITY_GEOGRAPHY_ENABLED=false` until the F8.5 geography import, legal four-eyes review, identity-key provisioning and isolated activation rehearsal are complete; ES, BR and CL remain `DISABLED` after migration;
- shared ingress/WAF authentication rate limits in addition to the in-process limiter;
- observability exporters and alert routes configured as required by F2.

## Verification and rollback

Run `npm run verify` at repository root and `RUN_DATABASE_INTEGRATION_TESTS=true npm run test:integration` in `backend`. The database suite covers refresh rotation/revocation, two-reviewer concurrency, dashboard definitions, default-deny RLS and the F1/F2 regressions.

Rollback is application-first: disable `ADMIN_ROLE_CHANGES_ENABLED`, revoke active administrative sessions, restore the previous admin-web/backend build and retain additive session/change/audit tables. Do not reset the database or drop audit evidence. Forward-fix migrations are required for schema changes.
