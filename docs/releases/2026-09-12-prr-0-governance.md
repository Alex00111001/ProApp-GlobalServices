# PRR-0 governance baseline — release evidence

- Date: 2026-09-12
- Status: **CLOSURE CANDIDATE — remote CI pending**
- Branch: `feature/production-control-plane-phase-11`
- Pre-change baseline: `dc338f296ca52097aac1e557f8bfa4522b7fda7c`
- Production: inactive and not authorized
- Markets: not activated by this change
- Live financial actions: none

## Classification

```text
Phase: PRR-0 / GOV-01 through GOV-06
Domain: Architecture / Markets / Billing / Security / Release
Risk: CRITICAL
Capability tier / model: DEEP / Codex Sol
Skills: architecture-guardian, payments, booking-engine, security,
        database-prisma, backend-fastapi, testing, release
Escalated: no production or financial authority; repository governance authorized by user
Acceptance: local verification + commit/push + required remote CI for exact closing SHA
Rollback: revert documentation/ADR commit before dependent runtime work; do not erase evidence
```

## Delivered governance

- Systematic audit and executable PRR-0 through PRR-8 remediation plan.
- ADR 0008: trusted-ingress territorial access without GPS.
- ADR 0009: default-off cash payment quarantine.
- F8.6 and PRR sequencing in the implementation plan and Market architecture.
- Exact-SHA CI and Notion non-authority closure rules in shared governance/AGENTS.
- Notion plan, 52-task backlog, status board, P0 view and master tracking entry.

## Local verification


- `git diff --check`: PASS.
- Local Markdown link target check for changed repository documents: PASS.
- `npm run verify`: PASS.
  - backend geography/build/syntax and unit/contract: 246/246;
  - Admin Web: 15/15 plus production build;
  - Public Web: 4/4 plus production SSR build;
  - customer mobile: 4/4 plus typecheck;
  - professional mobile: typecheck PASS.
- Known non-blocking observation: Admin bundle remains 501.65 kB and is tracked as PRR debt.

## Remote evidence

The local GitHub CLI credential returned `401 Bad credentials` before this change. This record must not
be changed to complete until the stage is pushed and all required jobs in `.github/workflows/ci.yml`
pass for the exact closing SHA. The run URL and SHA will be appended in a closure commit.

## Acceptance and rollback

This stage authorizes later repository implementation; it does not claim F8.6 or the cash containment
runtime is implemented. If rejected before dependent work, revert the governance commit. Once runtime or
evidence depends on these ADRs, supersede them explicitly rather than rewriting history.
