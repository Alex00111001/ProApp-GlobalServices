# Architecture Decision Records

Use an ADR for a durable decision that changes or clarifies a target boundary, system of record, framework/provider strategy, public compatibility rule, financial invariant, identity/security boundary, retention model, or irreversible migration strategy.

Name files `NNNN-short-kebab-title.md`. Use this structure:

```markdown
# ADR NNNN — Title

- Status: Proposed | Accepted | Superseded | Rejected
- Date: YYYY-MM-DD
- Owners: <roles/people>
- Supersedes: <ADR or none>
- Governing architecture section: <link>

## Context
## Decision
## Alternatives considered
## Consequences and risks
## Contracts and data migration
## Security, privacy, and financial impact
## Observability and verification
## Rollout and rollback
## Approval evidence
```

An accepted ADR must remain within `docs/IMPLEMENTATION_PLAN.md` or update it in the same reviewed change. Implementation PRs link the ADR and relevant contracts/tests.

## Records

- [ADR 0001 — Stripe Connect separate charges and transfers](0001-stripe-connect-separate-charges-transfers.md)
- [ADR 0002 — Consent, first-party identity and reproducible attribution evidence](0002-consent-attribution-evidence.md)
- [ADR 0003 — Versioned referrals and PostgreSQL-backed durable automation](0003-referrals-durable-automation.md)
