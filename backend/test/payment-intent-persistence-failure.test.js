process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const prisma = require('../src/config/prisma');
const stripe = require('../src/config/stripe');
const { createPaymentIntent } = require('../src/controllers/payment.controller');

const BOOKING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INTENT_ID = 'pi_new_persistence_failure';

const responseDouble = () => {
  const response = { statusCode: 200, body: null, forwarded: null };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return body; },
  };
  return { response, res };
};

const request = () => ({
  body: { bookingId: BOOKING_ID }, user: { id: USER_ID },
  context: { requestId: 'persistence-failure', correlationId: 'persistence-failure' },
});

const installProviderAndBooking = (t) => {
  const originalBookingRead = prisma.booking.findUnique;
  const originalTransaction = prisma.$transaction;
  const originalCreate = stripe.paymentIntents.create;
  const originalCancel = stripe.paymentIntents.cancel;
  const calls = { created: 0, cancelled: [], transactions: 0 };
  prisma.booking.findUnique = async () => ({
    id: BOOKING_ID, status: 'PENDING', client: { userId: USER_ID }, payment: null,
    professionalId: 'professional-1', totalPrice: '100.00', currency: 'EUR',
  });
  stripe.paymentIntents.create = async () => {
    calls.created += 1;
    return { id: INTENT_ID, amount: 10_000, currency: 'eur', client_secret: 'test_client_secret' };
  };
  stripe.paymentIntents.cancel = async (id) => {
    calls.cancelled.push(id);
    return { id, status: 'canceled' };
  };
  t.after(() => {
    prisma.booking.findUnique = originalBookingRead;
    prisma.$transaction = originalTransaction;
    stripe.paymentIntents.create = originalCreate;
    stripe.paymentIntents.cancel = originalCancel;
  });
  return calls;
};

const invoke = async () => {
  const { response, res } = responseDouble();
  await createPaymentIntent(request(), res, (error) => { response.forwarded = error; });
  return response;
};

const persistenceTx = ({ bookingStatus = 'PENDING', payment = null, createdCount = 1 } = {}) => ({
  $queryRaw: async () => [],
  booking: { findUnique: async () => ({ id: BOOKING_ID, status: bookingStatus }) },
  payment: {
    findUnique: async () => payment,
    createMany: async () => ({ count: createdCount }),
    updateMany: async () => ({ count: 1 }),
  },
});

test('uncertain persistence retry adopts an in-flight peer intent and never cancels it', async (t) => {
  const calls = installProviderAndBooking(t);
  const persistenceFailure = new Error('Synthetic ambiguous transaction failure');
  const peerPayment = {
    id: 'payment-peer', bookingId: BOOKING_ID, transactionId: INTENT_ID, status: 'PROCESSING',
  };
  prisma.$transaction = async (work) => {
    calls.transactions += 1;
    if (calls.transactions === 1) throw persistenceFailure;
    return work(persistenceTx({ payment: peerPayment }));
  };

  const response = await invoke();

  assert.equal(response.forwarded, null);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.paymentIntentId, INTENT_ID);
  assert.deepEqual(calls.cancelled, []);
  assert.equal(calls.transactions, 2);
});

test('definite terminal retry cleans up only after the recovery transaction releases its locks', async (t) => {
  const calls = installProviderAndBooking(t);
  const persistenceFailure = new Error('Synthetic ambiguous transaction failure');
  let transactionActive = false;
  prisma.$transaction = async (work) => {
    calls.transactions += 1;
    if (calls.transactions === 1) throw persistenceFailure;
    transactionActive = true;
    try {
      return await work(persistenceTx({ bookingStatus: 'CANCELLED' }));
    } finally {
      transactionActive = false;
    }
  };
  stripe.paymentIntents.cancel = async (id) => {
    assert.equal(transactionActive, false, 'provider cleanup must run after the database transaction');
    calls.cancelled.push(id);
    return { id, status: 'canceled' };
  };

  const response = await invoke();

  assert.equal(response.forwarded, null);
  assert.equal(response.statusCode, 409);
  assert.deepEqual(calls.cancelled, [INTENT_ID]);
  assert.equal(calls.transactions, 2);
});

test('unresolved persistence records a durable distinct incident and never cancels the intent', async (t) => {
  const calls = installProviderAndBooking(t);
  const persistenceFailure = new Error('Synthetic ambiguous transaction failure');
  const retryFailure = new Error('Synthetic recovery transaction failure');
  const incidents = [];
  const incidentEvents = [];
  const outbox = [];
  prisma.$transaction = async (work) => {
    calls.transactions += 1;
    if (calls.transactions === 1) throw persistenceFailure;
    if (calls.transactions === 2) throw retryFailure;
    return work({
      incident: {
        createMany: async ({ data, skipDuplicates }) => {
          assert.equal(skipDuplicates, true);
          incidents.push(data);
          return { count: 1 };
        },
        findUnique: async ({ where }) => ({
          id: 'incident-persistence-unknown', status: 'OPEN', severity: 'HIGH', service: 'billing',
          deduplicationKey: where.deduplicationKey, detectedAt: new Date(),
        }),
      },
      incidentEvent: { create: async ({ data }) => { incidentEvents.push(data); } },
      outboxEvent: { create: async ({ data }) => { outbox.push(data); } },
    });
  };

  const response = await invoke();

  assert.equal(response.forwarded, persistenceFailure, 'the original failure remains authoritative');
  assert.deepEqual(calls.cancelled, []);
  assert.equal(calls.transactions, 3);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].deduplicationKey, `payment-intent:persistence-unknown:${INTENT_ID}`);
  assert.equal(incidents[0].severity, 'HIGH');
  assert.equal(incidentEvents[0].eventType, 'PAYMENT_INTENT_PERSISTENCE_UNKNOWN');
  assert.equal(outbox.filter((event) => event.eventType === 'incident.alert_requested').length, 1);
});

test('database-unavailable recovery preserves the original error and never cancels uncertain intent', async (t) => {
  const calls = installProviderAndBooking(t);
  const persistenceFailure = new Error('Synthetic database unavailable');
  prisma.$transaction = async () => {
    calls.transactions += 1;
    throw persistenceFailure;
  };

  const response = await invoke();

  assert.equal(response.forwarded, persistenceFailure);
  assert.deepEqual(calls.cancelled, []);
  assert.equal(calls.transactions, 3, 'initial persistence, recovery, and incident persistence are attempted');
});
