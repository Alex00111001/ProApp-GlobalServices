# Git history secret-purge runbook

## Purpose

Use this runbook only after revoking or rotating exposed credentials. A history rewrite changes commit identities and cannot revoke a credential. Production activation is outside this procedure.

## 2026-09-08 remediation record

- Repository: `Alex00111001/ProApp-GlobalServices`
- Removed path: `backend/.env`
- Additional scrub: one historical test seed-password literal repeated in two commits
- Tooling: `git-filter-repo` 2.47.0 and checksum-verified Gitleaks 8.30.0
- Rewritten commits: 135/135
- First changed commit: `50626dc0e8b3eea9a03f247f969ad1a82ac60220`
- Rewritten first changed commit: `1eea2ccd7c81df8ae121b68f20d7985e9f427768`
- Affected refs: 55 (19 branch heads and 36 GitHub PR heads)
- Tags: 0
- Forks at rewrite time: 0
- Remote branch verification: 19/19 match the rewritten ref map
- `backend/.env` reachable object/path checks: 0
- Full-history Gitleaks findings after rewrite: 0
- Current HEAD tree integrity: pre/post rewrite tree hashes match

## Mandatory GitHub Support purge

GitHub keeps pull-request refs read-only and may retain cached commit views after a force-push. Open a sensitive-data-removal request in GitHub Support with:

1. Owner/repository: `Alex00111001/ProApp-GlobalServices`.
2. Affected pull requests: 36.
3. First changed commit: `50626dc0e8b3eea9a03f247f969ad1a82ac60220`.
4. LFS orphan status: not checked because Git LFS is not in use.
5. Request: dereference affected PR refs, purge cached views and run server-side garbage collection for the removed sensitive file.

Do not include secret values in the ticket. Retain the ticket URL or identifier in the release evidence after submission.

## Collaborator recovery

Preferred recovery is to discard the old clone and clone the repository again. If local work must be preserved, create patches of intentional changes and apply them to a fresh clone. Never merge a pre-rewrite branch into rewritten history; it can restore the removed objects.

## Verification

Run these checks from a fresh clone after GitHub Support confirms the purge:

```powershell
git log --all -- backend/.env
git rev-list --objects --all | Select-String -Pattern ' backend/\.env$'
gitleaks git . --config .gitleaks.toml --redact=100
git ls-remote --heads --tags origin
```

The first two commands must return no matches, Gitleaks must report zero findings, and every advertised remote head must match the approved rewritten map.

## Rollback policy

Do not restore the pre-rewrite bundle to the remote: it contains the compromised history. A temporary local bundle may be retained only until branch verification, CI and recovery checks complete, then it must be securely removed. If functional recovery is required, recover application content as a patch onto the clean lineage instead of restoring old refs.
