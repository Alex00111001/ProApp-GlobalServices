process.env.MARKETS_IDENTITY_GEOGRAPHY_ENABLED = 'true';
process.env.IDENTITY_DOCUMENT_LOOKUP_KEY = 'test-only-independent-identity-lookup-key';
process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  canonicalType,
  maskIdentityDocument,
  validateCpf,
  validateDni,
  validateIdentityDocument,
  validateNie,
  validatePassport,
  validateRun,
} = require('../src/modules/markets/identity-adapters');
const { protectIdentityValue } = require('../src/modules/markets/identity-protection');
const {
  addProfessionalServiceArea,
  assertCurrentSchema,
  createAddress,
  createIdentityDocument,
  digestGeographyRecords,
  getRegistrationSchema,
  reviewIdentityPolicy,
  resolveMarketPolicy,
  schemaVersionFor,
  validateDivisionHierarchy,
} = require('../src/modules/markets/market.service');
const { validateManifest } = require('../src/modules/markets/geography-import.service');
const { addressBody } = require('../src/validators/markets.validators');
const { redactText, sanitizeTelemetry } = require('../src/modules/observability/redaction');

const policy = {
  id: 'policy-es-1', version: 1, status: 'ACTIVE', reviewStatus: 'APPROVED',
  effectiveAt: new Date('2026-01-01T00:00:00Z'), retiredAt: null,
  schemaDigest: 'a'.repeat(64),
  identityPolicy: { selection: 'ONE_OF', documentTypes: [{ type: 'DNI', labelKey: 'identity.dni', required: true }, { type: 'NIE', labelKey: 'identity.nie', required: true }, { type: 'PASSPORT', labelKey: 'identity.passport', required: true }] },
  geographyPolicy: { source: 'INE_ES', levels: [{ type: 'AUTONOMOUS_COMMUNITY', level: 1 }, { type: 'PROVINCE', level: 2 }, { type: 'MUNICIPALITY', level: 3 }] },
  addressPolicy: { coordinates: 'OPTIONAL', fields: [{ key: 'line1', required: true, maxLength: 200 }, { key: 'postalCode', required: true, maxLength: 16 }] },
};
const activeMarket = { id: 'market-es', code: 'ES', countryId: 'country-es', status: 'ACTIVE', currencyCode: 'EUR', defaultLocale: 'es-ES', supportedLocales: ['es-ES', 'en'], capabilities: { registration: true }, currentPolicyVersion: 1, country: { id: 'country-es', isoAlpha2: 'ES' }, policies: [policy] };

test('identity adapters normalize and validate ES, BR, and CL formats without implying verification', () => {
  assert.deepEqual(validateDni('12.345.678-z'), { valid: true, normalized: '12345678Z', category: 'VALID_FORMAT', type: 'DNI' });
  assert.equal(validateDni('12345678A').category, 'INVALID_CHECKSUM');
  assert.equal(validateNie('X-1234567-L').valid, true);
  assert.equal(validateCpf('529.982.247-25').valid, true);
  assert.equal(validateCpf('111.111.111-11').valid, false);
  assert.equal(validateRun('12.345.678-5').valid, true);
  assert.equal(validateRun('12.345.678-K').category, 'INVALID_CHECKSUM');
  assert.equal(validatePassport('abc 123456').valid, true);
  assert.equal(validateIdentityDocument({ countryCode: 'BR', type: 'DNI', value: '12345678Z' }).category, 'UNSUPPORTED_TYPE');
  assert.equal(canonicalType('CL', 'RUT'), 'RUN');
  assert.equal(validateIdentityDocument({ countryCode: 'CL', type: 'RUT', value: '12.345.678-5' }).type, 'RUN');
});

test('identity protection stores randomized ciphertext, stable keyed lookup, and mask only', () => {
  const first = protectIdentityValue({ normalized: '12345678Z', countryCode: 'ES', typeKey: 'DNI' });
  const second = protectIdentityValue({ normalized: '12345678Z', countryCode: 'ES', typeKey: 'DNI' });
  assert.notEqual(first.encryptedValue, second.encryptedValue);
  assert.equal(first.lookupDigest, second.lookupDigest);
  assert.equal(first.lookupDigest.length, 64);
  assert.equal(first.maskedValue, maskIdentityDocument('12345678Z'));
  assert.equal(JSON.stringify(first).includes('12345678Z'), false);
});

test('market policy resolution distinguishes active market from country and fails closed', async () => {
  const client = { market: { findUnique: async () => activeMarket } };
  const resolved = await resolveMarketPolicy({ marketCode: 'es', client, now: new Date('2026-09-09T00:00:00Z') });
  assert.equal(resolved.market.country.isoAlpha2, 'ES');
  await assert.rejects(() => resolveMarketPolicy({ marketCode: 'ES', client: { market: { findUnique: async () => ({ ...activeMarket, status: 'DISABLED' }) } } }), (error) => error.code === 'MARKET_UNAVAILABLE');
  await assert.rejects(() => resolveMarketPolicy({ marketCode: 'ES', client: { market: { findUnique: async () => ({ ...activeMarket, policies: [{ ...policy, reviewStatus: 'PENDING' }] }) } } }), (error) => error.code === 'MARKET_POLICY_UNAVAILABLE');
});

test('registration schema is server-derived and stale versions are rejected', async () => {
  const schema = await getRegistrationSchema({ marketCode: 'ES', actorType: 'CLIENT', locale: 'en', client: { market: { findUnique: async () => activeMarket } } });
  assert.equal(schema.schemaVersion, schemaVersionFor(activeMarket, policy));
  assert.equal(schema.identityDocuments[0].type, 'DNI');
  assert.equal(schema.geography.levels[2].type, 'MUNICIPALITY');
  assert.equal(JSON.stringify(schema).includes('regex'), false);
  assert.throws(() => assertCurrentSchema(activeMarket, policy, 'stale'), (error) => error.code === 'REGISTRATION_SCHEMA_STALE');
});

test('ES, BR, and CL registration schemas are policy-derived without client country branching', async () => {
  const fixtures = [
    { code: 'ES', currencyCode: 'EUR', locale: 'es-ES', identity: 'DNI', levels: ['AUTONOMOUS_COMMUNITY', 'PROVINCE', 'MUNICIPALITY'] },
    { code: 'BR', currencyCode: 'BRL', locale: 'pt-BR', identity: 'CPF', levels: ['FEDERATIVE_UNIT', 'MUNICIPALITY'] },
    { code: 'CL', currencyCode: 'CLP', locale: 'es-CL', identity: 'RUN', levels: ['REGION', 'PROVINCE', 'COMMUNE'] },
  ];
  for (const fixture of fixtures) {
    const fixturePolicy = { ...policy, identityPolicy: { selection: 'ONE_OF', documentTypes: [{ type: fixture.identity, labelKey: `identity.${fixture.identity.toLowerCase()}`, required: true }] }, geographyPolicy: { source: `SOURCE_${fixture.code}`, levels: fixture.levels.map((type, index) => ({ type, level: index + 1 })) } };
    const market = { ...activeMarket, id: `market-${fixture.code}`, code: fixture.code, currencyCode: fixture.currencyCode, defaultLocale: fixture.locale, supportedLocales: [fixture.locale], country: { id: `country-${fixture.code}`, isoAlpha2: fixture.code }, policies: [fixturePolicy] };
    const schema = await getRegistrationSchema({ marketCode: fixture.code, actorType: 'PROFESSIONAL', client: { market: { findUnique: async () => market } } });
    assert.equal(schema.identityDocuments[0].type, fixture.identity);
    assert.deepEqual(schema.geography.levels.map((level) => level.type), fixture.levels);
    assert.equal(schema.market.currencyCode, fixture.currencyCode);
  }
});

test('hierarchy validation rejects missing, cross-country, disabled, and invalid parents', async () => {
  const divisions = [
    { id: '1', countryId: 'country-es', parentId: null, level: 1, typeKey: 'AUTONOMOUS_COMMUNITY', lifecycle: 'ACTIVE' },
    { id: '2', countryId: 'country-es', parentId: '1', level: 2, typeKey: 'PROVINCE', lifecycle: 'ACTIVE' },
    { id: '3', countryId: 'country-es', parentId: '2', level: 3, typeKey: 'MUNICIPALITY', lifecycle: 'ACTIVE' },
  ];
  const valid = await validateDivisionHierarchy({ divisionIds: ['1', '2', '3'], market: activeMarket, policy, client: { administrativeDivision: { findMany: async () => divisions } } });
  assert.equal(valid[2].id, '3');
  await assert.rejects(() => validateDivisionHierarchy({ divisionIds: ['1', '2', '3'], market: activeMarket, policy, client: { administrativeDivision: { findMany: async () => divisions.map((division) => division.id === '3' ? { ...division, parentId: '1' } : division) } } }), (error) => error.code === 'DIVISION_HIERARCHY_INVALID');
  await assert.rejects(() => validateDivisionHierarchy({ divisionIds: ['1', '2', '3'], market: activeMarket, policy, client: { administrativeDivision: { findMany: async () => divisions.map((division) => division.id === '2' ? { ...division, countryId: 'country-br' } : division) } } }), (error) => error.code === 'DIVISION_HIERARCHY_INVALID');
});

test('official geography manifest is deterministic and parent ordered', () => {
  const records = [
    { code: '01', name: 'Root', type: 'AUTONOMOUS_COMMUNITY', level: 1 },
    { code: '0101', name: 'Province', type: 'PROVINCE', level: 2, parentCode: '01' },
    { code: '01001', name: 'Municipality', type: 'MUNICIPALITY', level: 3, parentCode: '0101' },
  ];
  const sourceUrl = 'https://www.ine.es/official.csv';
  const input = { countryCode: 'ES', sourceKey: 'INE_ES', sourceUrl, sourceVersion: '2026-01-01', referenceDate: new Date('2026-01-01'), retrievedAt: new Date('2026-09-09'), checksumSha256: digestGeographyRecords(records), parserVersion: 'test-v1', completeSnapshot: true, sourceArtifacts: [{ url: sourceUrl, mediaType: 'text/csv', sha256: 'b'.repeat(64) }], records };
  assert.equal(validateManifest(input).length, 3);
  assert.equal(digestGeographyRecords([...records].reverse()), input.checksumSha256);
  assert.throws(() => validateManifest({ ...input, sourceUrl: 'https://example.com/data.csv' }), (error) => error.code === 'GEOGRAPHY_SOURCE_INVALID');
  assert.throws(() => validateManifest({ ...input, checksumSha256: '0'.repeat(64) }), (error) => error.code === 'GEOGRAPHY_CHECKSUM_MISMATCH');
});

test('committed official manifests cover the required ES, BR, and CL hierarchies', () => {
  const expected = {
    ES: { count: 8203, types: ['AUTONOMOUS_COMMUNITY', 'PROVINCE', 'MUNICIPALITY'] },
    BR: { count: 5598, types: ['FEDERATIVE_UNIT', 'MUNICIPALITY'] },
    CL: { count: 418, types: ['REGION', 'PROVINCE', 'COMMUNE'] },
  };
  for (const fileName of ['es.json', 'br.json', 'cl.json']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'prisma', 'geography-data', fileName), 'utf8'));
    assert.equal(manifest.records.length, expected[manifest.countryCode].count);
    assert.deepEqual([...new Set(manifest.records.sort((a, b) => a.level - b.level).map((record) => record.type))], expected[manifest.countryCode].types);
    assert.equal(validateManifest({ ...manifest, referenceDate: new Date(manifest.referenceDate), retrievedAt: new Date(manifest.retrievedAt) }).length, expected[manifest.countryCode].count);
  }
});

test('identity policy review requires an independent operator', async () => {
  const draft = { ...policy, status: 'DRAFT', reviewStatus: 'PENDING', createdBy: 'operator-1', market: { code: 'ES' } };
  await assert.rejects(
    () => reviewIdentityPolicy({ policyId: draft.id, decision: 'APPROVED', reviewReference: 'legal-review-2026', reason: 'Independent legal review completed.', actorId: 'operator-1', req: {}, client: { marketPolicyVersion: { findUnique: async () => draft } } }),
    (error) => error.code === 'IDENTITY_POLICY_FOUR_EYES_REQUIRED',
  );
});

test('identity, address, and service-area writes reject cross-market subjects', async () => {
  const client = { market: { findUnique: async () => activeMarket } };
  await assert.rejects(() => createIdentityDocument({ userId: 'user-1', userMarketId: 'market-br', marketCode: 'ES', schemaVersion: schemaVersionFor(activeMarket, policy), type: 'DNI', value: '12345678Z', req: {}, client }), (error) => error.code === 'IDENTITY_MARKET_MISMATCH');
  await assert.rejects(() => createAddress({ userId: 'user-1', userMarketId: 'market-br', input: { marketCode: 'ES', schemaVersion: schemaVersionFor(activeMarket, policy), purpose: 'CLIENT_CONTACT', line1: 'Street', divisionIds: ['division-1'] }, req: {}, client }), (error) => error.code === 'ADDRESS_MARKET_MISMATCH');
  await assert.rejects(() => addProfessionalServiceArea({ user: { marketId: 'market-br', professionalProfile: { id: 'professional-1' } }, input: { marketCode: 'ES', schemaVersion: schemaVersionFor(activeMarket, policy), divisionId: 'division-1' }, req: {}, client }), (error) => error.code === 'SERVICE_AREA_MARKET_MISMATCH');
});

test('duplicate identities fail with a generic conflict and never expose the document', async () => {
  const client = {
    market: { findUnique: async () => activeMarket },
    identityDocument: { create: async () => { throw Object.assign(new Error('unique constraint'), { code: 'P2002' }); } },
  };
  await assert.rejects(
    () => createIdentityDocument({ userId: 'user-1', userMarketId: activeMarket.id, marketCode: 'ES', schemaVersion: schemaVersionFor(activeMarket, policy), type: 'DNI', value: '12345678Z', req: {}, client }),
    (error) => error.code === 'IDENTITY_DOCUMENT_CONFLICT' && !error.message.includes('12345678Z'),
  );
});

test('F8.5 migration is additive, indexed, and default-deny for every new table', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '202609090001_markets_identity_geography', 'migration.sql'), 'utf8');
  const tables = ['Country', 'Market', 'MarketPolicyVersion', 'GeographyDatasetImport', 'AdministrativeDivision', 'AdministrativeDivisionChange', 'Address', 'AddressAdministrativeDivision', 'ProfessionalServiceArea', 'IdentityDocument', 'ReferralProgramVersionMarket'];
  for (const table of tables) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`));
  }
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|TYPE)|TRUNCATE/i);
  assert.match(sql, /IdentityDocument_active_identity_key/);
  assert.match(sql, /AdministrativeDivision_parent_country_fkey/);
});

test('address contract rejects unsupported fields and partial coordinates', () => {
  const base = { marketCode: 'ES', schemaVersion: 'market-policy:ES:1:aaaaaaaaaaaa', purpose: 'CLIENT_CONTACT', line1: 'Main street', divisionIds: ['10000000-0000-4000-8000-000000000001'] };
  assert.equal(addressBody.parse(base).purpose, 'CLIENT_CONTACT');
  assert.equal(addressBody.safeParse({ ...base, latitude: 10 }).success, false);
  assert.equal(addressBody.safeParse({ ...base, arbitraryCountryRule: true }).success, false);
});

test('logs and telemetry redact identity values and sensitive keys', () => {
  const text = redactText('dni 12345678Z rut 12.345.678-5 cpf 52998224725');
  assert.equal(text.includes('12345678Z'), false);
  assert.equal(text.includes('12.345.678-5'), false);
  assert.equal(text.includes('52998224725'), false);
  assert.deepEqual(sanitizeTelemetry({ marketCode: 'ES', identityDocument: '12345678Z', passport: 'ABC123456', address: 'secret', reason: 'INVALID_CHECKSUM' }), { marketCode: 'ES', reason: 'INVALID_CHECKSUM' });
});
