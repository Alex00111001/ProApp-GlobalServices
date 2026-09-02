const { createHmac } = require('node:crypto');
const { isKnownEvent } = require('./event-taxonomy');
const { telemetryMetadata } = require('../../observability/context');
const { redactText } = require('../../observability/redaction');
const { growthDataEnabled, growthPseudonymSecret } = require('../../../config/env');

const BLOCKED_KEYS = /password|token|authorization|secret|api[_-]?key|card|cvv|email|phone|(?:first|last|full)[_-]?name|address|postal|ip[_-]?address|user[_-]?agent|latitude|longitude|coordinates|^lat$|^lng$/i;

const CONVERSION_EVENTS = Object.freeze({
  signup_completed: 'SIGNUP',
  request_created: 'REQUEST',
  booking_created: 'BOOKING',
  payment_completed: 'PAYMENT',
  job_completed: 'JOB_COMPLETED',
});
const ENGAGEMENT_EVENTS = new Set(['service_viewed', 'professional_viewed', 'request_started', ...Object.keys(CONVERSION_EVENTS)]);
const operationalError = (message, code, statusCode) => Object.assign(new Error(message), { code, statusCode });

const sanitizeMetadata = (value, depth = 0) => {
  if (typeof value === 'string') return redactText(value);
  if (depth > 4 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !BLOCKED_KEYS.test(key))
      .slice(0, 100)
      .map(([key, item]) => [key, sanitizeMetadata(item, depth + 1)])
  );
};

const hashIdentifier = (type, value, secret = growthPseudonymSecret) => createHmac('sha256', secret).update(`${type}:${value}`).digest('hex');

const resolveSubject = (input, identity = {}) => {
  if (identity.professionalId) return { subjectKey: hashIdentifier('PROFESSIONAL', identity.professionalId), subjectType: 'PROFESSIONAL' };
  if (identity.userId) return { subjectKey: hashIdentifier('USER', identity.userId), subjectType: 'USER' };
  if (input.anonymousId) return { subjectKey: hashIdentifier('ANONYMOUS', input.anonymousId), subjectType: 'ANONYMOUS' };
  if (input.sessionId) return { subjectKey: hashIdentifier('SESSION', input.sessionId), subjectType: 'SESSION' };
  return null;
};

const parseOccurredAt = (value, now = new Date()) => {
  const occurredAt = value ? new Date(value) : now;
  if (Number.isNaN(occurredAt.getTime())) throw operationalError('Event occurrence time is invalid.', 'INVALID_EVENT_TIME', 400);
  if (occurredAt.getTime() > now.getTime() + 5 * 60_000) throw operationalError('Event occurrence time is too far in the future.', 'EVENT_TIME_IN_FUTURE', 400);
  if (occurredAt.getTime() < now.getTime() - 366 * 24 * 60 * 60_000) throw operationalError('Event occurrence time is outside the accepted retention window.', 'EVENT_TIME_TOO_OLD', 400);
  return occurredAt;
};

const assertBookingOwnership = async (bookingId, identity, client) => {
  if (!bookingId) return;
  if (!identity.userId && !identity.professionalId) throw operationalError('Authenticated ownership is required for booking events.', 'EVENT_BOOKING_IDENTITY_REQUIRED', 403);
  const booking = await client.booking.findUnique({
    where: { id: bookingId },
    select: { professionalId: true, client: { select: { userId: true } } },
  });
  if (!booking) throw operationalError('Booking was not found.', 'BOOKING_NOT_FOUND', 404);
  if (booking.client.userId !== identity.userId && booking.professionalId !== identity.professionalId) {
    throw operationalError('Booking does not belong to the authenticated actor.', 'EVENT_BOOKING_FORBIDDEN', 403);
  }
};

const resolveCampaign = async (input, occurredAt, client) => {
  const key = (input.utm?.campaign || input.campaign || '').trim().toLowerCase();
  if (!key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return null;
  return client.campaign.findFirst({
    where: {
      key,
      status: 'ACTIVE',
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: occurredAt } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: occurredAt } }] },
      ],
    },
    select: { id: true, key: true, status: true },
  });
};

const assertReplayCompatible = (existing, input, identity) => {
  const conflicts = existing.eventName !== input.eventName
    || (existing.bookingId || null) !== (input.bookingId || null)
    || (existing.userId || null) !== (identity.userId || null)
    || (existing.professionalId || null) !== (identity.professionalId || null)
    || (input.anonymousId && existing.anonymousId !== hashIdentifier('ANONYMOUS', input.anonymousId))
    || (input.sessionId && existing.sessionId !== hashIdentifier('SESSION', input.sessionId));
  if (conflicts) throw operationalError('Event id was already used for a different event.', 'EVENT_ID_CONFLICT', 409);
};

const upsertLead = async ({ subject, identity, campaign, input, occurredAt, conversionType }, client) => {
  if (!subject) return null;
  const countryCode = typeof input.geography?.countryCode === 'string' ? input.geography.countryCode.trim().toUpperCase() : undefined;
  const lead = await client.lead.upsert({
    where: { subjectKey: subject.subjectKey },
    update: {
      userId: identity.userId,
      professionalId: identity.professionalId,
    },
    create: {
      subjectKey: subject.subjectKey,
      subjectType: subject.subjectType,
      userId: identity.userId,
      professionalId: identity.professionalId,
      campaignId: campaign?.id,
      source: input.source || input.utm?.source,
      channel: input.channel,
      countryCode,
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
      status: conversionType ? 'CONVERTED' : ENGAGEMENT_EVENTS.has(input.eventName) ? 'ENGAGED' : 'NEW',
      convertedAt: conversionType ? occurredAt : undefined,
    },
  });
  await Promise.all([
    client.lead.updateMany({ where: { id: lead.id, firstSeenAt: { gt: occurredAt } }, data: { firstSeenAt: occurredAt } }),
    client.lead.updateMany({ where: { id: lead.id, lastSeenAt: { lt: occurredAt } }, data: { lastSeenAt: occurredAt } }),
    campaign?.id ? client.lead.updateMany({ where: { id: lead.id, campaignId: null }, data: { campaignId: campaign.id } }) : Promise.resolve(),
    conversionType
      ? client.lead.updateMany({ where: { id: lead.id, status: { not: 'DISQUALIFIED' } }, data: { status: 'CONVERTED', convertedAt: lead.convertedAt || occurredAt } })
      : ENGAGEMENT_EVENTS.has(input.eventName)
        ? client.lead.updateMany({ where: { id: lead.id, status: 'NEW' }, data: { status: 'ENGAGED' } })
        : Promise.resolve(),
  ]);
  return client.lead.findUnique({ where: { id: lead.id }, select: { id: true, status: true } });
};

const trackEvent = async (input, identity = {}, client, context = {}, options = {}) => {
  const database = client || require('../../../config/prisma');
  const pipelineEnabled = options.growthDataEnabled ?? growthDataEnabled;
  if (!isKnownEvent(input.eventName)) throw Object.assign(new Error('Unknown event name'), { code: 'UNKNOWN_EVENT' });
  const metadata = sanitizeMetadata(input.metadata || {});
  if (JSON.stringify(metadata).length > 16_384) throw Object.assign(new Error('Event metadata is too large'), { code: 'METADATA_TOO_LARGE' });
  const existing = input.eventId ? await database.marketingEvent.findUnique({ where: { clientEventId: input.eventId } }) : null;
  if (existing) {
    assertReplayCompatible(existing, input, identity);
    return { event: existing, duplicate: true };
  }
  const occurredAt = parseOccurredAt(input.occurredAt);
  const subject = resolveSubject(input, identity);
  const conversionType = CONVERSION_EVENTS[input.eventName];
  const work = async (tx) => {
    if (pipelineEnabled) await assertBookingOwnership(input.bookingId, identity, tx);
    const campaign = pipelineEnabled ? await resolveCampaign(input, occurredAt, tx) : null;
    const lead = pipelineEnabled ? await upsertLead({ subject, identity, campaign, input, occurredAt, conversionType }, tx) : null;
    const contextData = telemetryMetadata(context);
    const countryCode = typeof input.geography?.countryCode === 'string' ? input.geography.countryCode.trim().toUpperCase() : undefined;
    const event = await tx.marketingEvent.create({ data: {
      eventName: input.eventName,
      occurredAt,
      clientEventId: input.eventId,
      subjectKey: subject?.subjectKey,
      userId: identity.userId,
      professionalId: identity.professionalId,
      bookingId: input.bookingId,
      leadId: lead?.id,
      campaignId: campaign?.id,
      sessionId: input.sessionId ? hashIdentifier('SESSION', input.sessionId) : undefined,
      anonymousId: input.anonymousId ? hashIdentifier('ANONYMOUS', input.anonymousId) : undefined,
      source: input.source,
      channel: input.channel,
      campaign: input.campaign,
      utmSource: input.utm?.source,
      utmMedium: input.utm?.medium,
      utmCampaign: input.utm?.campaign,
      utmContent: input.utm?.content,
      utmTerm: input.utm?.term,
      device: sanitizeMetadata(input.device),
      appVersion: input.appVersion,
      countryCode,
      geography: sanitizeMetadata(input.geography),
      metadata,
      requestId: contextData.requestId,
      correlationId: contextData.correlationId,
      traceId: contextData.traceId,
    } });
    if (pipelineEnabled && conversionType) {
      await tx.conversion.create({ data: {
        conversionKey: `event:${event.id}:${conversionType}`,
        type: conversionType,
        eventId: event.id,
        leadId: lead?.id,
        campaignId: campaign?.id,
        userId: identity.userId,
        professionalId: identity.professionalId,
        bookingId: input.bookingId,
        occurredAt,
      } });
    }
    if (pipelineEnabled) {
      await tx.outboxEvent.create({ data: {
        aggregateType: 'MarketingEvent',
        aggregateId: event.id,
        eventType: 'growth.event.accepted',
        payload: { eventId: event.id, eventName: event.eventName, conversionType: conversionType || null, campaignLinked: Boolean(campaign), leadLinked: Boolean(lead) },
        metadata: contextData,
      } });
    }
    return { event, duplicate: false, pipelineActive: pipelineEnabled };
  };
  try {
    return await database.$transaction(work);
  } catch (error) {
    if (input.eventId && error?.code === 'P2002') {
      const duplicate = await database.marketingEvent.findUnique({ where: { clientEventId: input.eventId } });
      if (duplicate) {
        assertReplayCompatible(duplicate, input, identity);
        return { event: duplicate, duplicate: true };
      }
    }
    throw error;
  }
};

module.exports = { CONVERSION_EVENTS, assertBookingOwnership, assertReplayCompatible, hashIdentifier, parseOccurredAt, resolveSubject, sanitizeMetadata, trackEvent };
