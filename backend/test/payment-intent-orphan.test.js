process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const prisma = require('../src/config/prisma');
const stripe = require('../src/config/stripe');
const { createPaymentIntent } = require('../src/controllers/payment.controller');

const BOOKING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INTENT_ID = 'pi_new_orphan_test';

const runIntentRace = async (t, { racedBookingStatus = 'PENDING', racedPaymentStatus = null, cancelFails = false }) => {
  const originalRead = prisma.booking.findUnique;
  const originalTransaction = prisma.$transaction;
  const originalCreate = stripe.paymentIntents.create;
  const originalCancel = stripe.paymentIntents.cancel;
  const calls = { created: 0, cancelled: [], transactions: 0, paymentWrites: 0, incidents: [], incidentEvents: [], outbox: [] };
  prisma.booking.findUnique = async () => ({
    id: BOOKING_ID, status: 'PENDING', client: { userId: USER_ID },
    totalPrice: '100.00', currency: 'EUR', professionalId: 'professional-1', payment: null,
  });
  stripe.paymentIntents.create = async () => {
    calls.created += 1;
    return { id: INTENT_ID, amount: 10_000, currency: 'eur', client_secret: 'test_client_secret' };
  };
  stripe.paymentIntents.cancel = async (id) => {
    calls.cancelled.push(id);
    if (cancelFails) throw new Error('Provider cancellation unavailable');
    return { id, status: 'canceled' };
  };
  prisma.$transaction = async (work) => {
    calls.transactions += 1;
    return work({
      $queryRaw: async () => [{ id: BOOKING_ID }],
      booking: { findUnique: async () => ({ id: BOOKING_ID, status: racedBookingStatus }) },
      payment: {
        findUnique: async () => racedPaymentStatus ? {
          id: 'payment-race', bookingId: BOOKING_ID, status: racedPaymentStatus,
          transactionId: 'pi_winning_capture',
        } : null,
        createMany: async () => { calls.paymentWrites += 1; return { count: 1 }; },
        updateMany: async () => { calls.paymentWrites += 1; return { count: 1 }; },
      },
      incident: {
        createMany: async ({ data, skipDuplicates }) => {
          assert.equal(skipDuplicates, true);
          calls.incidents.push(data);
          return { count: 1 };
        },
        findUnique: async ({ where }) => ({
          id: 'incident-orphan-1', status: 'OPEN', severity: 'HIGH', service: 'billing',
          deduplicationKey: where.deduplicationKey, detectedAt: new Date(),
        }),
      },
      incidentEvent: { create: async ({ data }) => { calls.incidentEvents.push(data); } },
      outboxEvent: { create: async ({ data }) => { calls.outbox.push(data); } },
      auditLog: { create: async () => {} },
    });
  };
  t.after(() => {
    prisma.booking.findUnique = originalRead;
    prisma.$transaction = originalTransaction;
    stripe.paymentIntents.create = originalCreate;
    stripe.paymentIntents.cancel = originalCancel;
  });
  const response = { statusCode: 200, body: null, forwarded: null };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return body; },
  };
  await createPaymentIntent({
    body: { bookingId: BOOKING_ID }, user: { id: USER_ID },
    context: { requestId: 'orphan-test', correlationId: 'orphan-test' },
  }, res, (error) => { response.forwarded = error; });
  return { calls, response };
};

for (const [name, race] of [
  ['cancelled booking', { racedBookingStatus: 'CANCELLED' }],
  ['completed payment', { racedPaymentStatus: 'COMPLETED' }],
]) {
  test(`new Stripe intent is cancelled when persistence loses race to ${name}`, async (t) => {
    const { calls, response } = await runIntentRace(t, race);
    assert.equal(response.forwarded, null);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.success, false);
    assert.equal(calls.created, 1);
    assert.deepEqual(calls.cancelled, [INTENT_ID]);
    assert.equal(calls.paymentWrites, 0);
    assert.equal(calls.incidents.length, 0);
  });
}

test('failed orphan cleanup records a durable incident and alert before returning conflict', async (t) => {
  const { calls, response } = await runIntentRace(t, { racedBookingStatus: 'CANCELLED', cancelFails: true });
  assert.equal(response.forwarded, null);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.success, false);
  assert.deepEqual(calls.cancelled, [INTENT_ID]);
  assert.ok(calls.transactions >= 2, 'incident evidence must be committed separately from rejected persistence');
  assert.equal(calls.incidents.length, 1);
  assert.equal(calls.incidents[0].severity, 'HIGH');
  assert.equal(calls.incidents[0].service, 'billing');
  assert.equal(calls.incidentEvents.length, 1);
  assert.equal(calls.incidentEvents[0].incidentId, 'incident-orphan-1');
  assert.equal(calls.outbox.filter((event) => event.eventType === 'incident.alert_requested').length, 1);
  assert.equal(calls.paymentWrites, 0);
});
