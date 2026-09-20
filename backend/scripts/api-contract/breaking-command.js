const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./source-inventory');
const { buildInventory } = require('./inventory-command');
const { breakingChanges } = require('./breaking-changes');

const BASELINE = path.join(ROOT, 'docs/api/route-inventory.baseline.v1.json');

function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== '--check') throw new Error('Use --check. Baseline approval is an explicit reviewed repository change.');
  if (!fs.existsSync(BASELINE)) throw new Error('Approved route-inventory baseline is missing.');
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const candidate = buildInventory();
  const changes = breakingChanges(baseline, candidate);
  if (changes.length) throw new Error(`Unapproved breaking API inventory changes:\n- ${changes.join('\n- ')}`);
  console.log(JSON.stringify({ baseline: 'docs/api/route-inventory.baseline.v1.json', candidateRoutes: candidate.routes.length, breakingChanges: 0 }));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { BASELINE, main };
