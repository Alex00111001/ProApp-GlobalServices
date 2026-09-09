# ADR 0004 — Market, identity and geography architecture

- Status: Accepted
- Date: 2026-09-09
- Owners: Platform, Security, Privacy, Legal Engineering, Professional Experience, Operations
- Supersedes: none
- Governing architecture section: [F8.5 Markets, Identity and Geography](../MARKETS_IDENTITY_GEOGRAPHY.md)

## Context

F1-F8 contain incompatible country assumptions: user country defaults, free-text profile and booking geography, mixed default currencies, generic professional document metadata, and string market constraints. F9 location/content and F10 matching would make that debt harder to reverse. Production is inactive; F9 is paused and its recoverable work is preserved.

## Decision

Separate territorial `Country` from operating `Market`. A Country may exist with no enabled Market. Each Market has an explicit lifecycle and immutable effective MarketPolicy versions. Policy versions reference closed Identity, Geography, Address, Locale, Currency, Legal, Tax, and Payment policy registries; F8.5 implements only currently required identity/geography/address/locale/currency declarations and leaves future references extensible.

```text
Country
  -> Market
       -> MarketPolicy
            |- IdentityPolicy
            |- GeographyPolicy
            |- AddressPolicy
            |- LocalePolicy
            |- CurrencyPolicy
            |- TaxPolicy      [future reference]
            |- PaymentPolicy  [future reference]
            `- LegalPolicy    [F7 reference]
```

PostgreSQL is authoritative. Clients render the declarative, versioned Registration Schema and perform optional UX validation; the backend always re-resolves the active policy and validates submissions. Unknown, disabled, unreviewed, or stale policy state fails closed.

Identity uses a closed adapter registry. Values are normalized, syntax/checksum validated, HMAC-indexed, application-encrypted, separately masked, and never logged or exposed as telemetry. Validation never implies real-person verification. Natural-person Chilean RUN and RUT are one identifier in this scope, with `RUT` treated as an alias/context rather than an independent duplicate document.

Administrative geography is normalized, hierarchical, source/versioned, and imported reproducibly from official datasets. Addresses and professional service areas are distinct aggregates. F8.5 initially supports division-based service areas only.

## Alternatives considered

- Country strings and frontend conditionals: rejected as divergent, spoofable, and impossible to govern consistently.
- One `Market` table used as geography: rejected because territorial existence and business availability differ.
- Country-named identity columns on User/Professional: rejected as non-extensible and privacy-hostile.
- One fixed state/city hierarchy: rejected because ES/BR/CL structures differ and evolve.
- Reusing domicile as professional coverage: rejected because it violates purpose limitation and cannot represent operational coverage.
- Geography enums/manual samples: rejected because official datasets are large, versioned, and mutable.
- Treating format validation as identity verification: rejected as a security failure.

## Consequences and risks

The additive model is larger and requires server-driven clients, import tooling, lifecycle governance, RLS/RBAC, encryption-key operations, and data reconciliation. It avoids permanent national branching and provides F9/F10 stable primitives. Qualified legal/tax/payment review remains necessary before market activation; the architecture does not manufacture those policies.

## Contracts and data migration

The canonical contract, audit map, registry semantics, ingestion strategy, compatibility phases, and API boundaries live in `docs/MARKETS_IDENTITY_GEOGRAPHY.md`. Existing F1-F8 strings/columns remain during expand/read-new/contract. New relations are nullable until explicit backfill evidence exists. No F8.5 migration deletes history or uses `prisma db push`.

## Security, privacy, and financial impact

Identity values are sensitive and minimized; ordinary/admin profile reads are mask-only. Cross-market/country hierarchy is checked server-side. F8.5 declares ISO currencies but F3 remains the sole authority for monetary amounts, pricing, ledger, refunds, payouts, FX, and activation. F7 remains the authority for consent/legal evidence; MarketPolicy references it.

## Observability and verification

Operational signals include bounded market/policy resolution outcomes, schema version, geography import counts/checksum, invalid hierarchy category, identity validation category, and service-area rejection category. No document value, address, postal code, passport, CPF, DNI/NIE, RUN/RUT, or precise coordinates may be logged or used as a metric label.

Acceptance requires adapter unit tables; market lifecycle/policy tests; hierarchy/import idempotency tests; masked/unauthorized/cross-market identity tests; dynamic schema frontend/contract tests; RLS/RBAC/audit tests; full F1-F8 regression; dependency/secret scans; clean PostgreSQL/Supabase-compatible replay; and green remote CI.

## Rollout and rollback

Deploy additive schema/RBAC first with markets disabled, then backend read contracts, then clients/admin, then controlled data backfill. Activation is a separate human-authorized decision after legal/security/financial gates. Rollback disables application routes/market lifecycle and preserves all evidence; populated tables are not dropped.

## Approval evidence

Accepted as the governing implementation decision by the user’s F8.5 instruction dated 2026-09-09. This acceptance authorizes repository implementation and test-environment verification only; it does not authorize production or market activation.
