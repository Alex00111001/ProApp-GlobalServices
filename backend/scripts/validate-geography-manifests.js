const fs = require('node:fs');
const path = require('node:path');
const { geographyImportBody } = require('../src/validators/markets.validators');
const { validateManifest } = require('../src/modules/markets/geography-manifest');

const directory = path.resolve(__dirname, '..', 'prisma', 'geography-data');
const expectedCounts = Object.freeze({ ES: 8203, BR: 5598, CL: 418 });

for (const fileName of ['es.json', 'br.json', 'cl.json']) {
  const filePath = path.join(directory, fileName);
  const parsed = geographyImportBody.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  const normalized = validateManifest(parsed);
  const expected = expectedCounts[parsed.countryCode];
  if (normalized.length !== expected) throw new Error(`${parsed.countryCode}: expected ${expected} records, received ${normalized.length}`);
  process.stdout.write(`${parsed.countryCode}: ${normalized.length} records ${parsed.checksumSha256}\n`);
}
