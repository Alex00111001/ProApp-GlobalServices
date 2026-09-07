const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { writeAuditLog } = require('../audit/audit.service');
const { getSubjectKeys } = require('../privacy/consent.service');
const { authenticatedSubject } = require('../privacy/identity-proof.service');
const { asynchronousEvidence, canonicalDigest, operationalError, requestEvidence } = require('../privacy/privacy-utils');
const { observeAttributionOperation } = require('../observability/metrics');

const modelSelect = Object.freeze({
  id: true, key: true, version: true, name: true, type: true, purpose: true, windowDays: true,
  status: true, effectiveAt: true, retiredAt: true, createdAt: true, updatedAt: true,
});

const createModel = async ({ input, req, database = prisma }) => database.$transaction(async (tx) => {
  const prior = await tx.attributionModel.findFirst({ where: { key: input.key }, orderBy: { version: 'desc' }, select: { version: true } });
  if ((prior && input.version !== prior.version + 1) || (!prior && input.version !== 1)) {
    throw operationalError('Attribution model versions must advance by exactly one.', 'ATTRIBUTION_MODEL_VERSION_SEQUENCE', 409);
  }
  const { reason, ...data } = input;
  const model = await tx.attributionModel.create({ data: { ...data, status: 'DRAFT', createdById: req.user.id }, select: modelSelect });
  await writeAuditLog({ req, action: 'ATTRIBUTION_MODEL_CREATED', resourceType: 'ATTRIBUTION_MODEL', resourceId: model.id, reason, after: model }, tx);
  return model;
});

const updateDraftModel = async ({ id, input, req, database = prisma }) => database.$transaction(async (tx) => {
  const current = await tx.attributionModel.findUnique({ where: { id }, select: modelSelect });
  if (!current) throw operationalError('Attribution model was not found.', 'ATTRIBUTION_MODEL_NOT_FOUND', 404);
  if (current.status !== 'DRAFT') throw operationalError('Only draft attribution models can be edited.', 'ATTRIBUTION_MODEL_IMMUTABLE', 409);
  const { reason, ...changes } = input;
  const model = await tx.attributionModel.update({ where: { id }, data: changes, select: modelSelect });
  await writeAuditLog({ req, action: 'ATTRIBUTION_MODEL_UPDATED', resourceType: 'ATTRIBUTION_MODEL', resourceId: id, reason, before: current, after: model }, tx);
  return model;
});

const setModelStatus = async ({ id, status, effectiveAt, reason, req, database = prisma }) => database.$transaction(async (tx) => {
  const current = await tx.attributionModel.findUnique({ where: { id }, select: modelSelect });
  if (!current) throw operationalError('Attribution model was not found.', 'ATTRIBUTION_MODEL_NOT_FOUND', 404);
  if (current.status === status) return current;
  if (status === 'ACTIVE') {
    if (current.status !== 'DRAFT') throw operationalError('Only draft models can be activated.', 'INVALID_ATTRIBUTION_MODEL_TRANSITION', 409);
    const conflict = await tx.attributionModel.findFirst({ where: { id: { not: id }, key: current.key, status: 'ACTIVE' }, select: { id: true } });
    if (conflict) throw operationalError('Retire the active model version before activating another.', 'ACTIVE_ATTRIBUTION_MODEL_CONFLICT', 409);
  } else if (status === 'RETIRED') {
    if (current.status !== 'ACTIVE') throw operationalError('Only active models can be retired.', 'INVALID_ATTRIBUTION_MODEL_TRANSITION', 409);
  } else throw operationalError('Unsupported model transition.', 'INVALID_ATTRIBUTION_MODEL_TRANSITION', 409);
  const now = new Date();
  const model = await tx.attributionModel.update({ where: { id }, data: status === 'ACTIVE'
    ? { status, effectiveAt: effectiveAt || now, retiredAt: null }
    : { status, retiredAt: now }, select: modelSelect });
  await writeAuditLog({ req, action: `ATTRIBUTION_MODEL_${status}`, resourceType: 'ATTRIBUTION_MODEL', resourceId: id, reason, before: current, after: model }, tx);
  return model;
});

const resolveConversionSubject = (conversion) => {
  if (conversion.lead?.subjectKey) return { subjectKey: conversion.lead.subjectKey, subjectType: conversion.lead.subjectType, userId: conversion.userId };
  return authenticatedSubject({ userId: conversion.userId, professionalId: conversion.professionalId });
};

const calculateForModel = async ({ conversion, model, context = {}, database = prisma, now = new Date() }) => {
  const existing = await database.attribution.findUnique({ where: { conversionId_modelId: { conversionId: conversion.id, modelId: model.id } } });
  if (existing) {
    observeAttributionOperation({ operation: 'attribution_calculation', outcome: 'duplicate', reason: existing.status });
    return { attribution: existing, duplicate: true };
  }
  const subject = resolveConversionSubject(conversion);
  const windowEndedAt = conversion.occurredAt;
  const windowStartedAt = new Date(windowEndedAt.getTime() - model.windowDays * 24 * 60 * 60_000);
  let candidates = [];
  let status = 'UNATTRIBUTED';
  let reasonCode = subject ? 'NO_ELIGIBLE_TOUCHPOINT' : 'NO_TRUSTED_SUBJECT';
  if (subject) {
    const subjectKeys = await getSubjectKeys(subject, database);
    const latest = await database.consentDecision.findFirst({
      where: { subjectKey: { in: subjectKeys }, purpose: model.purpose, occurredAt: { lte: now } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    if (latest && ['DENIED', 'WITHDRAWN'].includes(latest.decision)) {
      status = 'BLOCKED_CONSENT';
      reasonCode = latest.decision === 'WITHDRAWN' ? 'CONSENT_WITHDRAWN' : 'CONSENT_DENIED';
    } else {
      candidates = await database.touchpoint.findMany({
        where: {
          subjectKey: { in: subjectKeys },
          occurredAt: { gte: windowStartedAt, lte: windowEndedAt },
          policy: {
            purpose: model.purpose, status: 'ACTIVE', effectiveAt: { lte: now },
            OR: [{ retiredAt: null }, { retiredAt: { gt: now } }],
          },
        },
        orderBy: model.type === 'FIRST_TOUCH' ? [{ occurredAt: 'asc' }, { id: 'asc' }] : [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { id: true, occurredAt: true, policyId: true, policyVersion: true, consentDecisionId: true },
      });
      if (candidates.length) {
        const selected = candidates[0];
        if (latest && latest.decision === 'GRANTED' && (latest.policyId !== selected.policyId || latest.policyVersion !== selected.policyVersion)) {
          reasonCode = 'STALE_POLICY_GRANT';
        } else {
          status = 'ATTRIBUTED';
          reasonCode = model.type;
        }
      }
    }
  }
  const selected = status === 'ATTRIBUTED' ? candidates[0] : null;
  const inputDigest = canonicalDigest({
    model: { id: model.id, version: model.version, type: model.type, purpose: model.purpose, windowDays: model.windowDays },
    conversion: { id: conversion.id, occurredAt: conversion.occurredAt.toISOString() },
    candidates: candidates.map((item) => ({ id: item.id, occurredAt: item.occurredAt.toISOString(), policyId: item.policyId, policyVersion: item.policyVersion })),
    status,
    reasonCode,
  });
  const data = {
    attributionKey: `conversion:${conversion.id}:model:${model.id}:v${model.version}`,
    conversionId: conversion.id,
    modelId: model.id,
    modelVersion: model.version,
    touchpointId: selected?.id,
    status,
    reasonCode,
    windowStartedAt,
    windowEndedAt,
    inputDigest,
    calculatedAt: now,
    ...requestEvidence(context),
  };
  try {
    const persist = async (tx) => {
      const attribution = await tx.attribution.create({ data });
      await tx.outboxEvent.create({ data: {
        aggregateType: 'Attribution', aggregateId: attribution.id, eventType: 'growth.attribution.calculated',
        payload: { attributionId: attribution.id, conversionId: conversion.id, modelId: model.id, status, reasonCode }, metadata: asynchronousEvidence(context),
      } });
      return attribution;
    };
    const attribution = database.$transaction ? await database.$transaction(persist) : await persist(database);
    observeAttributionOperation({ operation: 'attribution_calculation', outcome: 'completed', reason: status });
    return { attribution, duplicate: false };
  } catch (error) {
    if (error?.code === 'P2002') {
      const replay = await database.attribution.findUnique({ where: { conversionId_modelId: { conversionId: conversion.id, modelId: model.id } } });
      if (replay) return { attribution: replay, duplicate: true };
    }
    throw error;
  }
};

const attributeConversion = async ({ conversionId, context = {}, database = prisma, now = new Date() }) => {
  if (!env.consentAttributionEnabled) return { active: false, results: [] };
  const conversion = await database.conversion.findUnique({ where: { id: conversionId }, include: { lead: { select: { subjectKey: true, subjectType: true } } } });
  if (!conversion) throw operationalError('Conversion was not found.', 'CONVERSION_NOT_FOUND', 404);
  const models = await database.attributionModel.findMany({
    where: { status: 'ACTIVE', effectiveAt: { lte: now }, OR: [{ retiredAt: null }, { retiredAt: { gt: now } }] },
    orderBy: [{ key: 'asc' }, { version: 'asc' }],
  });
  const results = [];
  for (const model of models) results.push(await calculateForModel({ conversion, model, context, database, now }));
  return { active: true, results };
};

module.exports = {
  attributeConversion,
  calculateForModel,
  createModel,
  modelSelect,
  resolveConversionSubject,
  setModelStatus,
  updateDraftModel,
};
