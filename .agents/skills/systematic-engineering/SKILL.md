---
name: systematic-engineering
description: Plan dependency-aware HomeServices implementation, investigate reproducible failures, and apply TDD with evidence-backed review. Use for multi-step engineering or debugging within an authorized task; planning alone never authorizes implementation.
---

# Systematic engineering

Apply `AGENTS.md` and `docs/agent-governance/GOVERNANCE.md` first. MVP = DISCARDED;
target = COMPLETE + STABLE + PUBLISHABLE + PRODUCTION-READY. Incremental execution
implements the final architecture. This skill creates no backlog, gate, or completion authority.

## Planning mode

1. Establish the authorized PRR/task, exact revision, dirty worktree, governing contract,
   prerequisites and excluded operations. Read the relevant domain skill and existing PRR evidence.
2. Map dependencies from providers and domain rules through validators/serializers, schema
   projections and consumers. For each proposed unit record its inputs, outputs, owning files,
   prerequisite units, highest-risk assumption, meaningful failing test, required gate and rollback.
3. Order work by dependency, then risk and verifiability. A unit must advance the final architecture;
   a stub, mock or bypass cannot satisfy an acceptance criterion requiring a real integration.
4. Keep the plan in the current task or existing PRR evidence location. Do not create a parallel
   backlog or redefine HECHO. In analysis/planning-only requests, return the plan without edits.

## Debugging mode

1. Record the failing command, expected/observed behavior, exit status and reproducibility.
   Separate environment/setup failure, implementation defect and architectural conflict.
2. Follow the failing value backward across consumer, transport, validator, service and persistence
   boundaries. Compare one working flow and recent diffs; cite the earliest unsupported assumption.
   Use synthetic fixtures and redacted structural observations, never raw environment/credential dumps.
3. State one falsifiable cause and one experiment with predicted outcomes. Change one variable at a
   time in an isolated test environment. If the experiment refutes it, retain the evidence and revise
   the hypothesis rather than accumulate speculative fixes.
4. Follow MODEL_ROUTING escalation after two non-mechanical failures. Unresolved contract or
   architectural conflict stops the affected work; it does not authorize changing the target.

## TDD and incremental implementation

For authorized behavior changes, load `testing`. Specify observable acceptance behavior; write and
run a regression test that fails for that behavior, not a missing dependency or syntax mistake.
Then implement the narrowest coherent part of the final design and run the regression plus affected
suites. Refactor only while keeping the behavior evidence green. Record red/green results honestly.
For pre-existing code, preserve user changes and add characterization/regression evidence; never
blindly delete existing implementation because it preceded a test. Documentation/configuration work
uses meaningful format, discovery and scope checks instead of invented application tests.

## Review and verification

Review the diff against each acceptance criterion, public compatibility, ownership/RBAC, failure
semantics and domain invariants. Load `security`, `api-contract-engineering` or `release` when the
scope requires them. Report findings by severity, source location and testable consequence.

Follow the canonical verification chain in GOVERNANCE. No fixed/done/complete/production-ready
claim without executed evidence for that claim. Local green is not CI, and CI is not a human gate.
Missing/skipped gates remain visible. Do not delete tests, weaken assertions, patch contract
artifacts to make gates pass, advance another PRR, or activate Production, Markets, CASH or F11.
Stop at the authorized task boundary and return evidence for review.
