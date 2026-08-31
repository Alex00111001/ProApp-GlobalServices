# External skill intake and audit

Treat every external skill as executable supply-chain input, even when it contains only Markdown. Instructions can redirect agents, request tools, expose data, execute bundled scripts, or conflict with project governance.

## Intake gate

1. Quarantine the candidate outside active discovery paths.
2. Record source owner/repository, exact commit or release, retrieval date, license, skill path, and cryptographic hash/lock entry.
3. Inspect every file: `SKILL.md`, references, scripts, assets with executable content, hooks, MCP/tool dependencies, manifests, and generated binaries.
4. Search for instruction injection, hidden/encoded content, credential access, broad file/network access, destructive commands, production operations, telemetry, auto-update, downloads, and delegation to unreviewed resources.
5. Compare its advice with HomeServices architecture, versions, contracts, security, legal, and authorization boundaries.
6. Run scripts only in an isolated environment with representative non-sensitive fixtures; inspect source first and pin dependencies.
7. Test positive triggers, non-triggers, refusal/approval boundaries, output quality, and coexistence with first-party skills.
8. Assign owner, allowed scope, blocked operations, expiry/review date, and `APPROVED`, `RESTRICTED`, `PENDING_REVIEW`, or `REJECTED` status in the register.
9. Move/copy into a discovery path only after approval; preserve provenance and license.

## Update gate

No floating updates. For every source/version/hash change, review the diff and repeat affected security, behavior, and trigger tests. Approval never transfers automatically to a new commit or transitive dependency.

## Runtime rule

Agents may use only the exact approved entry and scope. Native tool/user permission prompts still apply. A skill cannot authorize production deployment, secrets, destructive data changes, external messages, financial actions, or scope expansion.

## Removal

Disable or remove a skill when its source is compromised, license changes, instructions conflict, maintenance lapses, a safer first-party skill replaces it, or review expires. Preserve the register history and evidence.
