# HomeServices Skill Pack integration report

Date: 2026-08-31

## Audited baseline

- Repository: `C:\dev\ProApp-GlobalServices` on `feature/platform-control-center-phase-2`.
- Products: Express 5/CommonJS/Prisma 7 backend, Expo customer app, Expo professional app, React/Vite admin web.
- Existing agent configuration: root `AGENTS.md`, `docs/CODEX_MODEL_ROUTING.md`, root Prisma skills and lockfile, backend Supabase skills and lockfile.
- Claude Code: local version 2.1.251; project skills use `.claude/skills/<name>/SKILL.md`; its native component validator accepts the new adapters.
- Codex: repository skills use `.agents/skills/<name>/SKILL.md`; root instructions use `AGENTS.md`.
- The worktree already contained in-progress billing, migration, configuration, and integration-test changes. This integration did not edit those files.

Official format references:

- Codex skills: <https://learn.chatgpt.com/docs/build-skills>
- Codex `AGENTS.md`: <https://learn.chatgpt.com/docs/agent-configuration/agents-md>

## Implemented design

- First-party canonical skill source: `.agents/skills/`.
- `.gitignore` keeps unknown/local agent content ignored while explicitly allowing the 14 first-party skill directories to be versioned.
- Claude Code adapter layer: `.claude/skills/`; adapters load the canonical skill rather than duplicate it.
- Shared governance: `AGENTS.md`, `CLAUDE.md`, `docs/agent-governance/`, and `docs/adr/`.
- Deterministic validation: `scripts/validate-agent-integration.ps1`.
- External Prisma/Supabase skills remain installed but are marked `PENDING_REVIEW`; lockfiles are provenance evidence, not approval.
- `backend-fastapi` is retained as a requested compatibility name and explicitly preserves Express unless an accepted ADR authorizes FastAPI.

## Validation commands

```powershell
claude --version
claude --help
claude plugin validate .agents\skills
claude plugin validate .claude\skills
.\scripts\validate-agent-integration.ps1
git -c safe.directory=C:/dev/ProApp-GlobalServices status --short --branch
```

Observed result: both Claude component validations passed and the repository validator found all 14 canonical skills, all 14 Claude adapters, and all required governance files.

The bundled Codex `quick_validate.py` could not start because its Python runtime lacks `PyYAML`. No dependency was installed globally. Claude's native validator and the repository validator independently parsed/checked the same frontmatter and structure.

## Pending decisions

1. Audit and explicitly approve, restrict, or remove every external Prisma/Supabase skill in the register.
2. Confirm the workspace-approved Claude FAST model alias and subscription availability; local CLI advertises `fable`, `sonnet`, and `opus`, but the repository intentionally does not infer cost/capability for `fable`.
3. Decide whether to formalize the currently implemented React/Vite admin web versus the implementation plan's earlier Next.js proposal through an ADR or architecture update.
4. Refresh baseline statements in `docs/IMPLEMENTATION_PLAN.md` that no longer match the current admin and professional applications, without weakening the target architecture.
5. Add CI configuration for the documented format/validate/generate, type/build, test, migration-drift, and secret-scan gates.
6. Review and commit the integration separately from the pre-existing billing/database work.
