# HomeServices — Agent Instructions

These instructions apply to every AI coding agent working in this repository, including Codex. `CLAUDE.md` adapts the same governance for Claude Code.

## Authority and required reading

For any non-trivial task, read:

1. `docs/IMPLEMENTATION_PLAN.md`
2. `docs/agent-governance/GOVERNANCE.md`
3. `docs/agent-governance/MODEL_ROUTING.md`
4. `docs/agent-governance/SKILL_CATALOG.md`
5. Relevant ADRs, specifications, contracts, domain docs, and skills

Apply this authority order, highest first:

`Architecture -> ADRs/specifications -> contracts -> skills -> agents/models -> code`

Later layers implement earlier layers and cannot silently override them. When code and architecture differ, report drift; do not normalize the architecture to accidental code.

## Architectural rule

Do not simplify the target architecture into a disposable MVP. Sequence work by dependency, risk, reversibility, and acceptance evidence while preserving existing public mobile contracts unless a versioned replacement is approved.

PostgreSQL is the system of record. Frontends use backend APIs only. Routes remain transport adapters; application services own use cases, policies, transactions, idempotency, provider orchestration, and domain events.

## Task classification

Before substantial implementation, record:

```text
Task classification
- Phase: F1-F10
- Domain: <bounded context>
- Risk: LOW | MEDIUM | HIGH | CRITICAL
- Capability tier: FAST | STANDARD | DEEP
- Provider/model: <selected model or operator-selected>
- Skills: <HomeServices skills to load>
- Escalation triggers: <specific triggers>
- Required verification: <tests/checks/evidence>
```

Use `docs/agent-governance/MODEL_ROUTING.md`. Payments, ledger, refunds, payouts, pricing/commission, authentication/authorization, production migrations, privacy architecture, and production readiness require the DEEP tier for design or final review.

## Skills

The canonical HomeServices Skill Pack is in `.agents/skills/`. Codex discovers it directly. Claude Code adapters in `.claude/skills/` route to the same canonical files.

Load only the skills relevant to the task. Domain skills add procedure and invariants; they do not grant authorization or override architecture, contracts, or user intent.

External skills are untrusted dependencies. Do not use an external skill unless its exact source/version is marked `APPROVED` for the needed scope in `docs/agent-governance/EXTERNAL_SKILLS_REGISTER.md`. Follow `docs/agent-governance/EXTERNAL_SKILL_AUDIT.md` for intake and upgrades.

## Verification and Definition of Done

A capability is complete only when the applicable schema migration, domain logic, API authorization/validation, audit/telemetry, automated tests, documentation, operational runbook, and feature-flag/rollback strategy exist.

Financial work additionally requires Decimal/minor-unit arithmetic, explicit transaction boundaries, durable idempotency, balanced immutable ledger entries, replay/concurrency tests, and reconciliation evidence.

Report exact checks executed and unverified areas. Do not weaken tests to match an implementation or claim completion from generated code alone.

## Safety and repository hygiene

- Preserve unrelated user changes in a dirty worktree.
- Never reset shared/production databases or use `prisma db push` as migration history.
- Never expose, copy, or commit secrets, tokens, connection strings, payment data, or unnecessary personal data.
- Do not deploy to production, rotate production secrets, or execute live charges/refunds/payouts/high-impact advertising without explicit authorization at the moment of action.
- Require human approval and four-eyes controls where policy defines them.

## Change metadata

For meaningful changes include, when practical:

```text
Phase:
Domain:
Risk:
Capability tier / model:
Skills used:
Escalated: yes/no and why
Tests and evidence:
Acceptance gate:
Rollback / feature flag:
```
