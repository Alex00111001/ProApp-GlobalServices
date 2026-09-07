const prisma = require('../../config/prisma');
const { policySelect } = require('../privacy/consent-policy.service');
const { modelSelect } = require('../attribution/attribution.service');

const paginate = ({ page, limit }) => ({ skip: (page - 1) * limit, take: limit });
const result = (items, total, query) => ({ items, pagination: { page: query.page, limit: query.limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } });

const listPolicies = async (query, database = prisma) => {
  const where = {
    ...(query.purpose ? { purpose: query.purpose } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.countryCode ? { countryCode: query.countryCode } : {}),
    ...(query.locale ? { locale: query.locale } : {}),
  };
  const [items, total] = await Promise.all([
    database.consentPolicy.findMany({ where, orderBy: [{ purpose: 'asc' }, { countryCode: 'asc' }, { locale: 'asc' }, { version: 'desc' }], ...paginate(query), select: policySelect }),
    database.consentPolicy.count({ where }),
  ]);
  return result(items, total, query);
};

const listConsentDecisions = async (query, { withdrawalsOnly = false } = {}, database = prisma) => {
  const where = {
    ...(query.purpose ? { purpose: query.purpose } : {}),
    ...(query.status ? { decision: query.status } : {}),
    ...(withdrawalsOnly ? { decision: 'WITHDRAWN' } : {}),
    ...(query.countryCode || query.locale ? { policy: {
      ...(query.countryCode ? { countryCode: query.countryCode } : {}),
      ...(query.locale ? { locale: query.locale } : {}),
    } } : {}),
  };
  const select = {
    id: true, policyId: true, policyVersion: true, purpose: true, userId: true, subjectType: true,
    decision: true, source: true, evidence: true, occurredAt: true, createdAt: true,
    requestId: true, correlationId: true, traceId: true,
    policy: { select: { key: true, countryCode: true, locale: true, documentReference: true } },
  };
  const [items, total] = await Promise.all([
    database.consentDecision.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], ...paginate(query), select }),
    database.consentDecision.count({ where }),
  ]);
  return result(items, total, query);
};

const listTouchpoints = async (query, database = prisma) => {
  const where = {
    ...(query.purpose || query.countryCode || query.locale ? { policy: {
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.countryCode ? { countryCode: query.countryCode } : {}),
      ...(query.locale ? { locale: query.locale } : {}),
    } } : {}),
  };
  const select = {
    id: true, userId: true, subjectType: true, policyId: true, policyVersion: true, campaignId: true, leadId: true,
    source: true, medium: true, channel: true, referrerOrigin: true, referrerPath: true, landingPath: true,
    occurredAt: true, receivedAt: true, requestId: true, correlationId: true, traceId: true,
  };
  const [items, total] = await Promise.all([
    database.touchpoint.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], ...paginate(query), select }),
    database.touchpoint.count({ where }),
  ]);
  return result(items, total, query);
};

const listModels = async (query, database = prisma) => {
  const where = { ...(query.purpose ? { purpose: query.purpose } : {}), ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    database.attributionModel.findMany({ where, orderBy: [{ key: 'asc' }, { version: 'desc' }], ...paginate(query), select: modelSelect }),
    database.attributionModel.count({ where }),
  ]);
  return result(items, total, query);
};

const listAttributions = async (query, database = prisma) => {
  const where = {
    ...(query.purpose ? { model: { purpose: query.purpose } } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.modelId ? { modelId: query.modelId } : {}),
    ...(query.conversionId ? { conversionId: query.conversionId } : {}),
  };
  const select = {
    id: true, status: true, reasonCode: true, inputDigest: true, windowStartedAt: true, windowEndedAt: true,
    calculatedAt: true, requestId: true, correlationId: true, traceId: true,
    conversion: { select: { id: true, type: true, occurredAt: true, campaignId: true } },
    model: { select: modelSelect },
    touchpoint: { select: { id: true, source: true, medium: true, channel: true, occurredAt: true, campaignId: true } },
  };
  const [items, total] = await Promise.all([
    database.attribution.findMany({ where, orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }], ...paginate(query), select }),
    database.attribution.count({ where }),
  ]);
  return result(items, total, query);
};

module.exports = { listAttributions, listConsentDecisions, listModels, listPolicies, listTouchpoints };
