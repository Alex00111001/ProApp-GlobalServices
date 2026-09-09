# F8.5 Markets, Identity and Geography runbook

## Safety boundary

This runbook is for isolated PostgreSQL/Supabase-compatible test or explicitly approved staging only. It does not authorize production, a live geography import, market activation, identity-key rotation or destructive cleanup. Keep `MARKETS_IDENTITY_GEOGRAPHY_ENABLED=false` and every Market `DISABLED` until the named reviewers approve activation.

## Official dataset refresh

1. Retrieve the allowlisted source artifacts into a new immutable operator directory. Do not make an external website a runtime dependency.
2. Record retrieval time and calculate raw SHA-256 before parsing.
3. Install exactly the parser dependencies from `backend/scripts/requirements-geography.txt` in an isolated environment.
4. Run `normalize-official-geography.py --source-dir <immutable-input> --output-dir <candidate-output> --retrieved-at <UTC timestamp>`.
5. Compare the candidate manifest to the committed snapshot. Review additions, renames, parent changes, code changes and deprecations; unexplained count loss blocks the import.
6. Run `npm --prefix backend run geography:validate`. This verifies allowlisted HTTPS hosts, primary artifact evidence, checksums, uniqueness and parent ordering without a database connection.
7. In an isolated database, submit the candidate through `POST /api/v1/admin/geography/imports` with `geography.manage`. Preserve request/correlation/trace IDs and import evidence.
8. Re-submit the identical manifest to prove idempotency. Inspect `AdministrativeDivisionChange`; no referenced division may be deleted.

Expected committed snapshots retrieved 2026-09-09:

| Country | Source version/reference | Rows | Normalized SHA-256 |
| --- | --- | ---: | --- |
| ES | INE relation 2026-01-01 | 8,203 | `d96b1280f8783de15ec30fcccf8a6cde75d55dd4ac4db046f5d4979b329953bb` |
| BR | IBGE Localidades retrieved 2026-09-09 | 5,598 | `6fe816d78db0e3f0899ad8afc0817b05057bdc258cfe9e94cfda04af47fe7d57` |
| CL | SUBDERE CUT 2018 v04 | 418 | `0cfb59bb34114c83170d6dd7c2f96b0f3da15e6ff0b4435d78dd9f590f9ba4c4` |

The CL code catalog is the latest official CUT spreadsheet found in the current SUBDERE catalog; SUBDERE also publishes newer boundary cartography. Before any CL activation, re-check both sources and obtain qualified territorial/legal confirmation that no newer code relation supersedes CUT 2018 v04.

## Policy and market lifecycle

1. Create or migrate a draft policy with a canonical digest and immutable version. Its creator cannot review it.
2. A separate compliance operator validates official identity/legal sources, F7 references, hierarchy, address minimization, locales and F3 currency declaration, then approves or rejects with an evidence reference and reason.
3. Policy activation requires approved review, matching digest and a completed geography import for the declared source.
4. Market moves `DISABLED -> READY -> ACTIVE` only after policy and geography gates. Activation is a distinct human-authorized action; migration never performs it.
5. Retire a policy only while its market is neither READY nor ACTIVE. Suspend the market before emergency rollback.

## Identity-key handling

- Provision independent 32-byte base64 AES key and 32+ character HMAC lookup secret through the environment secret manager.
- Keep `IDENTITY_DOCUMENT_ENCRYPTION_KEY_VERSION` stable until a reviewed rotation/re-encryption plan exists.
- Never paste identity values, ciphertext, digests or keys into tickets, Notion, logs or test fixtures.
- Format/checksum valid means only `VALID`; use `VERIFIED` only with an approved verification method/source and timestamp.
- Duplicate responses remain generic. Administrative reads are masked-only, require `identity.documents.read.masked` and emit audit evidence.

## Verification and diagnosis

- Run root `npm run verify`, Prisma format/validate/generate and the isolated PostgreSQL integration suite.
- Confirm migration status, baseline compatibility, forced RLS and zero grants/policies for `anon` and `authenticated` on all F8.5 tables.
- Filter safe metrics by bounded operation/outcome/reason. Use correlation/request/trace IDs to locate import, policy, registration or service-area audit rows.
- Never diagnose with raw request bodies. A document or address appearing in logs is a security incident: disable the capability, restrict logs, preserve evidence and follow the incident/privacy process.

## Non-destructive rollback

1. Set `MARKETS_IDENTITY_GEOGRAPHY_ENABLED=false` and suspend the affected Market if already active.
2. Restore the previous compatible application builds; stop new registration/address/service-area writes.
3. Retain Country, Market, policies, imports, divisions, identities, addresses, service areas, audit and change evidence.
4. Do not drop tables, delete referenced divisions, reset databases, use `db push`, reuse identity keys or rewrite policy/import history.
5. Reconcile with a reviewed forward-fix migration and repeat the complete gate before reactivation.

F9 remains paused throughout rollback and does not resume automatically after recovery.
