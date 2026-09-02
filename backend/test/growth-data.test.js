process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { eventSchema } = require('../src/validators/growth.validators');
const {
  hashIdentifier,
  parseOccurredAt,
  resolveSubject,
  sanitizeMetadata,
  trackEvent,
  assertReplayCompatible,
  assertBookingOwnership,
} = require('../src/modules/growth/events/event.service');
const { CAMPAIGN_TRANSITIONS, validateWindow } = require('../src/modules/growth/campaign.service');
const { buildFunnel, resolveRange } = require('../src/modules/growth/growth-read.service');

test('event edge contract preserves legacy source identifiers and rejects submitted identity', () => {
  const parsed = eventSchema.parse({ eventName: 'app_opened', anonymousId: 'a', sessionId: 'legacy session' });
  assert.equal(parsed.anonymousId, 'a');
  assert.throws(() => eventSchema.parse({ eventName: 'app_opened', userId: 'spoofed' }));
  assert.throws(() => eventSchema.parse({ eventName: 'app_opened', eventId: 'predictable' }));
  assert.equal(eventSchema.parse({ eventName: 'app_opened', geography: { countryCode: 'es', region: 'MD' } }).geography.countryCode, 'ES');
  assert.throws(() => eventSchema.parse({ eventName: 'app_opened', geography: { countryCode: 'Spain' } }));
});

test('growth metadata strips sensitive keys, coordinates and sensitive string values', () => {
  assert.deepEqual(sanitizeMetadata({
    screen: 'checkout',
    note: 'contact person@example.com',
    latitude: 40.4168,
    nested: { authorization: 'Bearer secret', longitude: -3.7038, step: 2 },
  }), {
    screen: 'checkout',
    note: 'contact [REDACTED_EMAIL]',
    nested: { step: 2 },
  });
});

test('pseudonymous subjects use stable keyed hashes and authenticated identity precedence', () => {
  const trusted = resolveSubject({ anonymousId: 'anonymous-1' }, { userId: 'user-1' });
  assert.deepEqual(trusted, { subjectKey: hashIdentifier('USER', 'user-1'), subjectType: 'USER' });
  assert.notEqual(hashIdentifier('USER', 'user-1', 'secret-a'), hashIdentifier('USER', 'user-1', 'secret-b'));
  assert.equal(resolveSubject({}, {}), null);
});

test('event occurrence and reporting ranges are bounded', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  assert.equal(parseOccurredAt('2026-09-02T11:59:00.000Z', now).toISOString(), '2026-09-02T11:59:00.000Z');
  assert.throws(() => parseOccurredAt('2026-09-02T12:06:00.000Z', now), (error) => error.code === 'EVENT_TIME_IN_FUTURE');
  assert.throws(() => resolveRange({ from: '2025-01-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z' }, now), (error) => error.code === 'GROWTH_RANGE_TOO_LARGE');
  assert.throws(() => resolveRange({ timezone: 'Not/A-Timezone' }, now), (error) => error.code === 'INVALID_TIMEZONE');
});

test('transactional ingestion trusts server identity, projects once and propagates context', async () => {
  const writes = { lead: [], event: [], conversion: [], outbox: [] };
  const lead = { id: 'lead-1', status: 'NEW', convertedAt: null };
  const tx = {
    campaign: { findFirst: async () => ({ id: 'campaign-1', key: 'summer-test', status: 'ACTIVE' }) },
    lead: {
      upsert: async (input) => { writes.lead.push(input); return lead; },
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => ({ id: lead.id, status: 'CONVERTED' }),
    },
    marketingEvent: {
      create: async ({ data }) => { writes.event.push(data); return { id: 'event-db-1', eventName: data.eventName }; },
    },
    conversion: { create: async ({ data }) => { writes.conversion.push(data); return data; } },
    outboxEvent: { create: async ({ data }) => { writes.outbox.push(data); return data; } },
  };
  const client = {
    marketingEvent: { findUnique: async () => null },
    $transaction: async (work) => work(tx),
  };
  const result = await trackEvent({
    eventId: 'event-key-1234567890',
    eventName: 'signup_completed',
    anonymousId: 'raw-anonymous-id',
    utm: { campaign: 'summer-test', source: 'newsletter' },
    geography: { countryCode: 'ES', latitude: 40.4 },
    metadata: { note: 'person@example.com', plan: 'standard' },
  }, { userId: 'trusted-user' }, client, {
    requestId: 'request-1', correlationId: 'correlation-1', traceId: 'a'.repeat(32), spanId: 'b'.repeat(16),
  }, { growthDataEnabled: true });

  assert.equal(result.duplicate, false);
  assert.equal(result.pipelineActive, true);
  assert.equal(writes.event[0].userId, 'trusted-user');
  assert.equal(writes.event[0].campaignId, 'campaign-1');
  assert.equal(writes.event[0].countryCode, 'ES');
  assert.notEqual(writes.event[0].anonymousId, 'raw-anonymous-id');
  assert.equal(writes.event[0].metadata.note, '[REDACTED_EMAIL]');
  assert.equal(writes.event[0].geography.latitude, undefined);
  assert.equal(writes.conversion.length, 1);
  assert.equal(writes.conversion[0].type, 'SIGNUP');
  assert.equal(writes.outbox[0].metadata.correlationId, 'correlation-1');
});

test('client event replay returns the existing event without opening a transaction', async () => {
  let transactions = 0;
  const existing = { id: 'event-existing', eventName: 'app_opened' };
  const client = {
    marketingEvent: { findUnique: async () => existing },
    $transaction: async () => { transactions += 1; },
  };
  const result = await trackEvent({ eventId: 'event-key-1234567890', eventName: 'app_opened' }, {}, client, {}, { growthDataEnabled: true });
  assert.deepEqual(result, { event: existing, duplicate: true });
  assert.equal(transactions, 0);
});

test('client event key reuse with a different payload or actor is rejected', () => {
  const existing = { eventName: 'app_opened', bookingId: null, userId: 'user-1', professionalId: null, anonymousId: null, sessionId: null };
  assert.throws(() => assertReplayCompatible(existing, { eventName: 'signup_started' }, { userId: 'user-1' }), (error) => error.code === 'EVENT_ID_CONFLICT');
  assert.throws(() => assertReplayCompatible(existing, { eventName: 'app_opened' }, { userId: 'user-2' }), (error) => error.code === 'EVENT_ID_CONFLICT');
});

test('booking-linked growth events enforce authenticated ownership', async () => {
  await assert.rejects(() => assertBookingOwnership('booking-1', {}, {}), (error) => error.code === 'EVENT_BOOKING_IDENTITY_REQUIRED');
  const client = { booking: { findUnique: async () => ({ professionalId: 'professional-1', client: { userId: 'user-1' } }) } };
  await assert.doesNotReject(() => assertBookingOwnership('booking-1', { userId: 'user-1' }, client));
  await assert.rejects(() => assertBookingOwnership('booking-1', { userId: 'user-2' }, client), (error) => error.code === 'EVENT_BOOKING_FORBIDDEN');
});

test('production-off pipeline keeps compatible event ingestion without projections', async () => {
  const calls = [];
  const tx = {
    marketingEvent: { create: async ({ data }) => { calls.push(['event', data]); return { id: 'event-1', eventName: data.eventName }; } },
    campaign: { findUnique: async () => { throw new Error('campaign must remain disabled'); } },
    lead: { upsert: async () => { throw new Error('lead must remain disabled'); } },
    conversion: { create: async () => { throw new Error('conversion must remain disabled'); } },
    outboxEvent: { create: async () => { throw new Error('outbox must remain disabled'); } },
  };
  const client = { marketingEvent: { findUnique: async () => null }, $transaction: async (work) => work(tx) };
  const result = await trackEvent({ eventName: 'app_opened', anonymousId: 'legacy-id' }, {}, client, {}, { growthDataEnabled: false });
  assert.equal(result.pipelineActive, false);
  assert.equal(calls.length, 1);
});

test('campaign lifecycle and funnel calculations are deterministic', () => {
  assert.deepEqual(CAMPAIGN_TRANSITIONS.ARCHIVED, []);
  assert.deepEqual(CAMPAIGN_TRANSITIONS.ACTIVE, ['PAUSED', 'ARCHIVED']);
  assert.throws(() => validateWindow('2026-09-03T00:00:00Z', '2026-09-02T00:00:00Z'), (error) => error.code === 'INVALID_CAMPAIGN_WINDOW');
  const funnel = buildFunnel([
    { eventName: 'app_opened', occurrences: 20, subjects: 10 },
    { eventName: 'signup_started', occurrences: 8, subjects: 5 },
  ]);
  assert.equal(funnel[0].rateFromPrevious, '100.00');
  assert.equal(funnel[1].rateFromFirst, '50.00');
  assert.equal(funnel[1].rateFromPrevious, '50.00');
  assert.equal(funnel[2].rateFromPrevious, '0.00');
});
