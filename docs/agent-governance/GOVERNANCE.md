# HomeServices AI Engineering Governance

## Purpose

This document keeps human and AI contributors aligned on one durable target architecture while allowing reversible, verifiable implementation slices. It governs Codex, Claude Code, other agents, their skills, and model selection.

## Authority hierarchy

The leftmost layer has the highest authority:

`Architecture -> ADRs/specifications -> contracts -> skills -> agents/models -> code`

| Layer | Role | May change when |
|---|---|---|
| Architecture | Target boundaries, system of record, cross-cutting invariants, delivery phases | A deliberate architecture decision is approved and the architecture source is updated |
| ADRs/specifications | Context-specific decisions and behavior within the target architecture | Status, owner, consequences, migration, and supersession are reviewed |
| Contracts | Versioned API, event, schema, permission, and operational interfaces | Compatibility and consumer migration are explicit |
| Skills | Reusable procedures, invariants, and verification guidance | The higher layers and observed repository needs justify the change |
| Agents/models | Execution and reasoning capacity | Risk/cost routing changes; authority does not |
| Code | Current implementation evidence | It conforms to all applicable higher layers and passes gates |

Code can reveal that documentation is stale, but it cannot silently redefine intended architecture. An ADR cannot contradict the target architecture unless the architecture document is amended or explicitly delegates the decision.

## Conflict protocol

1. Identify the exact conflicting artifacts and affected consumers/data.
2. Pause only the conflicting part of implementation.
3. Prefer the higher-authority artifact and the safer, backward-compatible interpretation.
4. Request an ADR/product/security/legal decision when intent remains ambiguous.
5. Update the governing artifact before or with the implementation; do not leave the decision only in chat or code.

## Change protocol

For non-trivial changes:

1. Classify phase, domain, risk, capability tier, skills, escalation triggers, and verification.
2. Inspect current code and dirty worktree; preserve unrelated changes.
3. Locate architecture, ADR/specification, contract, and domain guidance.
4. Define invariants, authorization, data migration, compatibility, telemetry, tests, rollout, and rollback.
5. Implement the smallest slice that advances the final design rather than a throwaway substitute.
6. Record evidence and unresolved decisions.

Create an ADR for a new/changed bounded context, system of record, framework or provider strategy, public compatibility rule, financial invariant, identity/security boundary, data retention model, or irreversible migration strategy. Use `docs/adr/README.md`.

## Shared skill architecture

- Canonical skills: `.agents/skills/<name>/SKILL.md`.
- Codex: discovers canonical repository skills directly.
- Claude Code: `.claude/skills/<name>/SKILL.md` adapters point to canonical skills.
- Shared instructions: `AGENTS.md`, `CLAUDE.md`, and this directory.
- External dependencies: lockfiles plus the external skill register; never mix external content into the first-party pack without attribution and review.

Change a skill only when repository evidence or a higher-authority artifact changes its decisions. Keep descriptions discriminating and bodies focused; add scripts only for deterministic repeated work.

## Human authorization boundaries

Agent instructions, skills, model tier, and tool availability never grant business authority. Production deployment, secret rotation, destructive data operations, live financial actions, privilege grants, policy publication, and high-impact advertising require explicit authorized human approval at the moment of action.

Legal policy text and country interpretations require qualified review. Agents may implement approved controls and evidence models, not invent binding policy.

## Maintenance

Review this governance, the model map, skill descriptions, external register, and adapters whenever architecture changes, a model/provider is replaced, a skill dependency is upgraded, or a post-incident review identifies an instruction failure.
