# ADR 0008 — Territorial access without GPS

- Status: Accepted
- Date: 2026-09-12
- Owners: Product, Platform, Security, Privacy/Legal, Mobile and Operations
- Supersedes: none
- Governing architecture section: [F8.5 Markets, Identity and Geography](../MARKETS_IDENTITY_GEOGRAPHY.md)

## Context

HomeServices must restrict customer and professional application access to an explicitly enabled
operating country without asking the user to select or disclose their location and without requesting
GPS permissions. The current mobile registration screens expose a Market selector, while the backend
does not evaluate network-derived country before user operations. A client-supplied country or Market
is spoofable and cannot be an authorization boundary.

IP-derived country is approximate and may be missing, unknown or affected by VPNs, relays and carrier
networks. Applying one global middleware would also incorrectly block provider webhooks, workers,
health checks and administrative operations. The decision therefore needs an explicit trust boundary,
route matrix, indeterminate state and rollback.

## Decision

The trusted ingress edge or load balancer derives an ISO 3166-1 alpha-2 country code from the source
network. The origin accepts this evidence only from an approved, closed ingress adapter and must not be
directly reachable from untrusted Internet traffic. The edge strips any geography headers supplied by
the caller and writes its own. Exact proxy topology and trusted headers are configuration, never request
parameters.

`TerritorialEligibilityService` combines the network evidence with the current server-authoritative
`Market` and effective reviewed `MarketPolicyVersion`. Its closed decisions are `ALLOWED`, `BLOCKED`,
`UNDETERMINED` and `TEMPORARILY_UNAVAILABLE`. Missing, malformed, unknown, anonymous/Tor or stale
evidence never becomes `ALLOWED`. An active Market and effective policy are necessary but not sufficient;
the observed country must satisfy the versioned territorial policy.

The initial intended operating country is Spain (`ES`), but `ES` is not hardcoded into mobile or route
logic. Allowed countries resolve from reviewed Market policy. Adding or changing a country requires the
Market lifecycle, this ADR's provider/security controls and applicable legal/privacy review.

A public, rate-limited bootstrap contract returns only the bounded decision, country/market code,
policy version, stable reason, evaluation time and expiry. Mobile clients resolve it before restoring a
session or showing authentication. The backend reevaluates protected user operations; a cached mobile
decision is UX state, not authorization.

No application requests location permission or calls GPS/location APIs for territorial eligibility.
Android fine/coarse location permissions are removed when unused. Existing booking coordinates may be
rendered without reading the device's current location.

## Alternatives considered

- Ask the user for country: rejected because it is self-asserted, spoofable and explicitly unwanted.
- Device GPS: rejected because it is unnecessary, privacy-expensive and permission-dependent.
- Client-side IP lookup: rejected because it moves authority to an untrusted client and exposes another
  provider contract.
- Accept `X-Forwarded-For` or country headers from any caller: rejected as spoofable.
- Global route middleware: rejected because machine/provider traffic has different trust controls.
- Allow on provider outage or unknown result: rejected because territorial enforcement must fail closed.

## Consequences and risks

The platform needs a trusted ingress, exact origin restriction, a provider-neutral adapter, versioned
policy, route classification and customer-support flow for false blocks. IP geolocation cannot prove
residency or exact physical presence. Legitimate roaming, VPN, carrier or privacy-relay users may be
blocked; shadow metrics, bounded caching, retry/support UX and canary abort thresholds mitigate this.

Administrative access uses a separate MFA/Zero Trust policy. Stripe/provider webhooks use signatures,
replay protection and provider-specific network controls. Workers are not user traffic. Public SEO
availability remains a Product decision and cannot be inferred from the mobile rule.

## Contracts and data migration

The implementation is additive. A territorial policy reference may live immutably inside
`MarketPolicyVersion`; a separate versioned policy is added only if lifecycle or reuse requires it.
Any persisted `TerritorialAccessDecision` stores bounded decision evidence and no raw IP by default.
New relations remain compatible while old mobile versions are controlled through a minimum-supported-
version policy after rollout.

The API adds `GET /api/v1/access/eligibility` and stable territorial error codes. Existing route paths
remain. Registration no longer accepts a user-selected Market as authority; server resolution wins.

## Security, privacy, and financial impact

Origin bypass, forged headers, unsafe `trust proxy`, production test overrides and fail-open provider
behavior are release blockers. Network-country evidence is personal-data-adjacent and must be minimized,
retained only under an approved schedule and excluded from high-cardinality logs/metrics. DPIA/DPA/data-
residency review is required before activation.

Billing remains F3 authority. Territorial eligibility may deny access to payment and booking routes but
cannot select currency, pricing, tax or settlement behavior directly from Country.

## Observability and verification

Metrics are limited to decision, reason, Market, ingress adapter and bounded latency. They never use IP,
address, document or precise location labels. Required tests cover ES allow with active policy; non-ES
block; disabled/stale Market; missing/invalid/unknown/Tor evidence; forged headers; origin bypass;
IPv4/IPv6 and network change; provider outage; old/new clients; webhook/worker exemptions; cache expiry;
and absence of GPS permissions/calls in source and built artifacts.

Completion requires unit, HTTP contract, PostgreSQL integration, security and mobile E2E tests plus a
real staging ingress, shadow comparison, canary, false-block threshold and rollback rehearsal. Fakes are
allowed for deterministic cases but do not replace staging evidence from the selected ingress.

## Rollout and rollback

Ship schema/policy and adapters with `TERRITORIAL_ACCESS_ENABLED=false`. Run shadow mode without raw-IP
persistence, then enforce backend routes by Market/audience, publish compatible mobile clients, remove
location permissions, require the new minimum client version, and canary before expansion.

Rollback is application-first: disable enforcement and return to the last compatible server flow while
preserving policy/decision/audit evidence. No rollback drops populated tables or activates another
Market. Production and Market activation remain separate human-authorized decisions.

## Approval evidence

Accepted by the user's explicit authorization on 2026-09-12 to apply governance changes GOV-01 through
GOV-06 and begin PRR-0. This acceptance authorizes repository implementation and test/staging evidence
only. It does not authorize a production deployment, Market activation, secret rotation or live
financial action.
