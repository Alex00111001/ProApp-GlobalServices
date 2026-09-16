const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const repository = resolve(__dirname, '..');
const secretShapes = [
  {
    category: 'Stripe webhook signing secret',
    pattern: /whsec_[A-Za-z0-9]{24,}/g,
    control: ['wh', 'sec_', 'abcdefghijklmnopqrstuvwxyz012345'].join(''),
  },
  {
    category: 'Google API key',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    control: ['AI', 'za', 'Sy', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'].join('').slice(0, 39),
  },
];

for (const { category, pattern, control } of secretShapes) {
  if (!pattern.test(control)) throw new Error(`${category} negative control is not detected.`);
  pattern.lastIndex = 0;
}

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

  for (const { category, pattern } of secretShapes) {
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relativePath}:${line} (${category})`);
    }
    pattern.lastIndex = 0;
  }
}

if (findings.length > 0) {
  throw new Error(`Secret-shaped literals are prohibited:\n${findings.join('\n')}`);
}

console.log('Secret fixture guard passed: no tracked Stripe webhook or Google API key-shaped literals.');
