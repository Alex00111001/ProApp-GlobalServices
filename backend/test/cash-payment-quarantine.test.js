process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const prisma = require('../src/config/prisma');
const stripe = require('../src/config/stripe');
const { confirmCashPayment } = require('../src/controllers/payment.controller');

test('cash payment quarantine returns a stable non-success response without database or provider access', async (t) => {
  const originalFindUnique = prisma.booking.findUnique;
  const originalBookingUpdate = prisma.booking.update;
  const originalPaymentUpsert = prisma.payment.upsert;
  const originalTransaction = prisma.$transaction;
  const originalStripeCreate = stripe.paymentIntents.create;
  const originalStripeRetrieve = stripe.paymentIntents.retrieve;
  let sideEffectCalls = 0;

  const forbiddenCall = async () => {
    sideEffectCalls += 1;
    throw new Error('The quarantined endpoint must not reach a database or payment provider.');
  };

  prisma.booking.findUnique = forbiddenCall;
  prisma.booking.update = forbiddenCall;
  prisma.payment.upsert = forbiddenCall;
  prisma.$transaction = forbiddenCall;
  stripe.paymentIntents.create = forbiddenCall;
  stripe.paymentIntents.retrieve = forbiddenCall;

  t.after(() => {
    prisma.booking.findUnique = originalFindUnique;
    prisma.booking.update = originalBookingUpdate;
    prisma.payment.upsert = originalPaymentUpsert;
    prisma.$transaction = originalTransaction;
    stripe.paymentIntents.create = originalStripeCreate;
    stripe.paymentIntents.retrieve = originalStripeRetrieve;
  });

  const response = { headers: {}, statusCode: null, body: null };
  const res = {
    set(name, value) {
      response.headers[name.toLowerCase()] = value;
      return this;
    },
    status(statusCode) {
      response.statusCode = statusCode;
      return this;
    },
    json(body) {
      response.body = body;
      return body;
    },
  };
  const warnings = [];

  await confirmCashPayment({
    body: { bookingId: 'booking-that-must-not-be-read' },
    user: { id: 'authenticated-user' },
    context: { correlationId: 'cash-quarantine-1' },
    log: { warn: (...args) => warnings.push(args) },
  }, res);

  assert.equal(response.statusCode, 409);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, {
    success: false,
    error: 'Cash payment is unavailable',
    message: 'El pago en efectivo no está disponible',
    code: 'CASH_PAYMENT_DISABLED',
    correlationId: 'cash-quarantine-1',
  });
  assert.equal(sideEffectCalls, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0].code, 'CASH_PAYMENT_DISABLED');
});

test('cash payment enablement fails closed in every environment', () => {
  const { validateEnvironment } = require('../src/config/env');

  assert.equal(validateEnvironment({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  }).cashPaymentEnabled, false);
  assert.throws(() => validateEnvironment({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
    CASH_PAYMENT_ENABLED: 'true',
  }), /quarantined and must remain false/);
});
