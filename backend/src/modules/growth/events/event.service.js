const { isKnownEvent } = require('./event-taxonomy');

const BLOCKED_KEYS = /password|token|authorization|secret|api[_-]?key|card|cvv/i;

const sanitizeMetadata = (value, depth = 0) => {
  if (depth > 4 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !BLOCKED_KEYS.test(key))
      .slice(0, 100)
      .map(([key, item]) => [key, sanitizeMetadata(item, depth + 1)])
  );
};

const trackEvent = async (input, identity = {}, client) => {
  const database = client || require('../../../config/prisma');
  if (!isKnownEvent(input.eventName)) throw Object.assign(new Error('Unknown event name'), { code: 'UNKNOWN_EVENT' });
  const metadata = sanitizeMetadata(input.metadata || {});
  if (JSON.stringify(metadata).length > 16_384) throw Object.assign(new Error('Event metadata is too large'), { code: 'METADATA_TOO_LARGE' });
  return database.marketingEvent.create({
    data: {
      eventName: input.eventName,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      userId: identity.userId,
      professionalId: identity.professionalId,
      bookingId: input.bookingId,
      sessionId: input.sessionId,
      anonymousId: input.anonymousId,
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
      geography: sanitizeMetadata(input.geography),
      metadata,
    },
  });
};

module.exports = { sanitizeMetadata, trackEvent };
