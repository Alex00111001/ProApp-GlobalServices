process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const prisma = require('../src/config/prisma');
const stripe = require('../src/config/stripe');
const { applySuccessfulPayment } = require('../src/modules/billing/payments/payment-capture.service');
const { processStripeEvent } = require('../src/modules/billing/payments/stripe-webhook.service');
const { createPaymentIntent } = require('../src/controllers/payment.controller');

const BOOKING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const captureDouble = (initialStatus, method = 'STRIPE') => {
  const calls = { bookingWrites: 0, paymentClaims: 0, outbox: [], audit: 0, notification: 0, incident: 0, incidentEvent: 0 };
  const booking = { id: BOOKING_ID, professionalId: 'professional-1', status: initialStatus };
  const payment = {
    id: 'payment-1', bookingId: BOOKING_ID, amount: '100.00', currency: 'EUR',
    status: 'PROCESSING', method, transactionId: 'pi_booking_coupling',
  };
  let incident = null;
  const tx = {
    booking: {
      findUnique: async () => ({ ...booking }),
      update: async ({ data }) => { calls.bookingWrites += 1; Object.assign(booking, data); return { ...booking }; },
      updateMany: async ({ data }) => { calls.bookingWrites += 1; Object.assign(booking, data); return { count: 1 }; },
    },
    payment: {
      findUnique: async () => ({ ...payment }),
      updateMany: async ({ data }) => {
        if (payment.status === 'COMPLETED') return { count: 0 };
        calls.paymentClaims += 1;
        Object.assign(payment, data);
        return { count: 1 };
      },
    },
    professionalProfile: { findUnique: async () => ({ userId: 'professional-user-1' }) },
    incident: { findUnique: async () => incident, createMany: async ({ data }) => {
      calls.incident += 1;
      incident = { ...data, id: 'incident-1', status: 'OPEN', detectedAt: new Date() };
      return { count: 1 };
    } },
    incidentEvent: { create: async () => { calls.incidentEvent += 1; } },
    outboxEvent: { create: async ({ data }) => { calls.outbox.push(data.eventType); } },
    auditLog: { create: async () => { calls.audit += 1; } },
    notification: { create: async () => { calls.notification += 1; } },
  };
  const capture = () => applySuccessfulPayment({
    tx, bookingId: BOOKING_ID, providerTransactionId: payment.transactionId,
    providerAmountMinor: 10_000, providerCurrency: 'EUR', source: 'TEST', ledgerEnabled: false,
  });
  return { booking, payment, calls, capture };
};

for (const status of ['PENDING', 'CONFIRMED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED']) {
  test(`captured payment preserves ${status} Booking state; only professional acceptance confirms`, async () => {
    const { booking, payment, calls, capture } = captureDouble(status);
    const first = await capture();
    assert.equal(first.duplicate, false);
    assert.equal(payment.status, 'COMPLETED', 'provider capture remains durable');
    assert.equal(booking.status, status, 'payment capture cannot act as professional acceptance');
    assert.equal(first.booking.status, status);
    assert.deepEqual(calls.outbox, status === 'CANCELLED'
      ? ['payment.completed', 'incident.alert_requested', 'payment.captured_after_cancellation'] : ['payment.completed']);
    assert.equal(calls.incident, status === 'CANCELLED' ? 1 : 0);
    assert.equal(calls.incidentEvent, status === 'CANCELLED' ? 1 : 0);
    assert.deepEqual({ audit: calls.audit, notification: calls.notification }, { audit: status === 'CANCELLED' ? 2 : 1, notification: 1 });
  });
}

test('late capture after cancellation preserves financial evidence and replay does not repeat effects', async () => {
  const { booking, payment, calls, capture } = captureDouble('CANCELLED');
  const first = await capture();
  const replay = await capture();
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(booking.status, 'CANCELLED');
  assert.equal(payment.status, 'COMPLETED');
  assert.deepEqual(calls.outbox, ['payment.completed', 'incident.alert_requested', 'payment.captured_after_cancellation']);
  assert.equal(calls.incident, 1);
  assert.equal(calls.incidentEvent, 1);
  assert.deepEqual({ paymentClaims: calls.paymentClaims, audit: calls.audit, notification: calls.notification },
    { paymentClaims: 1, audit: 2, notification: 1 });
});

test('Stripe capture cannot reactivate historical CASH as a payable method', async () => {
  const { booking, payment, calls, capture } = captureDouble('PENDING', 'CASH');
  await assert.rejects(capture, { code: 'PAYMENT_METHOD_CONFLICT', statusCode: 409 });
  assert.equal(booking.status, 'PENDING');
  assert.equal(payment.status, 'PROCESSING');
  assert.equal(calls.paymentClaims, 0);
  assert.deepEqual(calls.outbox, []);
});

for (const [bookingStatus, paymentStatus] of [
  ['CANCELLED', 'PROCESSING'], ['COMPLETED', 'PROCESSING'], ['PENDING', 'REFUNDED'],
]) {
  test(`payment intent rejects Booking ${bookingStatus} / Payment ${paymentStatus} before provider access`, async (t) => {
    const originalFindUnique = prisma.booking.findUnique;
    const originalCreate = stripe.paymentIntents.create;
    const originalRetrieve = stripe.paymentIntents.retrieve;
    let providerCalls = 0;
    prisma.booking.findUnique = async () => ({
      id: BOOKING_ID, status: bookingStatus, totalPrice: '100.00', currency: 'EUR',
      client: { userId: USER_ID }, professionalId: 'professional-1',
      payment: { status: paymentStatus, transactionId: 'pi_existing' },
    });
    stripe.paymentIntents.create = async () => { providerCalls += 1; throw new Error('Provider must not be called'); };
    stripe.paymentIntents.retrieve = async () => { providerCalls += 1; throw new Error('Provider must not be called'); };
    t.after(() => {
      prisma.booking.findUnique = originalFindUnique;
      stripe.paymentIntents.create = originalCreate;
      stripe.paymentIntents.retrieve = originalRetrieve;
    });
    const response = { statusCode: 200, body: null };
    const res = {
      status(code) { response.statusCode = code; return this; },
      json(body) { response.body = body; return body; },
    };
    let forwarded = null;
    await createPaymentIntent({ body: { bookingId: BOOKING_ID }, user: { id: USER_ID }, context: {} },
      res, (error) => { forwarded = error; });
    assert.equal(forwarded, null);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.success, false);
    assert.equal(providerCalls, 0);
  });
}

const failedWebhookDouble = (initialStatus, concurrentStatus = null, replaceIntentAfterRead = false) => {
  const staleProviderIntentId = 'pi_old';
  const payment = { id: 'payment-1', bookingId: BOOKING_ID, transactionId: replaceIntentAfterRead ? staleProviderIntentId : 'pi_booking_coupling', status: initialStatus };
  const records = new Map();
  const calls = { paymentClaims: 0, failedEvents: 0 };
  const client = {
    integrationEvent: {
      create: async ({ data }) => {
        if (records.has(data.providerEventId)) {
          throw Object.assign(new Error('Duplicate provider event'), { code: 'P2002' });
        }
        const record = { id: data.providerEventId, status: 'RECEIVED' };
        records.set(data.providerEventId, record);
        return record;
      },
      findUnique: async ({ where }) => records.get(where.provider_providerEventId.providerEventId),
      updateMany: async ({ where, data }) => {
        const record = records.get(where.id);
        if (record.status === 'PROCESSED') return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => Object.assign(records.get(where.id), data),
    },
    $transaction: async (work) => work({
      payment: {
        findUnique: async () => {
          const snapshot = { ...payment };
          if (concurrentStatus) payment.status = concurrentStatus;
          if (replaceIntentAfterRead) payment.transactionId = 'pi_new';
          return snapshot;
        },
        updateMany: async ({ where, data }) => {
          assert.equal(where.id, payment.id);
          if (replaceIntentAfterRead) assert.equal(where.transactionId, staleProviderIntentId);
          assert.deepEqual(where.status, { in: ['PENDING', 'PROCESSING'] });
          calls.paymentClaims += 1;
          if (!where.status.in.includes(payment.status) || (where.transactionId && where.transactionId !== payment.transactionId)) return { count: 0 };
          Object.assign(payment, data);
          return { count: 1 };
        },
      },
      outboxEvent: { create: async ({ data }) => {
        assert.equal(data.eventType, 'payment.failed');
        calls.failedEvents += 1;
      } },
      integrationEvent: { update: async ({ where, data }) => Object.assign(records.get(where.id), data) },
    }),
  };
  const deliver = (eventId) => processStripeEvent({
    event: {
      id: eventId, type: 'payment_intent.payment_failed',
      data: { object: {
        id: replaceIntentAfterRead ? staleProviderIntentId : payment.transactionId, metadata: { bookingId: BOOKING_ID },
        last_payment_error: { message: 'Card declined' },
      } },
    },
  }, client);
  return { payment, calls, deliver };
};

for (const status of ['COMPLETED', 'REFUNDED']) {
  test(`late failed-payment webhook cannot degrade ${status} or emit payment.failed`, async () => {
    const { payment, calls, deliver } = failedWebhookDouble(status);
    assert.equal((await deliver(`evt_late_${status}`)).status, 'PROCESSED');
    assert.equal(payment.status, status);
    assert.deepEqual(calls, { paymentClaims: 0, failedEvents: 0 });
  });
}

for (const status of ['COMPLETED', 'REFUNDED']) {
  test(`failed-payment CAS cannot overwrite concurrent ${status} transition`, async () => {
    const { payment, calls, deliver } = failedWebhookDouble('PROCESSING', status);
    assert.equal((await deliver(`evt_race_${status}`)).status, 'PROCESSED');
    assert.equal(payment.status, status);
    assert.deepEqual(calls, { paymentClaims: 1, failedEvents: 0 });
  });
}

test('PROCESSING payment fails once across distinct failed-payment events and event replay', async () => {
  const { payment, calls, deliver } = failedWebhookDouble('PROCESSING');
  assert.equal((await deliver('evt_failed_first')).status, 'PROCESSED');
  assert.equal((await deliver('evt_failed_second')).status, 'PROCESSED');
  assert.equal((await deliver('evt_failed_first')).duplicate, true);
  assert.equal(payment.status, 'FAILED');
  assert.equal(calls.paymentClaims, 1);
  assert.equal(calls.failedEvents, 1);
});

test('stale failed-payment webhook cannot mutate a newly prepared intent or emit payment.failed', async () => {
  const { payment, calls, deliver } = failedWebhookDouble('PROCESSING', null, true);
  assert.equal((await deliver('evt_failed_stale_intent')).status, 'PROCESSED');
  assert.equal(payment.transactionId, 'pi_new');
  assert.equal(payment.status, 'PROCESSING');
  assert.deepEqual(calls, { paymentClaims: 1, failedEvents: 0 });
});
