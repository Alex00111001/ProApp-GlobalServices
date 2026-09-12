const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const {
  claimBookingCreation,
  findCompletedBookingCreation,
  parseIdempotencyKey,
  requestDigest,
  schedulingWindow,
} = require('../src/modules/bookings/booking-creation.service');
const {
  BOOKING_READ_INCLUDE,
  PAYMENT_HISTORY_SELECT,
} = require('../src/shared/http/public-projections');
const { assertBookingPaymentSettled, claimBookingTransition } = require('../src/modules/bookings/booking-lifecycle.service');
const { resolveBookingCommercialPolicy } = require('../src/modules/bookings/booking-commercial-policy.service');

test('booking scheduling window is derived from server-side service durations', () => {
  const start = new Date('2030-01-01T10:00:00.000Z');
  const servicesById = new Map([
    ['service-a', { duration: 45 }],
    ['service-b', { duration: 30 }],
  ]);
  const result = schedulingWindow({
    scheduledDate: start.toISOString(),
    bookingServices: [
      { serviceId: 'service-a', quantity: 2 },
      { serviceId: 'service-b', quantity: 1 },
    ],
    servicesById,
    now: new Date('2029-12-31T00:00:00.000Z'),
  });
  assert.equal(result.durationMinutes, 120);
  assert.equal(result.end.toISOString(), '2030-01-01T12:00:00.000Z');
});

test('booking scheduling rejects past starts and invalid service durations', () => {
  assert.throws(() => schedulingWindow({
    scheduledDate: '2029-01-01T10:00:00.000Z',
    bookingServices: [{ serviceId: 'service-a', quantity: 1 }],
    servicesById: new Map([['service-a', { duration: 30 }]]),
    now: new Date('2030-01-01T00:00:00.000Z'),
  }), { code: 'BOOKING_START_NOT_FUTURE' });
  assert.throws(() => schedulingWindow({
    scheduledDate: '2030-01-01T10:00:00.000Z',
    bookingServices: [{ serviceId: 'service-a', quantity: 1 }],
    servicesById: new Map([['service-a', { duration: 0 }]]),
    now: new Date('2029-01-01T00:00:00.000Z'),
  }), { code: 'SERVICE_DURATION_INVALID' });
});

test('booking idempotency keys are bounded and request digests are canonical', () => {
  assert.equal(parseIdempotencyKey('client:booking:1234567890'), 'client:booking:1234567890');
  assert.throws(() => parseIdempotencyKey('short'), { code: 'BOOKING_IDEMPOTENCY_KEY_REQUIRED' });
  assert.equal(requestDigest({ b: 2, a: { d: 4, c: 3 } }), requestDigest({ a: { c: 3, d: 4 }, b: 2 }));
});

const transactionDouble = ({ existing = null, conflict = null } = {}) => {
  const calls = { locks: 0, idempotencyCreates: 0, conflictQueries: 0 };
  return {
    calls,
    tx: {
      $queryRaw: async () => { calls.locks += 1; return [{ locked: null }]; },
      idempotencyRecord: {
        findUnique: async () => existing,
        create: async () => { calls.idempotencyCreates += 1; },
      },
      booking: {
        findFirst: async () => { calls.conflictQueries += 1; return conflict; },
      },
    },
  };
};

test('completed idempotent booking replays before acquiring the schedule lock', async () => {
  const requestHash = requestDigest({ booking: 1 });
  const { tx, calls } = transactionDouble({
    existing: {
      requestHash,
      status: 'COMPLETED',
      responseBody: { bookingId: 'booking-1' },
    },
  });
  const result = await claimBookingCreation({
    tx,
    actorUserId: 'user-1',
    professionalId: 'professional-1',
    idempotencyKey: 'client:booking:1234567890',
    requestHash,
    start: new Date('2030-01-01T10:00:00Z'),
    end: new Date('2030-01-01T11:00:00Z'),
    ttlHours: 24,
  });
  assert.deepEqual(result, { replayBookingId: 'booking-1' });
  assert.deepEqual(calls, { locks: 1, idempotencyCreates: 0, conflictQueries: 0 });
});

test('different payload cannot reuse a booking idempotency key', async () => {
  const { tx } = transactionDouble({
    existing: { requestHash: 'a'.repeat(64), status: 'COMPLETED', responseBody: { bookingId: 'booking-1' } },
  });
  await assert.rejects(() => claimBookingCreation({
    tx,
    actorUserId: 'user-1',
    professionalId: 'professional-1',
    idempotencyKey: 'client:booking:1234567890',
    requestHash: 'b'.repeat(64),
    start: new Date('2030-01-01T10:00:00Z'),
    end: new Date('2030-01-01T11:00:00Z'),
    ttlHours: 24,
  }), { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
});

test('completed booking replay is available before mutable market and address checks', async () => {
  const requestHash = requestDigest({ booking: 1 });
  const client = { idempotencyRecord: { findUnique: async () => ({ status: 'COMPLETED', requestHash, responseBody: { bookingId: 'booking-1' } }) } };
  assert.equal(await findCompletedBookingCreation({
    client, actorUserId: 'user-1', idempotencyKey: 'client:booking:1234567890', requestHash,
  }), 'booking-1');
  await assert.rejects(() => findCompletedBookingCreation({
    client, actorUserId: 'user-1', idempotencyKey: 'client:booking:1234567890', requestHash: 'b'.repeat(64),
  }), { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
});

test('professional schedule claim rejects an overlapping active booking', async () => {
  const { tx, calls } = transactionDouble({ conflict: { id: 'booking-conflict' } });
  await assert.rejects(() => claimBookingCreation({
    tx,
    actorUserId: 'user-1',
    professionalId: 'professional-1',
    idempotencyKey: 'client:booking:1234567890',
    requestHash: 'b'.repeat(64),
    start: new Date('2030-01-01T10:00:00Z'),
    end: new Date('2030-01-01T11:00:00Z'),
    ttlHours: 24,
  }), { code: 'BOOKING_SLOT_CONFLICT' });
  assert.deepEqual(calls, { locks: 2, idempotencyCreates: 1, conflictQueries: 1 });
});

test('booking and payment API projections never select credentials or provider secrets', () => {
  const serialized = JSON.stringify({ BOOKING_READ_INCLUDE, PAYMENT_HISTORY_SELECT });
  assert.doesNotMatch(serialized, /passwordHash|refreshToken|termsVersion|privacyVersion|transactionId|providerChargeId|failedReason/);
  assert.match(serialized, /firstName/);
  assert.match(serialized, /currency/);
});

test('booking scheduling migration is additive and installs the interval invariant', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/202609110001_booking_schedule_integrity/migration.sql'), 'utf8');
  assert.match(sql, /Booking_scheduling_window_valid/);
  assert.match(sql, /Booking_professional_status_schedule_idx/);
  assert.match(sql, /UPDATE "Booking"/);
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i);
});

test('legacy market defaults are removed without rewriting historical records', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/202609120001_remove_legacy_market_defaults/migration.sql'), 'utf8');
  assert.match(sql, /ClientProfile.*country.*DROP DEFAULT/s);
  assert.match(sql, /Booking.*currency.*DROP DEFAULT/s);
  assert.match(sql, /Payment.*currency.*DROP DEFAULT/s);
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|DROP\s+(?:TABLE|COLUMN)/i);
});

test('booking lifecycle permits only the closed professional transition sequence', async () => {
  let current = { id: 'booking-1', status: 'PENDING' };
  const tx = {
    booking: {
      updateMany: async ({ where, data }) => {
        if (current.id !== where.id || current.status !== where.status) return { count: 0 };
        current = { ...current, ...data };
        return { count: 1 };
      },
      findUnique: async () => current,
    },
  };

  assert.equal((await claimBookingTransition({ tx, bookingId: current.id, transition: 'CONFIRM' })).booking.status, 'CONFIRMED');
  assert.equal((await claimBookingTransition({ tx, bookingId: current.id, transition: 'START' })).booking.status, 'IN_PROGRESS');
  assert.equal((await claimBookingTransition({ tx, bookingId: current.id, transition: 'COMPLETE' })).booking.status, 'COMPLETED');
  assert.equal((await claimBookingTransition({ tx, bookingId: current.id, transition: 'COMPLETE' })).duplicate, true);
});

test('booking lifecycle rejects skipped and stale transitions with a conflict', async () => {
  const tx = {
    booking: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => ({ id: 'booking-1', status: 'CONFIRMED' }),
    },
  };
  await assert.rejects(
    () => claimBookingTransition({ tx, bookingId: 'booking-1', transition: 'COMPLETE' }),
    (error) => error.code === 'BOOKING_TRANSITION_CONFLICT' && error.statusCode === 409 && error.expectedStatus === 'IN_PROGRESS',
  );
});

test('professional rejection is an explicit idempotent pending-to-cancelled transition', async () => {
  let current = { id: 'booking-1', status: 'PENDING' };
  const tx = { booking: {
    updateMany: async ({ where, data }) => {
      if (current.status !== where.status) return { count: 0 };
      current = { ...current, ...data };
      return { count: 1 };
    },
    findUnique: async () => current,
  } };
  const first = await claimBookingTransition({ tx, bookingId: current.id, transition: 'REJECT', data: { cancelledBy: 'PROFESSIONAL' } });
  const replay = await claimBookingTransition({ tx, bookingId: current.id, transition: 'REJECT', isDuplicate: (booking) => booking.cancelledBy === 'PROFESSIONAL' });
  assert.equal(first.booking.status, 'CANCELLED');
  assert.equal(first.booking.cancelledBy, 'PROFESSIONAL');
  assert.equal(replay.duplicate, true);

  current = { id: 'booking-2', status: 'CANCELLED', cancelledBy: 'CLIENT' };
  await assert.rejects(
    () => claimBookingTransition({ tx, bookingId: current.id, transition: 'REJECT', isDuplicate: (booking) => booking.cancelledBy === 'PROFESSIONAL' }),
    { code: 'BOOKING_TRANSITION_CONFLICT' },
  );
});

test('booking completion requires durable settled-payment evidence', () => {
  assert.equal(assertBookingPaymentSettled({ id: 'payment-1', status: 'COMPLETED' }).id, 'payment-1');
  assert.throws(() => assertBookingPaymentSettled(null), { code: 'BOOKING_PAYMENT_NOT_SETTLED', statusCode: 409 });
  assert.throws(() => assertBookingPaymentSettled({ id: 'payment-1', status: 'PENDING', method: 'CASH' }), { code: 'BOOKING_PAYMENT_NOT_SETTLED' });
});

test('market-authoritative booking pricing captures versioned policy evidence', async () => {
  const now = new Date('2030-01-01T00:00:00.000Z');
  const pricingPolicy = {
    id: 'pricing-1', key: 'es-standard', version: 3, currency: 'EUR',
    rules: { clientPlatformFeeBasisPoints: 800, professionalCommissionBasisPoints: 1500 },
  };
  const client = {
    market: { findUnique: async () => ({ code: 'ES' }) },
    pricingPolicy: { findFirst: async (query) => {
      assert.equal(query.where.marketId, 'market-1');
      assert.equal(query.where.status, 'ACTIVE');
      return pricingPolicy;
    } },
  };
  const result = await resolveBookingCommercialPolicy({
    client, marketId: 'market-1', now, marketsEnabled: true,
    resolvePolicy: async () => ({
      market: { id: 'market-1', code: 'ES', currencyCode: 'EUR' },
      policy: { version: 7, schemaDigest: 'd'.repeat(64), currencyPolicy: { currency: 'EUR' } },
    }),
  });
  assert.equal(result.currency, 'EUR');
  assert.equal(result.pricingPolicyId, 'pricing-1');
  assert.equal(result.platformFeeBasisPoints, 800);
  assert.equal(result.commissionBasisPoints, 1500);
  assert.equal(result.snapshot.source, 'MARKET_PRICING_POLICY');
  assert.equal(result.snapshot.market.policyVersion, 7);
  assert.equal(result.snapshot.pricingPolicy.version, 3);
  assert.match(result.snapshot.pricingPolicy.rulesDigest, /^[a-f0-9]{64}$/);
});

test('market booking pricing fails closed on missing, malformed, or mismatched policy', async () => {
  const baseClient = {
    market: { findUnique: async () => ({ code: 'ES' }) },
    pricingPolicy: { findFirst: async () => null },
  };
  const resolvePolicy = async () => ({
    market: { id: 'market-1', code: 'ES', currencyCode: 'EUR' },
    policy: { version: 1, schemaDigest: 'd'.repeat(64), currencyPolicy: { currency: 'EUR' } },
  });
  await assert.rejects(
    () => resolveBookingCommercialPolicy({ client: baseClient, marketId: 'market-1', marketsEnabled: true, resolvePolicy }),
    { code: 'PRICING_POLICY_UNAVAILABLE' },
  );
  await assert.rejects(
    () => resolveBookingCommercialPolicy({
      client: { ...baseClient, pricingPolicy: { findFirst: async () => ({ id: 'pricing-1', key: 'es', version: 1, currency: 'USD', rules: { clientPlatformFeeBasisPoints: 0, professionalCommissionBasisPoints: 1000 } }) } },
      marketId: 'market-1', marketsEnabled: true, resolvePolicy,
    }),
    { code: 'PRICING_POLICY_CURRENCY_MISMATCH' },
  );
});
