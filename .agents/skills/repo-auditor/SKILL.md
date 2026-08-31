---
name: repo-auditor
description: Audit the HomeServices repository against architecture, ADRs/specifications, contracts, skills, agent instructions, model policy, implementation, tests, and release gates. Use for read-only gap analysis, drift detection, or readiness reviews.
---

# Repository Auditor

Audit read-only by default. Do not fix findings unless the user separately asks for implementation.

## Authority order

Apply `docs/agent-governance/GOVERNANCE.md`:

`Architecture -> ADRs/specifications -> contracts -> skills -> agents/models -> code`

Later layers implement earlier ones and cannot silently override them.

## Audit workflow

1. Record branch/commit, dirty files, scope, date, and unavailable dependencies.
2. Inventory products, configs, schemas/migrations, routes, services, providers, tests, CI/deployment, instructions, and skills.
3. Compare the current code with target architecture and acceptance gates; distinguish stale baseline prose from an actual architectural decision.
4. Trace representative flows end to end, including auth, validation, transaction, event/audit, telemetry, failure, and rollback.
5. Check public contracts, permission/ownership matrices, financial invariants, migration safety, privacy evidence, and release controls.
6. Verify external skill provenance, lock/hash, license, permissions/tools/scripts, instruction safety, maintenance status, and approval register.
7. Report evidence with file/line, severity, impact, confidence, governing artifact, and smallest safe next action.

## Output

Separate:

- Confirmed compliant controls
- Critical/high/medium/low findings
- Documentation drift
- Missing evidence or tests
- Decisions requiring ADR/legal/product/security approval
- Recommended sequence and acceptance criteria

Do not mark a capability complete from generated code alone. Run checks only when safe and identify every unverified claim.
