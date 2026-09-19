const assert = require('node:assert/strict');
const test = require('node:test');

const { persistPreparedPaymentIntent } = require('../src/modules/billing/payments/payment-intent-preparation.service');

const input = Object.freeze({ bookingId: 'booking-1', amountMinor: 10000, currency: 'eur', paymentIntentId: 'pi_1' });

test('intent preparation never overwrites a completed capture', async () => {
  let createCalled = false;
  const db = { payment: {
    updateMany: async () => ({ count: 0 }),
    findUnique: async () => ({ id: 'payment-1', status: 'COMPLETED', transactionId: 'pi_1' }),
    create: async () => { createCalled = true; },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.completed, true);
  assert.equal(createCalled, false);
});

test('intent preparation conditionally advances a non-terminal payment', async () => {
  let update;
  const db = { payment: {
    updateMany: async (operation) => { update = operation; return { count: 1 }; },
    findUnique: async () => { throw new Error('must not read after a successful claim'); },
    create: async () => { throw new Error('must not create after a successful claim'); },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.completed, false);
  assert.deepEqual(update.where, { bookingId: 'booking-1', status: { not: 'COMPLETED' } });
  assert.equal(update.data.status, 'PROCESSING');
  assert.equal(update.data.amount, '100.00');
  assert.equal(update.data.currency, 'EUR');
});

test('concurrent first creation preserves a completed winning row', async () => {
  let reads = 0;
  const db = { payment: {
    updateMany: async () => ({ count: 0 }),
    findUnique: async () => (++reads === 1 ? null : { id: 'payment-1', status: 'COMPLETED' }),
    create: async () => { const error = new Error('unique'); error.code = 'P2002'; throw error; },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.completed, true);
});
