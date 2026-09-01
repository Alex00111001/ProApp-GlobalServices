# F2 observability release record

- Phase: F2
- Domain: Observability and Incidents
- Risk: HIGH
- Capability tier / model: DEEP / Sol
- Environment validated: Supabase test and local application processes
- Production activation: not authorized; production exporters, alert destinations and secrets must be configured and exercised during release rehearsal

## Delivered capability

- Structured Pino logging with normalized fields, bounded metadata and centralized recursive redaction of secrets, credentials, tokens, payment data and sensitive PII.
- W3C trace context plus request and correlation identifiers propagated through HTTP, Stripe webhooks, billing transactions, outbox events and the observability worker.
- OpenTelemetry traces and metrics through vendor-neutral OTLP HTTP exporters, with Prometheus RED/USE metrics for HTTP, runtime, database, outbox and external operations.
- Atomic PostgreSQL error grouping with deterministic fingerprints, immutable occurrences, first/last seen timestamps and bounded cardinality.
- Deduplicated incident creation, strict and audited lifecycle transitions, reopening, comments and a unique incident window key.
- Configurable severity/routing, suppression through incident-window deduplication and signed webhook alert adapters with bounded retries and dead-letter handling.
- Separate liveness and readiness endpoints. Readiness checks the database and outbox without exposing infrastructure details.
- Permission-protected operations APIs for error groups, incidents, audit history, health snapshots and metrics.
- Retention worker and documented limits for events, health snapshots, audit evidence, logs, traces and metrics.

## Platform compatibility closure

The global critical/high dependency gate discovered during F2 verification was resolved rather than deferred:

- Customer mobile migrated from Expo 52 / React Native 0.76 / React 18 to Expo 57.0.18 / React Native 0.86.3 / React 19.2.3 / TypeScript 6.
- Customer code migrated to the current `expo-file-system` and `react-native-view-shot` APIs; deprecated React 18 testing packages and the unused direct vector-icons package were removed.
- Customer Android switched to Continuous Native Generation: `app.config.js` is the source of truth and native directories are generated during prebuild/EAS build instead of committed.
- Professional mobile was normalized and verified on the same Expo/React Native/React baseline.
- Backend moved to Prisma 7.10, Stripe 22.6, TypeScript 7, Zod 4.5, Cloudinary 2.11 and Multer 2.3; the unused `ts-node` dependency was removed.
- Admin uses TypeScript 7. Root scripts now provide one deterministic cross-workspace verification entry point and every package declares Node >=22.13.

## Database changes

- `202608310004_observability_hardening`: creates canonical `ErrorGroup`, transforms existing `ErrorEvent` rows into immutable occurrences, links incidents and enables RLS for the operational observability tables.
- `202609010001_observability_rollback_compatibility`: restores the legacy aggregate columns and indexes as an intentional expand/contract compatibility layer for application rollback.

The first test deployment exposed two migration defects: an index was implicitly removed with its column, and the failed non-transactional attempt left partial DDL. Both failed attempts were marked rolled back, the exact pre-migration schema was reconstructed without deleting data, the SQL was corrected, and both final migrations were deployed successfully. Prisma reports all 11 migrations applied. RLS is enabled on `AuditLog`, `ErrorGroup`, `ErrorEvent`, `Incident`, `IncidentEvent`, `IncidentComment` and `ServiceHealthSnapshot`; no public policies are present, so access remains through the privileged backend and RBAC-protected APIs.

## Verification evidence

- `npm ci` in `backend`: passed; 488 packages installed and audit clean.
- `npm run build` in `backend`: passed with Prisma 7.10; Prisma client generated and JavaScript syntax validated for 90 files.
- `npm test` in `backend`: 72/72 passed.
- `RUN_DATABASE_INTEGRATION_TESTS=true npm run test:integration` in `backend`: 4/4 passed, including F1 billing/outbox regression, concurrent error grouping, incident deduplication, lifecycle and live readiness against Supabase test.
- `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npm run db:audit-baseline` and `npx prisma migrate status`: passed.
- `npx --yes @secretlint/quick-start "**/*"`: passed with no findings.
- Runtime source scan found no remaining `console.*` logging of errors, bodies or headers.
- `npm audit --json`: root, backend and admin web report 0 vulnerabilities; both mobile graphs report 0 critical and 0 high findings.
- Admin web `npm ci`, lint and TypeScript 7/Vite 8 production build: passed.
- Both mobile apps: `npm ci`, TypeScript check, Expo Doctor 21/21 and Android production export passed.
- Root `npm run verify`: passed across backend, admin and both mobile applications.
- `git diff --check`: passed; only repository line-ending conversion notices were emitted.

Tests cover redaction, W3C propagation, structured safe errors, deterministic grouping, concurrent deduplication, lifecycle and reopening, signed alert delivery/failure, liveness/readiness, dependency failure and protected operations routes.

## Operation and rollback

Use [the observability architecture and contract](../OBSERVABILITY.md), [incident response runbook](../runbooks/OBSERVABILITY_INCIDENT_RESPONSE.md) and [rollback runbook](../runbooks/OBSERVABILITY_ROLLBACK.md). Rollback is application-first: stop the worker or disable destinations, retain database history and compatibility columns, and use a forward corrective migration. Never reset or `db push` the database.

## Residual product release risk

The critical/high mobile dependency blocker is resolved. The Expo 57 dependency graphs still report 15 moderate findings for the customer app and 13 for the professional app, primarily through Expo CLI/config and Router transitive dependencies. The audit tool's forced remediation proposes incompatible Expo downgrades, so these are accepted upstream risks pending compatible Expo releases. They are build-tool/dependency-path findings, not known application-code vulnerabilities, and no critical or high advisory remains.

Native bundles were generated successfully, but store-signed EAS builds and physical-device payment/notification regression still belong to the later production release rehearsal because this phase has no production activation authorization.

No F3 work was started as part of this closure.
