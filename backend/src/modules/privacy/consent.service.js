const prisma = require('../../config/prisma');
const { Prisma } = require('@prisma/client');
const env = require('../../config/env');
const { findEffectivePolicy } = require('./consent-policy.service');
const { resolveTrustedSubject } = require('./identity-proof.service');
const { asynchronousEvidence, operationalError, requestEvidence, sanitizePrivateObject } = require('./privacy-utils');
const { observePrivacyOperation } = require('../observability/metrics');

const getSubjectKeys = async (subject, database) => {
  const keys = new Set([subject.subjectKey]);
  if (subject.userId) {
    const links = await database.subjectIdentityLink.findMany({
      where: { userId: subject.userId, authenticatedSubjectKey: subject.subjectKey },
      select: { anonymousSubjectKey: true },
    });
    for (const link of links) keys.add(link.anonymousSubjectKey);
  }
  return [...keys];
};

const latestDecision = async ({ subject, purpose, at = new Date() }, database = prisma) => {
  const subjectKeys = await getSubjectKeys(subject, database);
  return database.consentDecision.findFirst({
    where: { subjectKey: { in: subjectKeys }, purpose, occurredAt: { lte: at } },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    include: { policy: true },
  });
};

const assertReplayCompatible = (existing, expected) => {
  if (existing.policyId !== expected.policyId || existing.policyVersion !== expected.policyVersion || existing.purpose !== expected.purpose
    || existing.subjectKey !== expected.subjectKey || existing.decision !== expected.decision || existing.source !== expected.source) {
    throw operationalError('Idempotency key was already used for a different consent decision.', 'CONSENT_IDEMPOTENCY_CONFLICT', 409);
  }
};

const recordDecision = async ({ input, identity = {}, proof, context = {}, database = prisma, now = new Date() }) => {
  if (!env.consentAttributionEnabled) throw operationalError('Consent and attribution are disabled.', 'CONSENT_ATTRIBUTION_DISABLED', 503);
  const subject = resolveTrustedSubject({ identity, proof });
  const policy = await findEffectivePolicy({
    purpose: input.purpose,
    countryCode: input.countryCode,
    locale: input.locale,
    at: now,
    policyId: input.policyId,
    version: input.policyVersion,
  }, database);
  if (policy.enforcementMode === 'PROHIBITED' && input.decision === 'GRANTED') {
    throw operationalError('This policy does not permit consent grants.', 'CONSENT_GRANT_PROHIBITED', 403);
  }
  const expected = {
    policyId: policy.id,
    policyVersion: policy.version,
    purpose: policy.purpose,
    subjectKey: subject.subjectKey,
    decision: input.decision,
    source: input.source,
  };
  const existing = await database.consentDecision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    assertReplayCompatible(existing, expected);
    observePrivacyOperation({ operation: 'consent_decision', outcome: 'duplicate', reason: existing.decision });
    return { decision: existing, duplicate: true };
  }
  const prior = await latestDecision({ subject, purpose: policy.purpose, at: now }, database);
  if (input.decision === 'WITHDRAWN') {
    if (!prior || prior.decision !== 'GRANTED') throw operationalError('There is no active grant to withdraw.', 'CONSENT_NOT_GRANTED', 409);
  }
  const evidence = input.evidence === undefined ? undefined : sanitizePrivateObject(input.evidence);
  const create = async (tx) => {
    const decision = await tx.consentDecision.create({ data: {
      idempotencyKey: input.idempotencyKey,
      policyId: policy.id,
      policyVersion: policy.version,
      purpose: policy.purpose,
      subjectKey: subject.subjectKey,
      subjectType: subject.subjectType,
      userId: subject.userId,
      decision: input.decision,
      source: input.source,
      evidence,
      occurredAt: now,
      ...requestEvidence(context),
    } });
    await tx.outboxEvent.create({ data: {
      aggregateType: 'ConsentDecision',
      aggregateId: decision.id,
      eventType: input.decision === 'WITHDRAWN' ? 'privacy.consent.withdrawn' : 'privacy.consent.decided',
      payload: { decisionId: decision.id, purpose: decision.purpose, decision: decision.decision, policyVersion: decision.policyVersion },
      metadata: asynchronousEvidence(context),
    } });
    return decision;
  };
  try {
    const decision = database.$transaction ? await database.$transaction(create) : await create(database);
    observePrivacyOperation({ operation: 'consent_decision', outcome: 'accepted', reason: decision.decision });
    return { decision, duplicate: false };
  } catch (error) {
    if (error?.code === 'P2002') {
      const replay = await database.consentDecision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay) {
        assertReplayCompatible(replay, expected);
        return { decision: replay, duplicate: true };
      }
    }
    throw error;
  }
};

const enforceSubjectConsent = async ({ purpose, countryCode, locale, policyId, policyVersion, subject, at = new Date(), database = prisma }) => {
  if (!env.consentAttributionEnabled) throw operationalError('Consent and attribution are disabled.', 'CONSENT_ATTRIBUTION_DISABLED', 503);
  const policy = await findEffectivePolicy({ purpose, countryCode, locale, policyId, version: policyVersion, at }, database);
  if (policy.enforcementMode === 'PROHIBITED') {
    observePrivacyOperation({ operation: 'consent_enforcement', outcome: 'denied', reason: 'prohibited' });
    throw operationalError('Processing is prohibited for this policy.', 'CONSENT_PROCESSING_PROHIBITED', 403);
  }
  const decision = await latestDecision({ subject, purpose, at }, database);
  if (decision && ['DENIED', 'WITHDRAWN'].includes(decision.decision)) {
    observePrivacyOperation({ operation: 'consent_enforcement', outcome: 'denied', reason: decision.decision });
    throw operationalError('Consent does not permit this processing.', 'CONSENT_ENFORCEMENT_DENIED', 403, { reason: decision.decision });
  }
  if (policy.enforcementMode === 'EXPLICIT_GRANT') {
    if (!decision || decision.decision !== 'GRANTED' || decision.policyId !== policy.id || decision.policyVersion !== policy.version) {
      observePrivacyOperation({ operation: 'consent_enforcement', outcome: 'denied', reason: 'grant_required' });
      throw operationalError('An explicit grant for the effective policy is required.', 'CONSENT_GRANT_REQUIRED', 403);
    }
  }
  observePrivacyOperation({ operation: 'consent_enforcement', outcome: 'allowed', reason: policy.enforcementMode });
  return { policy, decision, subject };
};

const enforceConsent = async ({ identity = {}, proof, ...input }) => enforceSubjectConsent({
  ...input,
  subject: resolveTrustedSubject({ identity, proof }),
});

const withdrawConsent = async ({ input, identity = {}, proof, context = {}, database = prisma, now = new Date() }) => {
  if (!env.consentAttributionEnabled) throw operationalError('Consent and attribution are disabled.', 'CONSENT_ATTRIBUTION_DISABLED', 503);
  const subject = resolveTrustedSubject({ identity, proof });
  const replay = await database.consentDecision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (replay) {
    assertReplayCompatible(replay, { policyId: replay.policyId, policyVersion: replay.policyVersion, purpose: input.purpose, subjectKey: subject.subjectKey, decision: 'WITHDRAWN', source: input.source });
    observePrivacyOperation({ operation: 'consent_withdrawal', outcome: 'duplicate' });
    return { decision: replay, duplicate: true };
  }
  const evidence = input.evidence === undefined ? undefined : sanitizePrivateObject(input.evidence);
  const create = async (tx) => {
    if (typeof tx.$queryRaw === 'function') {
      const lockKey = `${subject.subjectKey}:${input.purpose}`;
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS acquired`);
    }
    const prior = await latestDecision({ subject, purpose: input.purpose, at: now }, tx);
    if (!prior || prior.decision !== 'GRANTED') throw operationalError('There is no active grant to withdraw.', 'CONSENT_NOT_GRANTED', 409);
    const decision = await tx.consentDecision.create({ data: {
      idempotencyKey: input.idempotencyKey,
      policyId: prior.policyId,
      policyVersion: prior.policyVersion,
      purpose: input.purpose,
      subjectKey: subject.subjectKey,
      subjectType: subject.subjectType,
      userId: subject.userId,
      decision: 'WITHDRAWN',
      source: input.source,
      evidence,
      occurredAt: now,
      ...requestEvidence(context),
    } });
    await tx.outboxEvent.create({ data: {
      aggregateType: 'ConsentDecision', aggregateId: decision.id, eventType: 'privacy.consent.withdrawn',
      payload: { decisionId: decision.id, purpose: decision.purpose, policyVersion: decision.policyVersion }, metadata: asynchronousEvidence(context),
    } });
    return decision;
  };
  try {
    const decision = database.$transaction ? await database.$transaction(create) : await create(database);
    observePrivacyOperation({ operation: 'consent_withdrawal', outcome: 'accepted' });
    return { decision, duplicate: false };
  } catch (error) {
    if (error?.code === 'P2002') {
      const existing = await database.consentDecision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        assertReplayCompatible(existing, { policyId: existing.policyId, policyVersion: existing.policyVersion, purpose: input.purpose, subjectKey: subject.subjectKey, decision: 'WITHDRAWN', source: input.source });
        return { decision: existing, duplicate: true };
      }
    }
    throw error;
  }
};

const listConsentHistory = async ({ identity, purpose, page = 1, limit = 25, database = prisma }) => {
  const subject = resolveTrustedSubject({ identity, allowAnonymous: false });
  const subjectKeys = await getSubjectKeys(subject, database);
  const where = { subjectKey: { in: subjectKeys }, ...(purpose ? { purpose } : {}) };
  const [items, total] = await Promise.all([
    database.consentDecision.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit,
      select: { id: true, policyId: true, policyVersion: true, purpose: true, decision: true, source: true, occurredAt: true, createdAt: true } }),
    database.consentDecision.count({ where }),
  ]);
  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
};

module.exports = {
  assertReplayCompatible,
  enforceConsent,
  enforceSubjectConsent,
  getSubjectKeys,
  latestDecision,
  listConsentHistory,
  recordDecision,
  withdrawConsent,
};
