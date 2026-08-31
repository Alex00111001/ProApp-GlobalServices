param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$required = @(
  'architecture-guardian',
  'backend-fastapi',
  'database-prisma',
  'frontend',
  'payments',
  'booking-engine',
  'professional-system',
  'admin-operations',
  'observability',
  'testing',
  'security',
  'legal-compliance',
  'release',
  'repo-auditor'
)

$errors = [System.Collections.Generic.List[string]]::new()

foreach ($name in $required) {
  $canonical = Join-Path $RepoRoot ".agents\skills\$name\SKILL.md"
  $adapter = Join-Path $RepoRoot ".claude\skills\$name\SKILL.md"

  if (-not (Test-Path -LiteralPath $canonical)) {
    $errors.Add("Missing canonical skill: $canonical")
    continue
  }

  $content = Get-Content -LiteralPath $canonical -Raw
  if ($content -notmatch "(?ms)^---\s*.*?^name:\s*$([regex]::Escape($name))\s*$.*?^description:\s*\S+.*?^---") {
    $errors.Add("Invalid frontmatter for canonical skill: $name")
  }

  if (-not (Test-Path -LiteralPath $adapter)) {
    $errors.Add("Missing Claude adapter: $adapter")
    continue
  }

  $adapterContent = Get-Content -LiteralPath $adapter -Raw
  $expected = ".agents/skills/$name/SKILL.md"
  if (-not $adapterContent.Contains($expected)) {
    $errors.Add("Claude adapter does not reference canonical skill: $name")
  }
}

$requiredFiles = @(
  'AGENTS.md',
  'CLAUDE.md',
  'docs/agent-governance/GOVERNANCE.md',
  'docs/agent-governance/MODEL_ROUTING.md',
  'docs/agent-governance/EXTERNAL_SKILL_AUDIT.md',
  'docs/agent-governance/EXTERNAL_SKILLS_REGISTER.md',
  'docs/agent-governance/SKILL_CATALOG.md',
  'docs/adr/README.md'
)

foreach ($relative in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $relative))) {
    $errors.Add("Missing integration file: $relative")
  }
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  throw "HomeServices agent integration validation failed with $($errors.Count) error(s)."
}

Write-Output "HomeServices agent integration valid: $($required.Count) canonical skills, Claude adapters, and governance files found."
