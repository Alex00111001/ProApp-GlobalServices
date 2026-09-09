# HomeServices delivery dependency graph

The phase order is architectural, not merely chronological:

```text
F1 Foundation
 -> F2 Observability
 -> F3 Financial Foundation
 -> F4 Admin Foundation
 -> F5 Operations Control
 -> F6 Growth Data
 -> F7 Consent & Attribution
 -> F8 Referrals & Automation
 -> F8.5 Markets / Identity / Geography
 -> F9 Experiments / Content / SEO
 -> F10 Supply / Demand + AI Operations
```

F8.5 is a required dependency of F9 canonical location/locale/slug behavior and F10 professional coverage/matching. F9 is **PAUSED — architectural dependency F8.5**. F10 is not started. Closing F8.5 does not automatically resume either phase and never activates production.

The detailed cross-context map and accepted contracts are in [F8.5 Markets, Identity and Geography](MARKETS_IDENTITY_GEOGRAPHY.md) and [ADR 0004](adr/0004-market-identity-geography.md).
