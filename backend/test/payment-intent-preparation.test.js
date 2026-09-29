const assert = require('node:assert/strict');
const test = require('node:test');

const { persistPreparedPaymentIntent } = require('../src/modules/billing/payments/payment-intent-preparation.service');

const input = Object.freeze({ bookingId: 'booking-1', amountMinor: 10000, currency: 'eur', paymentIntentId: 'pi_1', expectedTransactionId: null });
const payableBooking = { booking: { findUnique: async () => ({ status: 'PENDING' }) } };

test('intent preparation never overwrites a completed capture', async () => {
  let writeCalled = false;
  const db = { ...payableBooking, payment: {
    findUnique: async () => ({ id: 'payment-1', status: 'COMPLETED', transactionId: 'pi_1' }),
    updateMany: async () => { writeCalled = true; },
    createMany: async () => { writeCalled = true; },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.completed, true);
  assert.equal(writeCalled, false);
});

test('intent preparation conditionally advances only a non-terminal payment', async () => {
  let update;
  const db = { ...payableBooking, payment: {
    updateMany: async (operation) => { update = operation; return { count: 1 }; },
    findUnique: async () => ({ id: 'payment-1', status: 'PROCESSING' }),
    createMany: async () => { throw new Error('must not create an existing payment'); },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.completed, false);
  assert.deepEqual(update.where, { bookingId: 'booking-1', transactionId: null, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } });
  assert.equal(update.data.status, 'PROCESSING');
  assert.equal(update.data.amount, '100.00');
  assert.equal(update.data.currency, 'EUR');
});

test('intent preparation cannot replace a different intent installed by a concurrent request', async () => {
  let writes = 0;
  const winner = { id: 'payment-1', status: 'PROCESSING', transactionId: 'pi_winner' };
  const db = { ...payableBooking, payment: {
    findUnique: async () => winner,
    updateMany: async () => { writes += 1; return { count: 1 }; },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'PAYMENT_INTENT_CHANGED');
  assert.equal(result.payment, winner);
  assert.equal(writes, 0);
});

test('retry of the same prepared intent is idempotent and does not replace it', async () => {
  let writes = 0;
  const db = { ...payableBooking, payment: {
    findUnique: async () => ({ id: 'payment-1', status: 'PROCESSING', transactionId: 'pi_1' }),
    updateMany: async () => { writes += 1; return { count: 1 }; },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.completed, false);
  assert.equal(writes, 0);
});

test('replacement of a cancelled prior intent uses the expected prior transaction ID in the write', async () => {
  let update;
  const db = { ...payableBooking, payment: {
    findUnique: async () => ({ id: 'payment-1', status: 'PROCESSING', transactionId: 'pi_cancelled' }),
    updateMany: async (operation) => { update = operation; return { count: 1 }; },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input, expectedTransactionId: 'pi_cancelled' });
  assert.equal(result.completed, false);
  assert.equal(update.where.transactionId, 'pi_cancelled');
});

test('concurrent first creation preserves a completed winning row without aborting the transaction', async () => {
  let reads = 0;
  const db = { ...payableBooking, payment: {
    findUnique: async () => (++reads === 3 ? { id: 'payment-1', status: 'COMPLETED' } : null),
    createMany: async () => ({ count: 0 }),
    updateMany: async () => { throw new Error('must not overwrite a completed winner'); },
  } };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.completed, true);
});

for (const [bookingStatus, paymentStatus] of [['CANCELLED', 'PROCESSING'], ['COMPLETED', 'PROCESSING'], ['PENDING', 'REFUNDED']]) {
  test(`intent persistence rejects ${bookingStatus} Booking / ${paymentStatus} Payment`, async () => {
    let writes = 0;
    const db = {
      booking: { findUnique: async () => ({ status: bookingStatus }) },
      payment: {
        findUnique: async () => ({ id: 'payment-1', status: paymentStatus }),
        updateMany: async () => { writes += 1; },
        createMany: async () => { writes += 1; },
      },
    };
    const result = await persistPreparedPaymentIntent({ db, ...input });
    assert.equal(result.blocked, true);
    assert.equal(writes, 0);
  });
}

test('payment intent locks Payment before Booking and rechecks state inside transaction', async () => {
  const order = [];
  const tx = {
    $queryRaw: async (query) => { order.push(query.strings.join('')); return []; },
    booking: { findUnique: async () => { order.push('booking-read'); return { status: 'CANCELLED' }; } },
    payment: { findUnique: async () => { order.push('payment-read'); return { id: 'payment-1', status: 'PROCESSING' }; } },
  };
  const db = { $transaction: async (callback) => callback(tx) };
  const result = await persistPreparedPaymentIntent({ db, ...input });
  assert.equal(result.blocked, true);
  assert.match(order[1], /Payment.*FOR UPDATE/s);
  assert.match(order[2], /Booking.*FOR UPDATE/s);
  assert.equal(order[3], 'payment-read');
  assert.equal(order[4], 'booking-read');
});
