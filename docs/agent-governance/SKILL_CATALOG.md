# HomeServices Skill Pack catalog

Canonical location: `.agents/skills/`. Codex invokes explicitly with `$skill-name`; Claude Code uses `/skill-name` through `.claude/skills/` adapters. Skills can also activate implicitly when their descriptions match.

| Skill | Primary scope | Default minimum tier |
|---|---|---|
| `architecture-guardian` | Architecture, boundaries, ADR need, cross-context design | DEEP |
| `backend-fastapi` | Express backend work; approved FastAPI boundary only | STANDARD |
| `database-prisma` | PostgreSQL/Prisma schema, migration, transactions | STANDARD; DEEP for risky migration |
| `frontend` | Customer/professional mobile and admin web | STANDARD |
| `payments` | Pricing, fees, commission, Stripe, ledger, refunds/payouts | DEEP |
| `booking-engine` | Booking state, availability, ownership, cancellations | STANDARD; DEEP when financial/concurrent |
| `professional-system` | Professional onboarding, approval, availability, earnings | STANDARD |
| `admin-operations` | RBAC admin control center and high-impact workflows | STANDARD; DEEP for privilege/financial controls |
| `observability` | Logs, context, errors, health, incidents, traces | STANDARD |
| `testing` | Unit/integration/contract/invariant/security verification | FAST or STANDARD; DEEP for critical test design |
| `security` | Threat model, auth/RBAC, secrets, uploads, privacy boundaries | DEEP |
| `legal-compliance` | Versioned legal/privacy requirements and evidence | DEEP plus qualified human review |
| `release` | CI/CD, migrations, staged rollout, rollback/readiness | STANDARD; DEEP final production review |
| `repo-auditor` | Read-only architecture-to-code audit and drift | STANDARD; DEEP for critical readiness |

Combine skills when a task crosses domains, but keep one primary owner. Examples: booking cancellation with refund uses `booking-engine` plus `payments`; an admin refund UI uses `admin-operations`, `payments`, `frontend`, `security`, and `testing`.

All skills that introduce country- or market-specific behavior must first apply the canonical COUNTRY/MARKET VARIATION GATE in `docs/MARKETS_IDENTITY_GEOGRAPHY.md`. `architecture-guardian` owns boundary review; relevant domain skills then implement the accepted policy/adapter/registry contract. Legal, tax, identity, currency, and payment interpretations retain their existing DEEP and qualified-review requirements.

The name `backend-fastapi` is retained from the requested pack. Its canonical instructions explicitly preserve Express 5/CommonJS and require an ADR before any FastAPI service or migration.

## Engineering tooling audit — 2026-09-24

This section is the canonical Codex skills installation record; do not create a second
`docs/engineering/CODEX_SKILLS.md`. Baseline: `47e6b364ce6827e1e2287552524dcb12fe5c5a99`,
branch `feature/production-control-plane-phase-11`, clean worktree, confirmed origin
`Alex00111001/ProApp-GlobalServices`, local root `C:/dev/ProApp-GlobalServices`.
The task session's older Documents path does not exist; use the explicit repository root.

Task classification: tooling/governance only; no PRR implementation; engineering domain;
HIGH risk (agent instructions/supply chain); DEEP required for design/final review.
Required routing: Sol for governance/security review, Luna for mechanical inventory.
Resolved execution model: NOT SELECTABLE BY THIS RUNNER; no model switch or delegation claimed.
Verification: native Codex discovery, repository integration validator, read-only capability
exercises, fixture/artifact guard, diff scope and isolated commit. No PRR acceptance claimed.

### Pre-install inventory

- First-party repository pack: 14 skills in the table above, with 14 Claude adapters.
- Existing external installs: nine Prisma skills at root and two Supabase skills under
  `backend/.agents/skills`; all remain PENDING_REVIEW as recorded in the external register.
  Their existing lockfiles are not approval. No duplication, upgrade, execution or approval here.
- Global user skills: find-skills and eight Stripe skills (connect-recommend,
  connect-required-verification-information, stripe-apps, stripe-best-practices,
  stripe-directory, stripe-docs, stripe-projects, upgrade-stripe).
- Native system skills: imagegen, openai-docs, plugin-creator, skill-creator, skill-installer.
  Session plugin skills cover documents, presentations, sheets, PDF, visualization, computer use,
  Dropbox, Drive, Notion, Canva, Higgsfield, Genially, plugin management and artifact templates;
  none supplies the missing HomeServices runtime-contract procedure.
- Global Codex TOML: trusted repository root, danger-full-access, approval never, native plugins;
  no skills enable/disable override found. No repository `.codex/` configuration present.
  No parent AGENTS.md found at C:/ or C:/dev/. Root AGENTS.md remains the authority.
  This task adds no permissions and changes no global config. Markdown is guidance, not a sandbox.
- Root package.json coordinates five packages through npm --prefix (no npm workspaces field):
  Express 5/CommonJS/Zod 4/Prisma 7 backend, React/Vite admin and public web, two Expo mobile apps.
  Existing Node test runner, Jest, typechecking, oxlint, AJV 8 and swagger-parser are reused.
- Existing API tooling: source/consumer inventory, input/output schema catalogs, OpenAPI generation
  and validation, breaking-change checks, response-contract and HTTP tests, financial PostgreSQL
  concurrency acceptance. No alternate generator, schema validator or test runner is needed.
- Existing CI: quality/build/unit/contracts + six dependency audits; isolated PostgreSQL migrations,
  integration and financial acceptance; full-history Gitleaks. Tracked-tree secret-shaped fixture
  and artifact hygiene guard runs through verify:backend. All remain authoritative and unchanged.
- Development commands include migration/reset, provider checks and live security audit commands;
  these are not harmless smoke tests and were not run for skill validation.

### Selection matrix (recorded before installation)

| Skill/capability | Already available | Candidate | Purpose | Overlap | Security risk | Maintenance risk | Repository changes required | Recommendation |
|---|---|---|---|---|---|---|---|---|
| Systematic engineering | Partial: architecture-guardian, testing, governance | Local systematic-engineering v1 | Dependency planning, root-cause hypotheses, TDD, review | Reuses existing testing/release gates | Low: text only, no credentials/hooks | Local ownership | New skill + adapter + catalog | APPROVED; install |
| Superpowers bundle | No | obra/superpowers at 5bf4e78011075bcfc0dc295f0724994cd123ee71 | Integrated engineering workflow | High with local pack | Debugging example prints environment; TDD mandates deleting prior code | Bundled workflow/transitive skills | Would add broad workflow | REJECTED as-is; stop candidate installation |
| Verification before completion | Yes: AGENTS/GOVERNANCE/release | Superpowers verification-before-completion | Evidence discipline | Very high | Low text-only | Duplicate closure guidance | Unnecessary | REJECTED duplicate; strengthen canonical rule |
| Repository mapping | Yes: repo-auditor, architecture-guardian, DEPENDENCY_GRAPH | Extend repo-auditor | Ownership/consumer/dependency map and drift | No second mapper | Low: read-only local files | Low | Existing skill only | APPROVED; configure |
| External repository mapping | Partial | Trail of Bits audit-context-building at 32e34f8173796e3566a51aee877dc96bc5191f64 | Detailed audit context | High with repo-auditor | Workflow dispatch and file generation dependencies | Claude-specific Workflow/Task integration | Port workflow and maintain dossier format | DEFERRED; no demonstrated benefit over existing mapper |
| API contract engineering | Partial tooling; no specialist skill | Local api-contract-engineering v1 | Runtime authority to wire/consumer evidence | Reuses all existing API tools | Low: analysis-first text only | Local architecture owner | New skill + adapter + catalog | APPROVED; install |
| External OpenAPI skill | No | wshobson/agents openapi-spec-generation at 4236bb91f8395b0435f1d8b8baf9e8e4c69a8620 | OpenAPI 3.1 authoring | Existing generator already provides this | Design-first/manual authority possible | Examples use FastAPI/tsoa, not current Zod projection | Adapting and duplicating contract tooling | REJECTED for this architecture |
| Security review | Yes: security/testing + executable gates | Extend security | Explicit abuse and taint-flow review | No duplicate scanner | Low: defensive read-only dry run | Low | Existing skill only | APPROVED; configure |
| Official security skill | No | openai/skills security-best-practices at 49f948faa9258a0c61caceaf225e179651397431 | Framework security guidance | High with security | Text entrypoint; complete package not audited | Extra overlapping references | None needed | DEFERRED; no full-package approval |
| Codex Security | Available in catalog, not installed | Official codex-security plugin | Additional repository security investigation | Useful possible deeper review | Full source/version/data egress not established pre-install | Provider-managed | Unknown | DEFERRED/BLOCKED intake; no installation |
| Schemathesis | No | Standalone technical test tool | Generated HTTP/property testing | Partial contract overlap; novel malformed input search | Mutating HTTP, payload/report leakage if misconfigured | Python runtime, test budgets, fixtures | Future isolated harness/CI proposal | RECOMMEND_INSTALLATION separately; Install now: NO |

### Supply-chain decision

PASS applies only to the two locally authored Markdown skills and the configured existing skills.
They are first-party procedures based on repository contracts and the task requirements, not copied
external packages. No external skill was approved or installed. No hooks, scripts, binaries,
install/postinstall, dependencies, telemetry, auto-update, network clients, GitHub token access,
credential access or environment enumeration are added. Local repository reads and explicitly
scoped edits/tests are their only procedural needs. Host permissions remain unchanged.

External sources were downloaded as text into `C:/dev/codex-skill-audit-20260924`, outside skill
discovery and outside the repository. No candidate code was executed. Candidate evaluation is not
an attestation of an entire upstream repository. Intake stops when a conflict is established.

| Source/author | License and maintenance observed | Source/documents inspected | Intake result |
|---|---|---|---|
| obra/superpowers; Jesse Vincent | MIT license text; latest commit 2026-09-19 | README, tree, TDD, planning, debugging and verification entrypoints | Unsafe environment diagnostic example; destructive TDD prescription; transitive workflow requirements. Rejected as-is before any installer/hooks/scripts execute |
| wshobson/agents; Seth Hobson | MIT license text; latest commit 2026-09-13 | Tree, OpenAPI entrypoint and code-first/tooling reference | Manual/design-first and alternate framework patterns do not enforce runtime authority. Rejected; no installer executed |
| trailofbits/skills; Trail of Bits | Repository metadata CC-BY-SA-4.0; latest commit 2026-09-21 | Audit-context entrypoint and repository metadata | Claude workflow dependencies, overlap; deferred before full transitive audit |
| openai/skills; OpenAI | Per-skill LICENSE.txt present; repository-wide license unspecified; latest commit 2026-06-24 | Curated tree and security entrypoint | Overlap; complete license/reference review deferred with installation |
| Codex Security; OpenAI | Official catalog identity confirmed; exact package revision/license/source unavailable in metadata | Catalog search, dependency and permission queries, official product documentation | Not installed; default app permission Always ask. Optional GitHub, Linear and unresolved Atlassian mapping. No approval based solely on catalog trust |

External network/data exposure: public web searches and unauthenticated read-only GitHub API/raw
source downloads, plus plugin catalog/permission metadata queries. No repository source, contracts,
credentials or environment values uploaded to a new third-party analysis service. Existing Codex
model processing remains part of this session. Secrets required: NONE. No Notion/GitHub mutations.

Primary sources (retrieved 2026-09-24):
- [Codex skills format/discovery](https://learn.chatgpt.com/docs/build-skills)
- [Superpowers pinned source](https://github.com/obra/superpowers/tree/5bf4e78011075bcfc0dc295f0724994cd123ee71)
- [OpenAPI candidate pinned source](https://github.com/wshobson/agents/tree/4236bb91f8395b0435f1d8b8baf9e8e4c69a8620/plugins/documentation-generation/skills/openapi-spec-generation)
- [Trail of Bits pinned source](https://github.com/trailofbits/skills/tree/32e34f8173796e3566a51aee877dc96bc5191f64)
- [Official security skills source](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices)
- [Official Codex Security product description](https://developers.openai.com/blog/scaling-cyber-defenders-with-daybreak)
