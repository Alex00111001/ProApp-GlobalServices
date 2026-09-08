const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const binary = process.argv[2];
if (!binary) throw new Error('Usage: node scripts/verify-gitleaks-allowlist.cjs <gitleaks-binary>');

const repository = resolve(__dirname, '..');
const configPath = join(repository, '.gitleaks.toml');
const config = readFileSync(configPath, 'utf8');
const exactBlock = `[[rules]]
id = "generic-api-key"

[[rules.allowlists]]
description = "F8 deterministic non-secret referral idempotency test fixture"
regexTarget = "secret"
regexes = [
  '''^claim-revoked-1$''',
]`;

if (!config.includes('useDefault = true')) throw new Error('Default Gitleaks rules, including generic-api-key, must remain enabled.');
if (!config.includes(exactBlock)) throw new Error('The exact F8 secret-target allowlist is missing or has changed.');
if ((config.match(/claim-revoked-1/g) || []).length !== 1) throw new Error('The F8 fixture must be allowlisted exactly once.');
if (/claim-\.\*|claim-\.\+|referrals-automation\.test\.js|ac563c4/i.test(config)) throw new Error('A broad F8 path, commit, or pattern allowlist is prohibited.');

const root = mkdtempSync(join(tmpdir(), 'proapp-gitleaks-allowlist-'));

function scan(name, value) {
  const fixtureDirectory = join(root, name);
  const reportPath = join(root, `${name}.json`);
  mkdirSync(fixtureDirectory);
  writeFileSync(join(fixtureDirectory, 'fixture.js'), `const idempotencyKey = '${value}';\n`, 'utf8');
  const result = spawnSync(binary, [
    'dir', fixtureDirectory, '--config', configPath, '--report-format', 'json',
    '--report-path', reportPath, '--exit-code', '19', '--no-banner', '--redact',
  ], { encoding: 'utf8' });
  const findings = result.status === 19 ? JSON.parse(readFileSync(reportPath, 'utf8')) : [];
  if (![0, 19].includes(result.status)) throw new Error(`Gitleaks failed for ${name}: ${result.stderr || result.stdout}`);
  return findings;
}

try {
  const allowed = scan('allowed-exact-fixture', 'claim-revoked-1');
  if (allowed.length !== 0) throw new Error('The exact deterministic fixture was not classified by the allowlist.');

  const variant = scan('non-allowlisted-variant', 'claim-revoked-2');
  if (!variant.some((finding) => finding.RuleID === 'generic-api-key')) throw new Error('claim-revoked-2 must still trigger generic-api-key.');

  const generatedSecret = randomBytes(36).toString('base64url');
  const secret = scan('generated-secret', generatedSecret);
  if (!secret.some((finding) => finding.RuleID === 'generic-api-key')) throw new Error('A generated high-entropy idempotency key must still trigger generic-api-key.');

  console.log('Gitleaks allowlist verification passed: exact fixture allowed; variant and generated secret detected by generic-api-key.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
