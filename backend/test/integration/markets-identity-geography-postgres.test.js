require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';
process.env.MARKETS_IDENTITY_GEOGRAPHY_ENABLED = 'true';
process.env.IDENTITY_DOCUMENT_LOOKUP_KEY = 'integration-only-independent-identity-lookup-key';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true deliberately.');
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated PostgreSQL test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const prisma = require('../../src/config/prisma');
const app = require('../../src/app');
const { LEGAL_DOCUMENT_VERSION } = require('../../src/config/business');
const { hashPassword } = require('../../src/utils/password');
const { bootstrapRbac } = require('../../src/modules/identity/bootstrap-rbac');
const { createAdminSession } = require('../../src/modules/identity/admin-session.service');
const {
  digestGeographyRecords,
  policyDigest,
  reviewIdentityPolicy,
  setIdentityPolicyStatus,
  setMarketStatus,
} = require('../../src/modules/markets/market.service');
const { importGeography } = require('../../src/modules/markets/geography-import.service');

const suffix = Date.now().toString(36).slice(-8).toUpperCase();
const runId = `f8.5-${suffix.toLowerCase()}`;
const marketCode = `T${suffix}`;
const created = { userIds: [], marketId: null, policyId: null, importId: null, divisionIds: [] };
const reqFor = (userId, action) => ({
  user: { id: userId }, ip: '127.0.0.1', get: () => 'f8.5-integration',
  context: { requestId: `${runId}-${action}`, correlationId: runId, traceId: '5'.repeat(32) },
});

let server;
let apiOrigin;
let baseUrl;

test.before(async () => {
  await bootstrapRbac(prisma);
  const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'ES' } });
  const passwordHash = await hashPassword('integration-password');
  const reviewer = await prisma.user.create({ data: {
    email: `${runId}-reviewer@example.test`, phone: `+346${Date.now().toString().slice(-8)}`,
    passwordHash, firstName: 'Market', lastName: 'Reviewer', role: 'CLIENT', countryCode: 'ES', registrationLocale: 'es',
  } });
  created.userIds.push(reviewer.id);
  const compliance = await prisma.role.findUniqueOrThrow({ where: { key: 'COMPLIANCE_ADMIN' } });
  await prisma.userRoleAssignment.create({ data: { userId: reviewer.id, roleId: compliance.id, status: 'ACTIVE' } });

  const market = await prisma.market.create({ data: {
    code: marketCode, countryId: country.id, status: 'DISABLED', currencyCode: 'EUR', defaultLocale: 'es-ES',
    supportedLocales: ['es-ES', 'en'], timezonePolicy: { default: 'Europe/Madrid' }, capabilities: { registration: true, bookings: true }, currentPolicyVersion: 1,
  } });
  created.marketId = market.id;
  const policyInput = {
    identityPolicy: { selection: 'ONE_OF', documentTypes: [{ type: 'DNI', labelKey: 'identity.dni', required: true }, { type: 'NIE', labelKey: 'identity.nie', required: true }] },
    geographyPolicy: { source: 'INE_ES', levels: [{ type: 'AUTONOMOUS_COMMUNITY', level: 1 }, { type: 'PROVINCE', level: 2 }, { type: 'MUNICIPALITY', level: 3 }] },
    addressPolicy: { coordinates: 'OPTIONAL', fields: [{ key: 'line1', required: true, maxLength: 200 }, { key: 'postalCode', required: true, maxLength: 16 }] },
    localePolicy: { default: 'es-ES', supported: ['es-ES', 'en'] }, currencyPolicy: { currency: 'EUR', authority: 'F3' },
    legalPolicyReferences: [], taxPolicyReference: null, paymentPolicyReference: null,
  };
  const policy = await prisma.marketPolicyVersion.create({ data: { marketId: market.id, version: 1, ...policyInput, schemaDigest: policyDigest(policyInput) } });
  created.policyId = policy.id;

  const records = [
    { code: `${marketCode}:CCAA`, name: 'Test autonomous community', type: 'AUTONOMOUS_COMMUNITY', level: 1, displayNames: { 'es-ES': 'Test autonomous community' } },
    { code: `${marketCode}:PROVINCE`, name: 'Test province', type: 'PROVINCE', level: 2, parentCode: `${marketCode}:CCAA`, displayNames: { 'es-ES': 'Test province' } },
    { code: `${marketCode}:MUNICIPALITY`, name: 'Test municipality', type: 'MUNICIPALITY', level: 3, parentCode: `${marketCode}:PROVINCE`, displayNames: { 'es-ES': 'Test municipality' } },
  ];
  const sourceUrl = 'https://www.ine.es/daco/daco42/codmun/26codmun.xlsx';
  const imported = await importGeography({ input: {
    countryCode: 'ES', sourceKey: 'INE_ES', sourceUrl, sourceVersion: runId, referenceDate: new Date('2026-01-01'), retrievedAt: new Date(),
    checksumSha256: digestGeographyRecords(records), parserVersion: 'integration-v1', completeSnapshot: false,
    sourceArtifacts: [{ url: sourceUrl, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sha256: 'd'.repeat(64) }], records,
  }, req: reqFor(reviewer.id, 'import') });
  created.importId = imported.id;
  created.divisionIds = (await prisma.administrativeDivision.findMany({ where: { lastImportId: imported.id }, orderBy: { level: 'asc' }, select: { id: true } })).map((item) => item.id);

  await reviewIdentityPolicy({ policyId: policy.id, decision: 'APPROVED', reviewReference: 'integration-legal-review', reason: 'Independent integration policy review.', actorId: reviewer.id, req: reqFor(reviewer.id, 'review') });
  await setIdentityPolicyStatus({ policyId: policy.id, status: 'ACTIVE', reason: 'Activate the reviewed integration policy.', actorId: reviewer.id, req: reqFor(reviewer.id, 'policy-active') });
  await setMarketStatus({ marketCode, status: 'READY', reason: 'Integration geography and policy gates passed.', req: reqFor(reviewer.id, 'ready') });
  await setMarketStatus({ marketCode, status: 'ACTIVE', reason: 'Activate the isolated integration market.', req: reqFor(reviewer.id, 'active') });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
  baseUrl = `${apiOrigin}/api/v1`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.professionalServiceArea.deleteMany({ where: { marketId: created.marketId } });
  await prisma.addressAdministrativeDivision.deleteMany({ where: { address: { marketId: created.marketId } } });
  await prisma.address.deleteMany({ where: { marketId: created.marketId } });
  await prisma.identityDocument.deleteMany({ where: { marketId: created.marketId } });
  await prisma.adminSession.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: created.userIds } }, { correlationId: runId }, { resourceId: { in: [created.marketId, created.policyId, created.importId, ...created.userIds].filter(Boolean) } }] } });
  await prisma.clientProfile.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.professionalProfile.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.marketPolicyVersion.deleteMany({ where: { marketId: created.marketId } });
  await prisma.market.deleteMany({ where: { id: created.marketId } });
  await prisma.administrativeDivisionChange.deleteMany({ where: { importId: created.importId } });
  await prisma.administrativeDivision.deleteMany({ where: { id: { in: created.divisionIds } } });
  await prisma.geographyDatasetImport.deleteMany({ where: { id: created.importId } });
  await prisma.$disconnect();
});

test('dynamic public registration creates protected identity and normalized address', async () => {
  const marketResponse = await fetch(`${baseUrl}/markets`);
  assert.equal(marketResponse.status, 200);
  assert.equal((await marketResponse.json()).items.some((item) => item.code === marketCode), true);
  const schemaResponse = await fetch(`${baseUrl}/markets/${marketCode}/registration-schema?actorType=CLIENT&locale=es-ES`);
  assert.equal(schemaResponse.status, 200);
  const schema = await schemaResponse.json();
  assert.equal(schema.geography.levels.length, 3);

  const registration = await fetch(`${apiOrigin}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-correlation-id': runId }, body: JSON.stringify({
    email: `${runId}-client@example.test`, phone: `+347${Date.now().toString().slice(-8)}`, password: 'integration-password', firstName: 'Client', lastName: 'Market', role: 'CLIENT',
    countryCode: 'ES', marketCode, registrationSchemaVersion: schema.schemaVersion, identityDocument: { type: 'DNI', value: '12345678Z' },
    normalizedAddress: { line1: 'Integration street 1', postalCode: '28001', divisionIds: created.divisionIds }, locale: 'es',
    acceptTerms: true, acceptPrivacy: true, marketingConsent: false, termsVersion: LEGAL_DOCUMENT_VERSION, privacyVersion: LEGAL_DOCUMENT_VERSION,
  }) });
  assert.equal(registration.status, 201, JSON.stringify(await registration.clone().json()));
  const body = await registration.json();
  created.userIds.push(body.user.id);
  const document = await prisma.identityDocument.findFirstOrThrow({ where: { userId: body.user.id } });
  assert.equal(document.maskedValue.endsWith('678Z'), true);
  assert.equal(document.encryptedValue.includes('12345678Z'), false);
  assert.equal(document.lookupDigest.length, 64);
  const address = await prisma.address.findFirstOrThrow({ where: { userId: body.user.id }, include: { divisions: true } });
  assert.equal(address.divisions.length, 3);
  assert.equal(address.marketId, created.marketId);
});

test('masked administrative identity reads require dedicated RBAC and create audit evidence', async () => {
  const reviewer = await prisma.user.findUniqueOrThrow({ where: { id: created.userIds[0] } });
  const session = await createAdminSession({ email: reviewer.email, password: 'integration-password', userAgent: 'f8.5-integration', ipAddress: '127.0.0.1' }, prisma);
  const targetUserId = created.userIds[1];
  const response = await fetch(`${baseUrl}/admin/identity/documents?userId=${targetUserId}&page=1&limit=10`, { headers: { authorization: `Bearer ${session.accessToken}`, 'x-correlation-id': runId } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items.length, 1);
  assert.equal(Object.hasOwn(payload.items[0], 'encryptedValue'), false);
  assert.equal(Object.hasOwn(payload.items[0], 'lookupDigest'), false);
  assert.equal(await prisma.auditLog.count({ where: { actorId: reviewer.id, action: 'IDENTITY_DOCUMENTS_MASKED_READ', resourceId: targetUserId } }), 1);
});
