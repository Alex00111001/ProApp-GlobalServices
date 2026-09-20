const fs = require('node:fs');
const path = require('node:path');
const { ROOT, inventory, sourceFingerprint } = require('./source-inventory');
const { consumerInventory } = require('./consumer-inventory');
const { schemaCatalog } = require('./schema-catalog');

function buildInventory() {
  const routes = inventory();
  const consumers = consumerInventory(routes);
  for (const route of routes) route.consumers = [...new Set(consumers.filter((call) => call.operation === `${route.method} ${route.path}`).map((call) => call.consumer))].sort();
  return { formatVersion: 1, status: 'AUDITED_SOURCE_INVENTORY_NOT_APPROVED_OPENAPI',
    sourceFingerprint: sourceFingerprint(), routes, consumers, schemas: schemaCatalog(routes) };
}
const serialize = (document) => `${JSON.stringify(document, null, 2)}\n`;
function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--write', '--check', '--summary'].includes(args[0])) throw new Error('Use --write, --check or --summary.');
  const document = buildInventory();
  const output = path.join(ROOT, 'docs/api/route-inventory.v1.json');
  if (args[0] === '--write') {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, serialize(document));
  } else if (args[0] === '--check') {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== serialize(document)) {
      throw new Error('Route inventory is stale. Regenerate and review the runtime and consumer differences.');
    }
    const unresolved = document.consumers.filter((call) => call.status !== 'PATH_METHOD_MATCH');
    if (unresolved.length) {
      throw new Error(`Consumer inventory contains ${unresolved.length} unresolved path/method call(s).`);
    }
  }
  console.log(JSON.stringify({ routes: document.routes.length,
    classifications: Object.fromEntries(Object.entries(Object.groupBy(document.routes, (r) => r.classification)).map(([key, value]) => [key, value.length])),
    consumerCalls: document.consumers.length,
    unresolvedConsumers: document.consumers.filter((c) => c.status !== 'PATH_METHOD_MATCH').length,
    schemaBindings: Object.keys(document.schemas).length,
    unprovenWireSchemas: Object.values(document.schemas).filter((s) => s.wireParity !== 'STRUCTURAL').length,
    output: 'docs/api/route-inventory.v1.json', openApiPublication: 'BLOCKED_PENDING_COMPLETE_PARITY',
  }));
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildInventory, serialize, main };
