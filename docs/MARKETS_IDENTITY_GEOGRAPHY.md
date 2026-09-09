# F8.5 Markets, Identity and Geography

- Status: authoritative architecture; implementation in progress
- Date: 2026-09-09
- Production: inactive
- Governing ADR: [ADR 0004](adr/0004-market-identity-geography.md)

## Canonical principle

Every structural, legal, identity, geography, address, locale, currency, tax, payment, or policy difference derived from a country or operating market is resolved by an explicit, versioned, server-authoritative Market Policy, adapter, or closed registry. Client, Professional, Admin Web, and Public Web consume contracts; they are never authoritative sources of national rules.

## COUNTRY/MARKET VARIATION GATE

Before introducing country-specific behavior, answer and evidence all ten questions:

1. Is the concept territorial geography or HomeServices commercial/operational policy?
2. Does it belong to `Country` or `Market`?
3. Does an appropriate policy, adapter, or closed registry already exist?
4. Is the authoritative rule server-side?
5. Is it versioned when legal or operational change is possible?
6. Do all product surfaces consume the contract without duplicating the rule?
7. Does unknown, disabled, stale, or unreviewed configuration fail closed?
8. Are all affected markets covered by tests?
9. Does the change preserve existing markets and accepted public contracts?
10. Does activation require qualified legal, tax, financial, security, or operational review?

No country-specific change passes architecture review while any answer is unknown.

## Task classification

```text
Phase: F8.5 (between F8 and F9)
Domain: Markets / Identity / Geography / Address / Professional Service Areas
Risk: HIGH
Capability tier: DEEP
Provider/model: operator-selected DEEP-capable Codex model
Skills: architecture-guardian, repo-auditor, database-prisma, security,
        legal-compliance, backend-fastapi, frontend, professional-system,
        admin-operations, observability, testing, release, payments (boundary audit)
Escalation triggers: identity protection design; legal/document interpretation;
        RLS/RBAC; official dataset drift; financial-currency coupling;
        destructive migration; production or market activation
Required verification: schema/migration review; Prisma format/validate/generate;
        unit/contract/frontend/security tests; clean isolated PostgreSQL replay;
        Supabase-compatible RLS tests; dependency/secret/history scans; remote CI
```

The external Supabase/Prisma skills remain `PENDING_REVIEW` in the external-skill register and are not applied.

## Architecture

```text
Country (territorial fact)
  -> AdministrativeDivision hierarchy

Country
  -> Market (HomeServices operating configuration and lifecycle)
       -> immutable MarketPolicyVersion
            |- IdentityPolicy (closed document-type adapter registry)
            |- GeographyPolicy (allowed hierarchy/types/source)
            |- AddressPolicy (required/optional fields and precision)
            |- LocalePolicy (default and supported BCP 47 tags)
            |- CurrencyPolicy (ISO 4217 declaration; Billing remains authority)
            |- LegalPolicy references (F7 authority; reviewed versions only)
            |- TaxPolicy reference (future; no tax engine in F8.5)
            `- PaymentPolicy reference (future; no money movement in F8.5)

User/Professional -> Address[] (domicile/contact/delivery purpose)
Professional      -> ProfessionalServiceArea[] (coverage, independently)
IdentitySubject   -> IdentityDocument[] (protected value + lifecycle)
```

`Country` existing does not imply `Market` enabled. `Market.status != ACTIVE` is unavailable for registration and service operations. Policy resolution requires an active market, an effective current policy version, recognized registries, and reviewed references where required; otherwise it fails closed.

## Pre-implementation audit (2026-09-09)

Baseline: branch `feature/experiments-content-seo-phase-9`, SHA `dc17780b0d026b422a9917c0bfbc20c0edddcbda`. Paused F9 working changes are preserved in named Git stash `paused F9 work before F8.5 markets foundation`; F8.5 starts from the same SHA.

| Area | Evidence | Classification | F8.5 action |
|---|---|---|---|
| User market | `User.countryCode` defaults to `ES` | migrate; ambiguous country/market | add nullable `marketId`; retain projection during expand phase |
| Client address | `ClientProfile.address/city/state/country/postalCode/latitude/longitude`; country defaults to `MX` | incompatible/debt | add normalized `Address`; preserve legacy fields until contract phase |
| Booking address | required free-text address/city/state/postalCode and optional coordinates | migrate | add immutable address snapshot references; do not destructively rewrite F1-F8 |
| Professional coverage | radius and coordinates on `ProfessionalProfile` | incompatible/debt | add independent `ProfessionalServiceArea`; keep compatibility fields |
| Professional documents | generic `Document.type/documentUrl/status` | reusable for uploaded professional evidence, not identity | introduce separate protected `IdentityDocument`; never repurpose URLs as identity numbers |
| Financial | Booking defaults EUR, Payment defaults MXN, country strings on pricing/refund policies | high-severity drift | Market declares currency; F3 validates amounts/currency and remains authority; no rewrite in F8.5 |
| Growth F6 | `countryCode` strings on events/campaigns/leads | reusable projection | resolve/validate market server-side; add market relation compatibly where needed |
| Consent F7 | country+locale on `ConsentPolicy` | reusable F7 authority | MarketPolicy references reviewed F7 policy versions; no duplication |
| Referrals F8 | `enabledMarkets String[]` and `Referral.market String` | migrate | resolve against active Market and store relation while preserving strings |
| Admin/RBAC | central permission catalog and versioned admin API | reusable | add narrow market/geography/identity-policy permissions; identity-value access separate |
| RLS | additive forced-RLS migrations/default deny pattern | reusable | apply to every F8.5 table with no public policies/grants |
| Feature flags | server-side persisted flag service | reusable | market lifecycle and feature capabilities remain independently fail-closed |
| Events/telemetry | structured context, audit, outbox, safe-log modules | reusable | add bounded market/policy/import/validation signals; prohibit document/address values |
| APIs | Express routes/controllers plus service modules | reusable with debt in legacy controllers | thin F8.5 routes with Zod boundary validation and services owning policy/transactions |
| Client onboarding | hardcoded registration fields, no registration schema | incompatible | fetch and render versioned schema; authoritative submit validation server-side |
| Professional onboarding | login-only app; profile reads generic documents | missing | add schema-driven onboarding and independent service-area UI |
| Admin Web | API-only React/Vite with permission-aware navigation | reusable | add Markets surface and typed contracts; backend remains authoritative |
| F9 scaffold | uncommitted ADR/config/schema on F9 branch | paused; partly incompatible | retain in stash; future location SEO must consume canonical divisions and Market |

### Dependency map

```text
F1-F2 identity/context/audit/telemetry
F3 financial currency authority ----\
F6 growth market projections --------+--> F8.5 Country/Market/Policy
F7 consent/legal evidence -----------+       |- Identity
F8 referrals/automation -------------/       |- Geography/Address
                                                `- Service Areas
                                                        |
                                                        +--> F9 canonical location/locale/slug inputs (paused)
                                                        `--> F10 supply-demand/matching inputs (not started)
```

## Initial registries and semantics

Persistent keys use stable codes, never translated names.

| Market | Country | Currency declaration | Default locale | Supported locales | Identity registry |
|---|---|---|---|---|---|
| `ES` | ISO 3166-1 `ES` | ISO 4217 `EUR` | `es-ES` | `es-ES`, `en` | `DNI`, `NIE`, `PASSPORT` |
| `BR` | ISO 3166-1 `BR` | ISO 4217 `BRL` | `pt-BR` | `pt-BR`, `en` | `CPF` |
| `CL` | ISO 3166-1 `CL` | ISO 4217 `CLP` | `es-CL` | `es-CL`, `en` | `RUN` (natural-person `RUT` alias/context), `PASSPORT` only after reviewed need |

All markets are seeded `DISABLED`. Their configuration is architecture/data readiness, not activation authority.

Identity adapters normalize Unicode/spacing/punctuation, validate bounded syntax and checksum where defined, and return a category—not the supplied value—to telemetry. Syntax-valid means only `FORMAT_VALID`; it never means `VERIFIED`. A verification state requires an explicit method/source and timestamp.

For Chilean natural persons, the SII states their RUT corresponds to the RUN administered by Civil Registry. F8.5 therefore stores one natural-person `RUN` identity and accepts `RUT` only as an input alias for that policy context; it does not create duplicate independent RUN/RUT identities. Legal review is required before enabling other Chilean taxpayer/entity document flows.

## Geography

`AdministrativeDivision` has an internal UUID, country, optional parent, level, closed type key, canonical official code/name, display names, lifecycle, dataset source/version, effective timestamps, and audit timestamps. The database enforces country consistency and uniqueness; the service validates parent type/level. Levels are data, not a fixed global enum.

Initial required hierarchies:

- ES: autonomous community/city -> province -> municipality.
- BR: federative unit -> municipality.
- CL: region -> province -> commune.

Imports are deterministic and idempotent. A versioned manifest records official URL, publication/reference date, retrieved timestamp, checksum, parser version, row counts, and evidence. Imports upsert by `(country, source, canonicalCode)`, record name/parent changes, and deprecate missing rows only after an explicit complete-snapshot comparison. Referenced divisions are never physically deleted.

## Identity protection

F8.5 stores a normalized value only as application-encrypted ciphertext plus a keyed HMAC lookup digest. It stores a safe mask separately. Encryption and HMAC keys are independent, required when identity persistence is enabled, and never emitted to logs/errors/events. Database uniqueness applies to `(countryId, typeKey, lookupDigest)` for active identity subjects; it does not expose the raw value.

Ordinary profile endpoints expose only type, country, mask, format status, verification state, and timestamps. Full-value recovery is not part of F8.5 public/admin APIs. Privileged document-value access requires a later separately reviewed use case, permission, reason, audit, and break-glass controls.

## Registration Schema contract

`GET /api/v1/markets/{marketCode}/registration-schema?actorType=CLIENT|PROFESSIONAL&locale=<tag>` returns declarative JSON:

```json
{
  "market": { "code": "ES", "countryCode": "ES", "status": "ACTIVE" },
  "policyVersion": 1,
  "schemaVersion": "market-policy:ES:1",
  "locale": "es-ES",
  "identityDocuments": [{ "type": "DNI", "labelKey": "identity.dni", "required": true, "constraints": { "maxLength": 16 } }],
  "geography": { "levels": [{ "type": "AUTONOMOUS_COMMUNITY", "required": true }] },
  "address": { "fields": [{ "key": "postalCode", "required": true, "maxLength": 16 }] },
  "capabilities": { "professionalServiceAreas": true }
}
```

The contract contains no regex, code, script, SQL, or executable expressions. Localization keys and bounded primitive constraints are allowlisted. Submission includes `marketCode` and `schemaVersion`; the server rejects unknown/disabled markets, stale versions, unsupported fields, invalid hierarchy, and cross-market identity types.

## Address and service areas

An Address belongs to a subject and purpose, references one Country and zero or more validated division links, and stores only necessary lines/locality/postal code/coordinates plus validation status/source. Coordinates are optional and precision-limited by policy. Legacy profile/booking strings remain compatibility projections during expand/migrate/contract.

A ProfessionalServiceArea is separate from all Address rows. F8.5 supports division-based coverage only. The schema reserves a closed `kind` for future radius/polygon work, but those kinds remain disabled until an approved need, spatial design, privacy review, and migration exist. F10 may query active division coverage but F8.5 performs no matching.

## API and access boundaries

Public registration endpoints return only active market configuration and public-safe geography. Administrative endpoints are versioned, paginated, bounded, authenticated, permission checked, and audited.

- `markets.read`, `markets.manage`
- `geography.read`, `geography.manage`
- `identity.policy.read`, `identity.policy.manage`
- `identity.documents.read.masked` (strict; no full value)

Official-code mutation is permitted only through validated dataset imports. Market-policy activation requires an effective version, recognized registries, supported locale/currency, reviewed legal references when applicable, reason, actor, and audit context.

## Threat model and controls

| Threat | Control |
|---|---|
| document enumeration/duplicate probing | generic conflict response, rate limits, HMAC lookup, no value echoes |
| identity spoofing | format status distinct from verification; verified state requires trusted method/source |
| cross-market identity use | adapter selected by active MarketPolicy; country/type checked transactionally |
| forged country/division | server resolves IDs and checks country, parent, lifecycle, market policy |
| unauthorized identity read | masked-only contract, narrow permission, audit; no recovery endpoint |
| PII log/telemetry/cache leak | allowlisted metadata, redaction tests, private/no-store identity responses |
| geography scraping/oversized query | active/public-safe projection, pagination/max limits, rate limiting |
| malicious dataset metadata | allowlisted URLs/sources, checksum, bounded parser, transactional import |
| RBAC/RLS bypass | backend permission checks plus forced RLS/default deny/no public grants |
| stale policy/schema replay | submitted schema version must equal current effective policy version |

## Official sources and review status

Sources checked 2026-09-09; they are ingestion/review inputs, never runtime dependencies.

- Spain identity: Ministerio del Interior, DNI and NIE guidance: https://www.interior.gob.es/opencms/es/servicios-al-ciudadano/tramites-y-gestiones/dni/ and https://interior.gob.es/opencms/es/servicios-al-ciudadano/tramites-y-gestiones/extranjeria/regimen-general/documentacion-de-las-personas-extranjeras/
- Spain geography: INE municipality/code relation, reference 2026-01-01, published 2026-02-04: https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177031&idp=1254735976614&menu=ultiDatos
- Brazil identity: Receita Federal, Meu CPF: https://www.gov.br/receitafederal/pt-br/assuntos/meu-cpf
- Brazil geography: IBGE municipality codes and DTB 2025: https://www.ibge.gov.br/explica/codigos-dos-municipios.php and https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/23701-divisao-territorial-brasileira.html
- Chile identity: Civil Registry identity guidance and SII Resolution 77/2025, which states natural-person RUT corresponds to RUN: https://www.registrocivil.cl/principal/ampliacion-general/informativo-bloqueo and https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso77.pdf
- Chile geography: INE open geodata/DPA and SUBDERE unique territorial codes: https://www.ine.gob.cl/herramientas/portal-de-mapas/geodatos-abiertos and https://www.subdere.gov.cl/documentacion/c%C3%B3digos-%C3%BAnicos-territoriales-actualizados-al-06-de-septiembre-2018

Identity/checksum implementation is engineering format validation, not a legal conclusion. Market activation, passport requirements, retention, verification sources, and any tax/payment policy remain blocked on qualified review.

## Compatibility, rollout, and rollback

F8.5 uses expand/migrate/contract:

1. Add tables, nullable relations, policies, and default-deny RLS.
2. Seed disabled ES/BR/CL market configuration and import official geography snapshots.
3. Dual-read normalized data first with legacy projections retained; do not dual-write identity values to legacy fields.
4. Move clients/admin to Registration Schema and normalized APIs.
5. Backfill only after reconciliation evidence; contract legacy columns in a future separately approved migration.

Rollback is application-first: disable F8.5 routes/market activation and return consumers to compatible legacy flows where safe. Retain all new tables, import evidence, audits, identities, and references. Never roll back by dropping populated evidence. Production and all markets remain inactive unless explicitly authorized.

## Phase boundary

```text
F8 Referrals & Automation
  -> F8.5 Markets / Identity / Geography
       -> F9 Experiments / Content / SEO (PAUSED — dependency F8.5)
            -> F10 Supply / Demand + AI Operations (NOT STARTED)
```

F9 later consumes Market, Country, locale, canonical division IDs/codes/names, hierarchy, public-safe identifiers, and a collision-safe localized slug strategy. It must not construct location pages from arbitrary strings. F8.5 does not implement SEO pages. F10 later consumes ProfessionalServiceArea; F8.5 does not implement matching.
