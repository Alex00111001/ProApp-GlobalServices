const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { writeAuditLog } = require('../audit/audit.service');
const { protectIdentityValue } = require('./identity-protection');
const { canonicalType, validateIdentityDocument } = require('./identity-adapters');
const { observeMarketOperation } = require('../observability/metrics');
const { canonicalDigest } = require('../privacy/privacy-utils');
const { digestGeographyRecords } = require('./geography-manifest');

const fail = (message, code, statusCode) => {
  throw Object.assign(new Error(message), { code, statusCode });
};

const schemaVersionFor = (market, policy) => `market-policy:${market.code}:${policy.version}:${policy.schemaDigest.slice(0, 12)}`;
const policyDigest = (policy) => canonicalDigest({
  identityPolicy: policy.identityPolicy,
  geographyPolicy: policy.geographyPolicy,
  addressPolicy: policy.addressPolicy,
  localePolicy: policy.localePolicy,
  currencyPolicy: policy.currencyPolicy,
  legalPolicyReferences: policy.legalPolicyReferences,
  taxPolicyReference: policy.taxPolicyReference || null,
  paymentPolicyReference: policy.paymentPolicyReference || null,
});

const resolveMarketPolicy = async ({ marketCode, client = prisma, requireActive = true, now = new Date() }) => {
  if (!env.marketsIdentityGeographyEnabled) {
    observeMarketOperation({ operation: 'market_resolution', market: marketCode, outcome: 'rejected', reason: 'capability_disabled' });
    fail('Markets capability is unavailable.', 'MARKETS_CAPABILITY_DISABLED', 503);
  }
  const code = String(marketCode || '').toUpperCase();
  const market = await client.market.findUnique({
    where: { code },
    include: {
      country: true,
      policies: {
        orderBy: { version: 'desc' },
      },
    },
  });
  if (!market) { observeMarketOperation({ operation: 'market_resolution', market: code, outcome: 'rejected', reason: 'unknown' }); fail('Market is unavailable.', 'MARKET_UNAVAILABLE', 404); }
  if (requireActive && market.status !== 'ACTIVE') { observeMarketOperation({ operation: 'market_resolution', market: code, outcome: 'rejected', reason: 'inactive' }); fail('Market is unavailable.', 'MARKET_UNAVAILABLE', 404); }
  const policy = market.policies.find((candidate) =>
    candidate.version === market.currentPolicyVersion
    && candidate.status === 'ACTIVE'
    && candidate.reviewStatus === 'APPROVED'
    && candidate.effectiveAt
    && candidate.effectiveAt <= now
    && (!candidate.retiredAt || candidate.retiredAt > now));
  if (!policy && requireActive) { observeMarketOperation({ operation: 'policy_resolution', market: code, outcome: 'rejected', reason: 'unavailable' }); fail('Market policy is unavailable.', 'MARKET_POLICY_UNAVAILABLE', 503); }
  observeMarketOperation({ operation: 'market_resolution', market: code, outcome: 'accepted' });
  return { market, policy: policy || market.policies.find((candidate) => candidate.version === market.currentPolicyVersion) || null };
};

const publicMarket = (market) => ({
  code: market.code,
  countryCode: market.country.isoAlpha2.trim(),
  status: market.status,
  currencyCode: market.currencyCode.trim(),
  defaultLocale: market.defaultLocale,
  supportedLocales: market.supportedLocales,
  capabilities: market.capabilities,
});

const listActiveMarkets = async (client = prisma) => {
  if (!env.marketsIdentityGeographyEnabled) return { items: [] };
  const markets = await client.market.findMany({
    where: { status: 'ACTIVE' },
    include: { country: true },
    orderBy: { code: 'asc' },
    take: 50,
  });
  return { items: markets.map(publicMarket) };
};

const listActiveCountries = async (client = prisma) => {
  if (!env.marketsIdentityGeographyEnabled) return { items: [] };
  const countries = await client.country.findMany({
    where: { lifecycle: 'ACTIVE', markets: { some: { status: 'ACTIVE' } } },
    select: { isoAlpha2: true, isoAlpha3: true, isoNumeric: true, canonicalName: true, markets: { where: { status: 'ACTIVE' }, select: { code: true }, orderBy: { code: 'asc' } } },
    orderBy: { isoAlpha2: 'asc' },
    take: 50,
  });
  return { items: countries.map((country) => ({ ...country, isoAlpha2: country.isoAlpha2.trim(), isoAlpha3: country.isoAlpha3.trim(), isoNumeric: country.isoNumeric.trim() })) };
};

const resolveMarketReference = async ({ marketCode, client = prisma, requireActive = false }) => {
  if (!env.marketsIdentityGeographyEnabled || !marketCode) return null;
  const code = String(marketCode).trim().toUpperCase();
  const market = await client.market.findUnique({ where: { code }, select: { id: true, code: true, countryId: true, status: true, currencyCode: true } });
  if (!market || (requireActive && market.status !== 'ACTIVE')) fail('Market reference is unavailable.', 'MARKET_REFERENCE_INVALID', 400);
  return market;
};

const getRegistrationSchema = async ({ marketCode, actorType, locale, client = prisma }) => {
  const { market, policy } = await resolveMarketPolicy({ marketCode, client });
  const selectedLocale = locale && market.supportedLocales.includes(locale) ? locale : market.defaultLocale;
  if (locale && selectedLocale !== locale) fail('Locale is not supported by this market.', 'MARKET_LOCALE_UNSUPPORTED', 400);
  const identityPolicy = policy.identityPolicy;
  const geographyPolicy = policy.geographyPolicy;
  const addressPolicy = policy.addressPolicy;
  observeMarketOperation({ operation: 'registration_schema', market: market.code, outcome: 'served', reason: `v${policy.version}` });
  return {
    market: publicMarket(market),
    actorType,
    policyVersion: policy.version,
    schemaVersion: schemaVersionFor(market, policy),
    locale: selectedLocale,
    identityDocuments: identityPolicy.documentTypes.map((document) => ({
      type: document.type,
      aliases: document.aliases || [],
      labelKey: document.labelKey,
      required: document.required === true,
      constraints: { maxLength: 64 },
    })),
    identitySelection: identityPolicy.selection,
    geography: { levels: geographyPolicy.levels.map((level) => ({ ...level, required: true })) },
    address: { fields: addressPolicy.fields, coordinates: addressPolicy.coordinates },
    capabilities: market.capabilities,
  };
};

const assertCurrentSchema = (market, policy, submitted) => {
  if (submitted !== schemaVersionFor(market, policy)) fail('Registration schema is stale.', 'REGISTRATION_SCHEMA_STALE', 409);
};

const assertAddressPolicyInput = (input, policy) => {
  const fields = Object.fromEntries(policy.addressPolicy.fields.map((field) => [field.key, field]));
  for (const field of policy.addressPolicy.fields) if (field.required && (input[field.key] === undefined || input[field.key] === null || input[field.key] === '')) fail('Address is incomplete.', 'ADDRESS_REQUIRED_FIELD_MISSING', 400);
  for (const supplied of ['line1', 'line2', 'locality', 'postalCode']) if (input[supplied] && !fields[supplied]) fail('Address contains an unsupported field.', 'ADDRESS_FIELD_UNSUPPORTED', 400);
  const hasCoordinates = input.latitude !== undefined || input.longitude !== undefined;
  if (policy.addressPolicy.coordinates === 'PROHIBITED' && hasCoordinates) fail('Address coordinates are unsupported.', 'ADDRESS_COORDINATES_UNSUPPORTED', 400);
  if (policy.addressPolicy.coordinates === 'REQUIRED' && !hasCoordinates) fail('Address coordinates are required.', 'ADDRESS_COORDINATES_REQUIRED', 400);
};

const listDivisions = async ({ marketCode, parentId, type, page, limit, client = prisma }) => {
  const { market } = await resolveMarketPolicy({ marketCode, client });
  if (parentId) {
    const parent = await client.administrativeDivision.findUnique({ where: { id: parentId }, select: { countryId: true, lifecycle: true } });
    if (!parent || parent.countryId !== market.countryId || parent.lifecycle !== 'ACTIVE') fail('Parent division is unavailable.', 'DIVISION_PARENT_INVALID', 400);
  }
  const where = { countryId: market.countryId, lifecycle: 'ACTIVE', parentId: parentId || null, ...(type ? { typeKey: type } : {}) };
  const [items, total] = await Promise.all([
    client.administrativeDivision.findMany({ where, orderBy: [{ canonicalName: 'asc' }, { canonicalCode: 'asc' }], skip: (page - 1) * limit, take: limit, select: { id: true, parentId: true, level: true, typeKey: true, canonicalCode: true, canonicalName: true, displayNames: true, sourceVersion: true } }),
    client.administrativeDivision.count({ where }),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const validateDivisionHierarchy = async ({ divisionIds, market, policy, client = prisma }) => {
  const divisions = await client.administrativeDivision.findMany({ where: { id: { in: divisionIds } } });
  if (divisions.length !== divisionIds.length) fail('Administrative hierarchy is invalid.', 'DIVISION_HIERARCHY_INVALID', 400);
  const sorted = [...divisions].sort((a, b) => a.level - b.level);
  const expected = policy.geographyPolicy.levels;
  if (sorted.length !== expected.length) fail('Administrative hierarchy is incomplete.', 'DIVISION_HIERARCHY_INVALID', 400);
  for (let index = 0; index < sorted.length; index += 1) {
    const division = sorted[index];
    if (division.countryId !== market.countryId || division.lifecycle !== 'ACTIVE' || division.level !== expected[index].level || division.typeKey !== expected[index].type) {
      fail('Administrative hierarchy is invalid.', 'DIVISION_HIERARCHY_INVALID', 400);
    }
    if (index > 0 && division.parentId !== sorted[index - 1].id) fail('Administrative hierarchy is invalid.', 'DIVISION_HIERARCHY_INVALID', 400);
  }
  return sorted;
};

const createIdentityDocument = async ({ userId, userMarketId, marketCode, schemaVersion, type, value, req, client = prisma }) => {
  const { market, policy } = await resolveMarketPolicy({ marketCode, client });
  if (!userMarketId || userMarketId !== market.id) fail('Identity document market does not match the account.', 'IDENTITY_MARKET_MISMATCH', 403);
  assertCurrentSchema(market, policy, schemaVersion);
  const resolvedType = canonicalType(market.country.isoAlpha2.trim(), type);
  const allowed = policy.identityPolicy.documentTypes.some((document) => document.type === resolvedType || document.aliases?.includes(type));
  if (!allowed) fail('Identity document type is not supported.', 'IDENTITY_TYPE_UNSUPPORTED', 400);
  const validation = validateIdentityDocument({ countryCode: market.country.isoAlpha2.trim(), type, value });
  if (!validation.valid) { observeMarketOperation({ operation: 'identity_validation', market: market.code, outcome: 'rejected', reason: validation.category }); fail('Identity document format is invalid.', validation.category === 'INVALID_CHECKSUM' ? 'IDENTITY_CHECKSUM_INVALID' : 'IDENTITY_FORMAT_INVALID', 400); }
  const protectedValue = protectIdentityValue({ normalized: validation.normalized, countryCode: validation.countryCode, typeKey: validation.type });
  try {
    const document = await client.identityDocument.create({
      data: { userId, marketId: market.id, countryId: market.countryId, typeKey: validation.type, ...protectedValue, formatStatus: 'VALID' },
      select: { id: true, typeKey: true, maskedValue: true, formatStatus: true, verificationStatus: true, lifecycle: true, createdAt: true },
    });
    await writeAuditLog({ req, action: 'IDENTITY_DOCUMENT_CREATED', resourceType: 'IDENTITY_DOCUMENT', resourceId: document.id, metadata: { marketCode: market.code, typeKey: validation.type, validationCategory: validation.category } });
    observeMarketOperation({ operation: 'identity_validation', market: market.code, outcome: 'accepted', reason: validation.category });
    return document;
  } catch (error) {
    if (error.code === 'P2002') fail('Identity document could not be accepted.', 'IDENTITY_DOCUMENT_CONFLICT', 409);
    throw error;
  }
};

const createAddress = async ({ userId, userMarketId, input, req, client = prisma }) => {
  const { market, policy } = await resolveMarketPolicy({ marketCode: input.marketCode, client });
  if (!userMarketId || userMarketId !== market.id) fail('Address market does not match the account.', 'ADDRESS_MARKET_MISMATCH', 403);
  assertCurrentSchema(market, policy, input.schemaVersion);
  assertAddressPolicyInput(input, policy);
  const divisions = await validateDivisionHierarchy({ divisionIds: input.divisionIds, market, policy, client });
  const address = await client.$transaction(async (tx) => {
    if (input.isPrimary) await tx.address.updateMany({ where: { userId, purpose: input.purpose, isPrimary: true }, data: { isPrimary: false } });
    return tx.address.create({
      data: {
        userId, marketId: market.id, countryId: market.countryId, purpose: input.purpose,
        line1: input.line1, line2: input.line2, locality: input.locality, postalCode: input.postalCode,
        latitude: input.latitude, longitude: input.longitude, validationStatus: 'FORMAT_VALID', isPrimary: input.isPrimary,
        divisions: { create: divisions.map((division) => ({ divisionId: division.id, level: division.level })) },
      },
      include: { divisions: { include: { division: { select: { id: true, canonicalCode: true, canonicalName: true, typeKey: true, level: true } } } } },
    });
  });
  await writeAuditLog({ req, action: 'ADDRESS_CREATED', resourceType: 'ADDRESS', resourceId: address.id, metadata: { marketCode: market.code, purpose: input.purpose, divisionCount: divisions.length } });
  return address;
};

const addProfessionalServiceArea = async ({ user, input, req, client = prisma }) => {
  if (!user.professionalProfile) fail('Professional account required.', 'PROFESSIONAL_REQUIRED', 403);
  const { market, policy } = await resolveMarketPolicy({ marketCode: input.marketCode, client });
  if (!user.marketId || user.marketId !== market.id) fail('Service area market does not match the account.', 'SERVICE_AREA_MARKET_MISMATCH', 403);
  assertCurrentSchema(market, policy, input.schemaVersion);
  const division = await client.administrativeDivision.findUnique({ where: { id: input.divisionId } });
  if (!division || division.countryId !== market.countryId || division.lifecycle !== 'ACTIVE') fail('Service area is invalid.', 'SERVICE_AREA_INVALID', 400);
  if (!policy.geographyPolicy.levels.some((level) => level.level === division.level && level.type === division.typeKey)) fail('Service area is invalid.', 'SERVICE_AREA_INVALID', 400);
  try {
    const area = await client.professionalServiceArea.create({ data: { professionalId: user.professionalProfile.id, marketId: market.id, divisionId: division.id } });
    await writeAuditLog({ req, action: 'PROFESSIONAL_SERVICE_AREA_CREATED', resourceType: 'PROFESSIONAL_SERVICE_AREA', resourceId: area.id, metadata: { marketCode: market.code, divisionType: division.typeKey } });
    return area;
  } catch (error) {
    if (error.code === 'P2002') fail('Service area already exists.', 'SERVICE_AREA_DUPLICATE', 409);
    throw error;
  }
};

const listProfessionalServiceAreas = async ({ user, client = prisma }) => {
  if (!user.professionalProfile) fail('Professional account required.', 'PROFESSIONAL_REQUIRED', 403);
  return client.professionalServiceArea.findMany({
    where: { professionalId: user.professionalProfile.id, lifecycle: 'ACTIVE' },
    include: { market: { select: { code: true } }, division: { select: { id: true, canonicalCode: true, canonicalName: true, typeKey: true, level: true } } },
    orderBy: { createdAt: 'asc' },
  });
};

const listIdentityDocuments = ({ userId, client = prisma }) => client.identityDocument.findMany({
  where: { userId, lifecycle: 'ACTIVE' },
  select: { id: true, typeKey: true, maskedValue: true, formatStatus: true, verificationStatus: true, verificationMethod: true, verifiedAt: true, lifecycle: true, createdAt: true, market: { select: { code: true } }, country: { select: { isoAlpha2: true } } },
  orderBy: { createdAt: 'asc' },
});

const listAdminIdentityDocuments = async ({ userId, page, limit, req, client = prisma }) => {
  const where = { userId, lifecycle: 'ACTIVE' };
  const [items, total] = await Promise.all([
    client.identityDocument.findMany({ where, select: { id: true, typeKey: true, maskedValue: true, formatStatus: true, verificationStatus: true, verificationMethod: true, verifiedAt: true, lifecycle: true, createdAt: true, market: { select: { code: true } }, country: { select: { isoAlpha2: true } } }, orderBy: { createdAt: 'asc' }, skip: (page - 1) * limit, take: limit }),
    client.identityDocument.count({ where }),
  ]);
  await writeAuditLog({ req, action: 'IDENTITY_DOCUMENTS_MASKED_READ', resourceType: 'USER', resourceId: userId, metadata: { resultCount: items.length } });
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) } };
};

const listAddresses = ({ userId, client = prisma }) => client.address.findMany({
  where: { userId },
  select: { id: true, purpose: true, locality: true, postalCode: true, validationStatus: true, isPrimary: true, createdAt: true, market: { select: { code: true } }, country: { select: { isoAlpha2: true } }, divisions: { select: { level: true, division: { select: { id: true, typeKey: true, canonicalCode: true, canonicalName: true } } }, orderBy: { level: 'asc' } } },
  orderBy: [{ purpose: 'asc' }, { isPrimary: 'desc' }, { createdAt: 'asc' }],
});

const listAdminMarkets = async ({ page, limit, status, client = prisma }) => {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    client.market.findMany({ where, include: { country: true, policies: { orderBy: { version: 'desc' }, take: 1 }, _count: { select: { serviceAreas: true, users: true } } }, orderBy: { code: 'asc' }, skip: (page - 1) * limit, take: limit }),
    client.market.count({ where }),
  ]);
  return { items: items.map((market) => ({ ...publicMarket(market), currentPolicyVersion: market.currentPolicyVersion, policy: market.policies[0] || null, counts: market._count, effectiveAt: market.effectiveAt, updatedAt: market.updatedAt })), pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) } };
};

const listAdminDivisions = async ({ countryCode, parentId, type, lifecycle, page, limit, client = prisma }) => {
  const country = await client.country.findUnique({ where: { isoAlpha2: countryCode } });
  if (!country) fail('Country is unavailable.', 'COUNTRY_UNAVAILABLE', 404);
  const where = { countryId: country.id, ...(parentId ? { parentId } : {}), ...(type ? { typeKey: type } : {}), ...(lifecycle ? { lifecycle } : {}) };
  const [items, total] = await Promise.all([
    client.administrativeDivision.findMany({ where, select: { id: true, parentId: true, level: true, typeKey: true, canonicalCode: true, canonicalName: true, displayNames: true, lifecycle: true, sourceKey: true, sourceVersion: true, deprecatedAt: true }, orderBy: [{ level: 'asc' }, { canonicalCode: 'asc' }], skip: (page - 1) * limit, take: limit }),
    client.administrativeDivision.count({ where }),
  ]);
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) } };
};

const listIdentityPolicies = async ({ marketCode, status, reviewStatus, page, limit, client = prisma }) => {
  const where = { ...(marketCode ? { market: { code: marketCode } } : {}), ...(status ? { status } : {}), ...(reviewStatus ? { reviewStatus } : {}) };
  const [items, total] = await Promise.all([
    client.marketPolicyVersion.findMany({ where, include: { market: { select: { code: true, status: true } } }, orderBy: [{ marketId: 'asc' }, { version: 'desc' }], skip: (page - 1) * limit, take: limit }),
    client.marketPolicyVersion.count({ where }),
  ]);
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) } };
};

const reviewIdentityPolicy = async ({ policyId, decision, reviewReference, reason, actorId, req, client = prisma }) => {
  const policy = await client.marketPolicyVersion.findUnique({ where: { id: policyId }, include: { market: true } });
  if (!policy) fail('Identity policy is unavailable.', 'IDENTITY_POLICY_UNAVAILABLE', 404);
  if (policy.status !== 'DRAFT' || policy.reviewStatus !== 'PENDING') fail('Identity policy review transition is invalid.', 'IDENTITY_POLICY_REVIEW_INVALID', 409);
  if (policy.createdBy && policy.createdBy === actorId) fail('A second operator must review this policy.', 'IDENTITY_POLICY_FOUR_EYES_REQUIRED', 409);
  if (policy.schemaDigest !== policyDigest(policy)) fail('Identity policy integrity check failed.', 'IDENTITY_POLICY_DIGEST_INVALID', 409);
  const updated = await client.marketPolicyVersion.update({ where: { id: policy.id }, data: { reviewStatus: decision, reviewReference, reviewedBy: actorId, reviewedAt: new Date() } });
  await writeAuditLog({ req, action: 'IDENTITY_POLICY_REVIEWED', resourceType: 'MARKET_POLICY_VERSION', resourceId: policy.id, reason, before: { reviewStatus: policy.reviewStatus }, after: { reviewStatus: decision, reviewReference }, metadata: { marketCode: policy.market.code, version: policy.version } });
  return updated;
};

const setIdentityPolicyStatus = async ({ policyId, status, reason, actorId, req, client = prisma }) => {
  const policy = await client.marketPolicyVersion.findUnique({ where: { id: policyId }, include: { market: true } });
  if (!policy) fail('Identity policy is unavailable.', 'IDENTITY_POLICY_UNAVAILABLE', 404);
  if (status === 'ACTIVE') {
    if (policy.status !== 'DRAFT' || policy.reviewStatus !== 'APPROVED' || policy.schemaDigest !== policyDigest(policy)) fail('Identity policy is not activation-ready.', 'IDENTITY_POLICY_NOT_READY', 409);
    const importCount = await client.geographyDatasetImport.count({ where: { countryId: policy.market.countryId, sourceKey: policy.geographyPolicy.source, status: 'COMPLETED' } });
    if (importCount === 0) fail('Official geography import evidence is missing.', 'MARKET_GEOGRAPHY_NOT_READY', 409);
    const updated = await client.$transaction(async (tx) => {
      await tx.marketPolicyVersion.updateMany({ where: { marketId: policy.marketId, status: 'ACTIVE' }, data: { status: 'RETIRED', retiredAt: new Date() } });
      const activated = await tx.marketPolicyVersion.update({ where: { id: policy.id }, data: { status: 'ACTIVE', effectiveAt: new Date(), retiredAt: null } });
      await tx.market.update({ where: { id: policy.marketId }, data: { currentPolicyVersion: policy.version } });
      return activated;
    });
    await writeAuditLog({ req, action: 'IDENTITY_POLICY_STATUS_CHANGED', resourceType: 'MARKET_POLICY_VERSION', resourceId: policy.id, reason, before: { status: policy.status }, after: { status }, metadata: { actorId, marketCode: policy.market.code, version: policy.version } });
    return updated;
  }
  if (status !== 'RETIRED' || policy.status !== 'ACTIVE' || ['ACTIVE', 'READY'].includes(policy.market.status)) fail('Identity policy retirement requires a non-ready market.', 'IDENTITY_POLICY_RETIREMENT_BLOCKED', 409);
  const updated = await client.marketPolicyVersion.update({ where: { id: policy.id }, data: { status: 'RETIRED', retiredAt: new Date() } });
  await writeAuditLog({ req, action: 'IDENTITY_POLICY_STATUS_CHANGED', resourceType: 'MARKET_POLICY_VERSION', resourceId: policy.id, reason, before: { status: policy.status }, after: { status }, metadata: { actorId, marketCode: policy.market.code, version: policy.version } });
  return updated;
};

const transitions = Object.freeze({
  DISABLED: new Set(['READY']), READY: new Set(['DISABLED', 'ACTIVE']), ACTIVE: new Set(['SUSPENDED']), SUSPENDED: new Set(['ACTIVE', 'RETIRED']), RETIRED: new Set(), DRAFT: new Set(['DISABLED']),
});

const setMarketStatus = async ({ marketCode, status, reason, req, client = prisma }) => {
  const { market, policy } = await resolveMarketPolicy({ marketCode, client, requireActive: false });
  if (!transitions[market.status]?.has(status)) fail('Market lifecycle transition is invalid.', 'MARKET_TRANSITION_INVALID', 409);
  if (['READY', 'ACTIVE'].includes(status)) {
    if (!policy || policy.status !== 'ACTIVE' || policy.reviewStatus !== 'APPROVED') fail('Market policy is not activation-ready.', 'MARKET_POLICY_NOT_READY', 409);
    const geographyCount = await client.administrativeDivision.count({ where: { countryId: market.countryId, lifecycle: 'ACTIVE' } });
    if (geographyCount === 0) fail('Official geography is not ready.', 'MARKET_GEOGRAPHY_NOT_READY', 409);
  }
  const updated = await client.market.update({ where: { id: market.id }, data: { status, effectiveAt: status === 'ACTIVE' ? new Date() : market.effectiveAt, retiredAt: status === 'RETIRED' ? new Date() : null }, include: { country: true } });
  await writeAuditLog({ req, action: 'MARKET_STATUS_CHANGED', resourceType: 'MARKET', resourceId: market.id, reason, before: { status: market.status }, after: { status }, metadata: { marketCode: market.code } });
  return publicMarket(updated);
};

module.exports = {
  addProfessionalServiceArea,
  assertAddressPolicyInput,
  assertCurrentSchema,
  createAddress,
  createIdentityDocument,
  digestGeographyRecords,
  getRegistrationSchema,
  listActiveCountries,
  listActiveMarkets,
  listAddresses,
  listAdminMarkets,
  listAdminDivisions,
  listAdminIdentityDocuments,
  listDivisions,
  listIdentityDocuments,
  listIdentityPolicies,
  listProfessionalServiceAreas,
  publicMarket,
  policyDigest,
  reviewIdentityPolicy,
  resolveMarketPolicy,
  resolveMarketReference,
  schemaVersionFor,
  setMarketStatus,
  setIdentityPolicyStatus,
  validateDivisionHierarchy,
};
