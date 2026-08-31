# HomeServices — Claude Code Instructions

Before substantial work, read and follow:

1. `AGENTS.md`
2. `docs/IMPLEMENTATION_PLAN.md`
3. `docs/agent-governance/GOVERNANCE.md`
4. `docs/agent-governance/MODEL_ROUTING.md`
5. The relevant HomeServices skills

`AGENTS.md` and the governance documents are the shared source of truth for Claude Code and Codex. This file is only the Claude Code adapter and must not redefine project architecture.

Project skills are exposed in `.claude/skills/<name>/SKILL.md`. Each adapter points to the canonical implementation in `.agents/skills/<name>/SKILL.md`; read the canonical file completely when a skill activates and resolve its relative links from the canonical skill directory.

Use `/skill-name` for explicit Claude Code invocation. Allow implicit selection only when the task matches the description. Do not invoke external Prisma/Supabase skills unless the exact entry is approved in `docs/agent-governance/EXTERNAL_SKILLS_REGISTER.md`.

Preserve the current Express 5/CommonJS backend. The `backend-fastapi` skill name is compatibility nomenclature, not authorization to introduce FastAPI; an accepted ADR is required first.

Never deploy to production or execute live financial/high-impact operations without explicit human authorization at the moment of action.
