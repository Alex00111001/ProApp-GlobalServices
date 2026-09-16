const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const repository = resolve(__dirname, '..');
const stripeWebhookSecret = /whsec_[A-Za-z0-9]{24,}/g;
const syntheticControl = ['wh', 'sec_', 'abcdefghijklmnopqrstuvwxyz012345'].join('');

if (!stripeWebhookSecret.test(syntheticControl)) {
  throw new Error('Stripe webhook secret negative control is not detected.');
}
stripeWebhookSecret.lastIndex = 0;

const tracked = spawnSync('git', ['ls-files', '-z'], {
  cwd: repository,
  encoding: 'utf8',
});

if (tracked.status !== 0) {
  throw new Error(`Unable to enumerate tracked files: ${tracked.stderr || tracked.stdout}`);
}

const findings = [];
for (const relativePath of tracked.stdout.split('\0').filter(Boolean)) {
  let content;
  try {
    content = readFileSync(resolve(repository, relativePath), 'utf8');
  } catch {
    continue;
  }
  if (content.includes('\0')) continue;

  for (const match of content.matchAll(stripeWebhookSecret)) {
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    findings.push(`${relativePath}:${line}`);
  }
  stripeWebhookSecret.lastIndex = 0;
}

if (findings.length > 0) {
  throw new Error(`Secret-shaped Stripe webhook fixtures are prohibited:\n${findings.join('\n')}`);
}

console.log('Secret fixture guard passed: no tracked Stripe webhook secret-shaped literals.');
