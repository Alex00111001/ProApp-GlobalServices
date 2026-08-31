# External skills register

Status at the time of the HomeServices Skill Pack integration. `PENDING_REVIEW` means provenance/lock information exists but this integration did not attest the full content or authorize runtime use.

| Skill | Location | Source | Pin evidence | Status | Allowed scope |
|---|---|---|---|---|---|
| prisma-cli | `.agents/skills/prisma-cli` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None until audit |
| prisma-client-api | `.agents/skills/prisma-client-api` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None until audit |
| prisma-compute | `.agents/skills/prisma-compute` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None; not part of current target hosting |
| prisma-database-setup | `.agents/skills/prisma-database-setup` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None until audit |
| prisma-driver-adapter-implementation | `.agents/skills/prisma-driver-adapter-implementation` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None until audit |
| prisma-mongodb-upgrade | `.agents/skills/prisma-mongodb-upgrade` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None; PostgreSQL is the system of record |
| prisma-postgres | `.agents/skills/prisma-postgres` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None until audit |
| prisma-postgres-setup | `.agents/skills/prisma-postgres-setup` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None until audit |
| prisma-upgrade-v7 | `.agents/skills/prisma-upgrade-v7` | `prisma/skills` | root `skills-lock.json` | PENDING_REVIEW | None; repository already uses Prisma 7 |
| supabase | `backend/.agents/skills/supabase` | `supabase/agent-skills` | `backend/skills-lock.json` | PENDING_REVIEW | None; Supabase is not an approved system boundary |
| supabase-postgres-best-practices | `backend/.agents/skills/supabase-postgres-best-practices` | `supabase/agent-skills` | `backend/skills-lock.json` | PENDING_REVIEW | None until audit; generic PostgreSQL advice only if approved |

Approval fields to add during audit: reviewer, date, exact hash/commit, license result, tools/scripts reviewed, trigger tests, restrictions, expiry, and evidence link.
