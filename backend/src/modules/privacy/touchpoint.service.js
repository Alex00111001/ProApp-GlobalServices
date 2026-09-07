const prisma = require('../../config/prisma');
const { enforceConsent } = require('./consent.service');
const { assertSafeText, asynchronousEvidence, operationalError, normalizeOperationalIdentifier, requestEvidence, sanitizePrivateObject } = require('./privacy-utils');
const { observeAttributionOperation } = require('../observability/metrics');

const parseEventTime = (value, now = new Date()) => {
  const occurredAt = value ? new Date(value) : now;
  if (Number.isNaN(occurredAt.getTime())) throw operationalError('Touchpoint occurrence time is invalid.', 'INVALID_TOUCHPOINT_TIME', 400);
  if (occurredAt > new Date(now.getTime() + 5 * 60_000)) throw operationalError('Touchpoint time is in the future.', 'TOUCHPOINT_TIME_IN_FUTURE', 400);
  if (occurredAt < new Date(now.getTime() - 366 * 24 * 60 * 60_000)) throw operationalError('Touchpoint is outside the accepted ingestion window.', 'TOUCHPOINT_TIME_TOO_OLD', 400);
  return occurredAt;
};

const normalizeReferrer = (value) => {
  if (!value) return { origin: undefined, path: undefined, sanitized: false };
  let parsed;
  try { parsed = new URL(value); } catch { throw operationalError('Referrer must be a valid HTTPS URL.', 'INVALID_REFERRER', 400); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw operationalError('Referrer must be HTTPS and contain no credentials.', 'UNSAFE_REFERRER', 400);
  }
  const sanitized = Boolean(parsed.search || parsed.hash);
  let path;
  try { path = decodeURIComponent(parsed.pathname); } catch { throw operationalError('Referrer path is malformed.', 'INVALID_REFERRER', 400); }
  assertSafeText(path, 'referrerPath');
  path = parsed.pathname.slice(0, 1_000) || '/';
  return { origin: parsed.origin.toLowerCase(), path, sanitized };
};

const normalizeLandingPath = (value) => {
  if (!value) return { path: undefined, sanitized: false };
  let path;
  let sanitized = false;
  if (String(value).startsWith('/')) {
    const parsed = new URL(value, 'https://landing.invalid');
    path = parsed.pathname;
    sanitized = Boolean(parsed.search || parsed.hash);
  } else {
    let parsed;
    try { parsed = new URL(value); } catch { throw operationalError('Landing context must be a path or HTTPS URL.', 'INVALID_LANDING_CONTEXT', 400); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw operationalError('Landing URL is unsafe.', 'UNSAFE_LANDING_CONTEXT', 400);
    path = parsed.pathname;
    sanitized = Boolean(parsed.search || parsed.hash);
  }
  let decodedPath;
  try { decodedPath = decodeURIComponent(path || '/'); } catch { throw operationalError('Landing path is malformed.', 'INVALID_LANDING_CONTEXT', 400); }
  assertSafeText(decodedPath, 'landingPath');
  return { path: (path || '/').slice(0, 1_000), sanitized };
};

const assertReplayCompatible = (existing, expected) => {
  const mismatch = existing.subjectKey !== expected.subjectKey || existing.policyId !== expected.policyId
    || existing.policyVersion !== expected.policyVersion || existing.source !== expected.source
    || (existing.medium || null) !== (expected.medium || null) || (existing.campaignId || null) !== (expected.campaignId || null)
    || (existing.marketingEventId || null) !== (expected.marketingEventId || null);
  if (mismatch) throw operationalError('Idempotency key was already used for another touchpoint.', 'TOUCHPOINT_IDEMPOTENCY_CONFLICT', 409);
};

const ingestTouchpoint = async ({ input, identity = {}, proof, context = {}, database = prisma, now = new Date(), links = {} }) => {
  const occurredAt = parseEventTime(input.occurredAt, now);
  const consent = await enforceConsent({
    purpose: input.purpose,
    countryCode: input.countryCode,
    locale: input.locale,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    identity,
    proof,
    at: now,
    database,
  });
  const source = normalizeOperationalIdentifier(input.source, 'source');
  const medium = input.medium ? normalizeOperationalIdentifier(input.medium, 'medium') : undefined;
  const channel = input.channel ? normalizeOperationalIdentifier(input.channel, 'channel') : undefined;
  const referrer = normalizeReferrer(input.referrer);
  const landing = normalizeLandingPath(input.landingUrl || input.landingPath);
  const contextData = input.context === undefined ? undefined : sanitizePrivateObject(input.context, { maxDepth: 4, maxKeys: 30, maxString: 256 });
  const expected = {
    subjectKey: consent.subject.subjectKey,
    policyId: consent.policy.id,
    policyVersion: consent.policy.version,
    source,
    medium,
    campaignId: links.campaignId,
    marketingEventId: links.marketingEventId,
  };
  if (links.expectedSubjectKey && consent.subject.subjectKey !== links.expectedSubjectKey) {
    throw operationalError('Identity proof does not match the event subject.', 'TOUCHPOINT_IDENTITY_MISMATCH', 403);
  }
  const existing = await database.touchpoint.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    assertReplayCompatible(existing, expected);
    observeAttributionOperation({ operation: 'touchpoint_ingestion', outcome: 'duplicate' });
    return { touchpoint: existing, duplicate: true, sanitized: referrer.sanitized || landing.sanitized };
  }
  let identityLinkId;
  if (consent.subject.userId) {
    const link = await database.subjectIdentityLink.findFirst({ where: {
      userId: consent.subject.userId,
      authenticatedSubjectKey: consent.subject.subjectKey,
    }, orderBy: { linkedAt: 'desc' }, select: { id: true } });
    identityLinkId = link?.id;
  }
  const create = async (tx) => {
    const touchpoint = await tx.touchpoint.create({ data: {
      idempotencyKey: input.idempotencyKey,
      subjectKey: consent.subject.subjectKey,
      subjectType: consent.subject.subjectType,
      userId: consent.subject.userId,
      identityLinkId,
      policyId: consent.policy.id,
      policyVersion: consent.policy.version,
      consentDecisionId: consent.decision?.id,
      campaignId: links.campaignId,
      leadId: links.leadId,
      marketingEventId: links.marketingEventId,
      source,
      medium,
      channel,
      referrerOrigin: referrer.origin,
      referrerPath: referrer.path,
      landingPath: landing.path,
      context: contextData,
      occurredAt,
      ...requestEvidence(context),
    } });
    await tx.outboxEvent.create({ data: {
      aggregateType: 'Touchpoint', aggregateId: touchpoint.id, eventType: 'privacy.touchpoint.accepted',
      payload: { touchpointId: touchpoint.id, source, hasCampaign: Boolean(links.campaignId), sanitized: referrer.sanitized || landing.sanitized },
      metadata: asynchronousEvidence(context),
    } });
    return touchpoint;
  };
  try {
    const touchpoint = database.$transaction ? await database.$transaction(create) : await create(database);
    observeAttributionOperation({ operation: 'touchpoint_ingestion', outcome: 'accepted', reason: referrer.sanitized || landing.sanitized ? 'sanitized' : 'clean' });
    return { touchpoint, duplicate: false, sanitized: referrer.sanitized || landing.sanitized };
  } catch (error) {
    if (error?.code === 'P2002') {
      const replay = await database.touchpoint.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay) {
        assertReplayCompatible(replay, expected);
        return { touchpoint: replay, duplicate: true, sanitized: referrer.sanitized || landing.sanitized };
      }
    }
    throw error;
  }
};

module.exports = { assertReplayCompatible, ingestTouchpoint, normalizeLandingPath, normalizeReferrer, parseEventTime };
