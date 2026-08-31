# Platform foundation (F1)

## Runtime boundary

`backend/src/app.js` composes HTTP middleware and routes without opening a socket. `backend/src/index.js` loads local environment values, validates configuration and starts the server. Tests and future serverless adapters can import the app without creating a listener.

Routes remain compatible with the current mobile clients. Additive response fields are permitted; removing or renaming accepted request/response fields requires a versioned contract.

## Production configuration

Configuration is validated before the API is composed. Production startup fails when any of these controls is invalid:

- `DATABASE_URL` is not a PostgreSQL URL.
- `JWT_SECRET` is absent, a known placeholder or shorter than 32 characters.
- `CORS_ORIGINS` is empty, contains `*`/`null`, is malformed or contains a path.
- Stripe credentials are absent or are not live credentials.
- A boolean financial flag is not exactly `true` or `false`.
- `PORT` is outside 1–65535.

All financial mutation flags remain disabled by default. Secrets stay in environment configuration and must not be committed.

## HTTP and security contract

Every request receives request, correlation and trace identifiers before CORS, logging or route processing. The same identifiers are returned as headers. Every JSON error includes the existing `error` field plus a stable `code` and `correlationId`; this is additive for mobile compatibility. Production responses with status 5xx are reduced to `INTERNAL_ERROR` and never include details, messages or stacks.

The global boundary applies an explicit CORS allowlist, Helmet headers, 1 MiB JSON/form limits and a 300 requests/minute rate limit. Uploads retain their separate 5 MiB/type restrictions. Validation, payload-limit, CORS and rate-limit errors use the same error contract.

## RBAC and feature flags

Administrative routes declare permissions. Active `UserRoleAssignment` records resolve through persisted role permissions. The legacy `ADMIN` wildcard remains a documented compatibility bridge until F4 migrates every administrator to explicit assignments; other user roles never receive that bridge.

Feature flags default to disabled. Target rules are strict, bounded and fail closed when persisted JSON is malformed. Percentage rollout is deterministic per flag and subject.

## Events and transactional outbox

The public product-event endpoint accepts only the versioned taxonomy in `event-taxonomy.js`. Metadata is bounded and recursively removes credentials, payment data and direct personal identifiers; authenticated identity is derived from the request rather than trusted from the payload.

Domain mutations write `OutboxEvent` records inside their database transaction. The PostgreSQL claim service uses `FOR UPDATE SKIP LOCKED`, bounded batches, expiring leases and conditional acknowledgements. A stale worker cannot acknowledge a lease after another worker reclaims it. Failures use exponential backoff and become `DEAD_LETTER` after the configured attempt limit.

F1 provides the durable producer and worker lifecycle, but does not activate an external delivery adapter. A consumer must register the destination-specific handler and operational alerting before running continuously; unknown delivery semantics must never be marked processed.

## Migration and rollback

The reviewed baseline and additive migration workflow are defined in `docs/DATABASE_MIGRATIONS.md`. Existing databases are audited and baseline-resolved; they are never reset or initialized with the baseline SQL. Foundation rollback is application-first: disable new entry points, retain RBAC/audit/event history and use a forward corrective migration.

## Verification gates

- Unit and compatibility suite: production configuration, request context, stable errors, RBAC decisions, fail-closed flags, event taxonomy/redaction and outbox lease transitions.
- Supabase PostgreSQL gate: concurrent inbox/payment/refund invariants plus concurrent outbox claiming and conditional acknowledgement.
- Prisma format/validate/generate, JavaScript syntax checks, migration status/baseline audit and secret scan remain release gates.
