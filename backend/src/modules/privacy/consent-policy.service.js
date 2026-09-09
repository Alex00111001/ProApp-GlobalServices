const prisma = require('../../config/prisma');
const { writeAuditLog } = require('../audit/audit.service');
const { asynchronousEvidence, operationalError } = require('./privacy-utils');
const env = require('../../config/env');
const { resolveMarketReference } = require('../markets/market.service');

const policySelect = Object.freeze({
  id: true,
  key: true,
  purpose: true,
  version: true,
  countryCode: true,
  marketId: true,
  locale: true,
  status: true,
  legalBasis: true,
  enforcementMode: true,
  documentReference: true,
  documentDigest: true,
  effectiveAt: true,
  retiredAt: true,
  retentionDays: true,
  reviewStatus: true,
  reviewReference: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
});

const assertEffective = (policy, at = new Date()) => {
  if (!policy || policy.status !== 'ACTIVE' || !policy.effectiveAt || policy.effectiveAt > at || (policy.retiredAt && policy.retiredAt <= at)) {
    throw operationalError('No effective consent policy exists for this purpose.', 'CONSENT_POLICY_UNAVAILABLE', 403);
  }
  return policy;
};

const findEffectivePolicy = async ({ purpose, countryCode, locale, at = new Date(), policyId, version }, database = prisma) => {
  const where = {
    purpose,
    countryCode,
    locale,
    status: 'ACTIVE',
    effectiveAt: { lte: at },
    OR: [{ retiredAt: null }, { retiredAt: { gt: at } }],
    ...(policyId ? { id: policyId } : {}),
    ...(version ? { version } : {}),
  };
  const policy = await database.consentPolicy.findFirst({ where, orderBy: [{ effectiveAt: 'desc' }, { version: 'desc' }], select: policySelect });
  return assertEffective(policy, at);
};

const listEffectivePolicies = async ({ countryCode, locale, purposes, at = new Date() }, database = prisma) => {
  const rows = await database.consentPolicy.findMany({
    where: {
      countryCode,
      locale,
      status: 'ACTIVE',
      effectiveAt: { lte: at },
      OR: [{ retiredAt: null }, { retiredAt: { gt: at } }],
      ...(purposes?.length ? { purpose: { in: purposes } } : {}),
    },
    orderBy: [{ purpose: 'asc' }, { effectiveAt: 'desc' }, { version: 'desc' }],
    select: policySelect,
  });
  const byPurpose = new Map();
  for (const policy of rows) if (!byPurpose.has(policy.purpose)) byPurpose.set(policy.purpose, policy);
  return [...byPurpose.values()];
};

const createPolicy = async ({ input, req, database = prisma }) => database.$transaction(async (tx) => {
  const existingVersion = await tx.consentPolicy.findFirst({
    where: { key: input.key, countryCode: input.countryCode, locale: input.locale },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  if (existingVersion && input.version !== existingVersion.version + 1) {
    throw operationalError('Policy versions must advance by exactly one.', 'CONSENT_POLICY_VERSION_SEQUENCE', 409);
  }
  if (!existingVersion && input.version !== 1) {
    throw operationalError('The first policy version must be 1.', 'CONSENT_POLICY_VERSION_SEQUENCE', 409);
  }
  const { reason, ...data } = input;
  const market = await resolveMarketReference({ marketCode: input.countryCode, client: tx });
  const policy = await tx.consentPolicy.create({ data: {
    ...data,
    marketId: market?.id,
    status: 'DRAFT',
    reviewStatus: 'PENDING',
    createdById: req.user.id,
  }, select: policySelect });
  await writeAuditLog({ req, action: 'CONSENT_POLICY_CREATED', resourceType: 'CONSENT_POLICY', resourceId: policy.id, reason, after: policy }, tx);
  await tx.outboxEvent.create({ data: {
    aggregateType: 'ConsentPolicy', aggregateId: policy.id, eventType: 'privacy.policy.created',
    payload: { policyId: policy.id, purpose: policy.purpose, version: policy.version }, metadata: asynchronousEvidence(req.context),
  } });
  return policy;
});

const updateDraftPolicy = async ({ id, input, req, database = prisma }) => database.$transaction(async (tx) => {
  const current = await tx.consentPolicy.findUnique({ where: { id }, select: policySelect });
  if (!current) throw operationalError('Consent policy was not found.', 'CONSENT_POLICY_NOT_FOUND', 404);
  if (current.status !== 'DRAFT') throw operationalError('Only draft policies can be edited.', 'CONSENT_POLICY_IMMUTABLE', 409);
  const { reason, ...changes } = input;
  const policy = await tx.consentPolicy.update({ where: { id }, data: { ...changes, reviewStatus: 'PENDING', reviewReference: null, reviewedAt: null, reviewedById: null }, select: policySelect });
  await writeAuditLog({ req, action: 'CONSENT_POLICY_UPDATED', resourceType: 'CONSENT_POLICY', resourceId: id, reason, before: current, after: policy }, tx);
  return policy;
});

const reviewPolicy = async ({ id, reviewStatus, reviewReference, reason, req, database = prisma }) => database.$transaction(async (tx) => {
  const current = await tx.consentPolicy.findUnique({ where: { id }, select: { ...policySelect, createdById: true } });
  if (!current) throw operationalError('Consent policy was not found.', 'CONSENT_POLICY_NOT_FOUND', 404);
  if (current.status !== 'DRAFT') throw operationalError('Only draft policies can be reviewed.', 'CONSENT_POLICY_IMMUTABLE', 409);
  if (current.createdById === req.user.id) throw operationalError('Policy creator and reviewer must be different administrators.', 'CONSENT_POLICY_REVIEWER_CONFLICT', 409);
  const policy = await tx.consentPolicy.update({ where: { id }, data: {
    reviewStatus,
    reviewReference,
    reviewedAt: new Date(),
    reviewedById: req.user.id,
  }, select: policySelect });
  await writeAuditLog({ req, action: 'CONSENT_POLICY_REVIEWED', resourceType: 'CONSENT_POLICY', resourceId: id, reason, before: current, after: policy }, tx);
  return policy;
});

const setPolicyStatus = async ({ id, status, effectiveAt, reason, req, database = prisma }) => database.$transaction(async (tx) => {
  const current = await tx.consentPolicy.findUnique({ where: { id }, select: policySelect });
  if (!current) throw operationalError('Consent policy was not found.', 'CONSENT_POLICY_NOT_FOUND', 404);
  if (current.status === status) return current;
  if (status === 'ACTIVE') {
    if (current.status !== 'DRAFT' || current.reviewStatus !== 'APPROVED') throw operationalError('Only an approved draft can be activated.', 'INVALID_CONSENT_POLICY_TRANSITION', 409);
    const conflict = await tx.consentPolicy.findFirst({ where: {
      id: { not: id }, purpose: current.purpose, countryCode: current.countryCode, locale: current.locale, status: 'ACTIVE',
    }, select: { id: true } });
    if (conflict) throw operationalError('Retire the currently active policy before activating another version.', 'ACTIVE_CONSENT_POLICY_CONFLICT', 409);
    if (env.marketsIdentityGeographyEnabled) {
      const market = current.marketId ? await tx.market.findUnique({ where: { id: current.marketId }, select: { status: true } }) : null;
      if (!market || market.status !== 'ACTIVE') throw operationalError('Consent policy market is not active.', 'CONSENT_POLICY_MARKET_INACTIVE', 409);
    }
  } else if (status === 'RETIRED') {
    if (current.status !== 'ACTIVE') throw operationalError('Only an active policy can be retired.', 'INVALID_CONSENT_POLICY_TRANSITION', 409);
  } else {
    throw operationalError('Unsupported consent policy transition.', 'INVALID_CONSENT_POLICY_TRANSITION', 409);
  }
  const now = new Date();
  const policy = await tx.consentPolicy.update({ where: { id }, data: status === 'ACTIVE'
    ? { status, effectiveAt: effectiveAt || now, retiredAt: null }
    : { status, retiredAt: now }, select: policySelect });
  await writeAuditLog({ req, action: `CONSENT_POLICY_${status}`, resourceType: 'CONSENT_POLICY', resourceId: id, reason, before: current, after: policy }, tx);
  await tx.outboxEvent.create({ data: {
    aggregateType: 'ConsentPolicy', aggregateId: id, eventType: `privacy.policy.${status.toLowerCase()}`,
    payload: { policyId: id, purpose: policy.purpose, version: policy.version }, metadata: asynchronousEvidence(req.context),
  } });
  return policy;
});

module.exports = {
  assertEffective,
  createPolicy,
  findEffectivePolicy,
  listEffectivePolicies,
  policySelect,
  reviewPolicy,
  setPolicyStatus,
  updateDraftPolicy,
};
