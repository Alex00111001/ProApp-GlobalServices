// Acceptance test, deliberately separate from the existing integration suite.
// Real controller + real PostgreSQL + real capture service; only provider I/O is replaced.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

const database = new URL(process.env.DATABASE_URL || 'http://not-configured.invalid');
if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true' || process.env.NODE_ENV !== 'test'
  || !['localhost', '127.0.0.1'].includes(database.hostname)
  || database.pathname !== '/homeservices_ci') {
  throw new Error('API financial acceptance requires the isolated loopback homeservices_ci database and explicit test mode.');
}

const prisma = require('../../src/config/prisma');
const stripe = require('../../src/config/stripe');
const { createPaymentIntent } = require('../../src/controllers/payment.controller');
const { applySuccessfulPayment } = require('../../src/modules/billing/payments/payment-capture.service');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const captureClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

test.after(async () => {
  await Promise.all([prisma.$disconnect(), captureClient.$disconnect()]);
});

test('API v1 acceptance: an in-flight intent request cannot roll back a completed capture', async () => {
  const run = randomUUID();
  const userId = randomUUID();
  const clientId = randomUUID();
  const bookingId = randomUUID();
  const paymentId = randomUUID();
  const intentId = `pi_contract${run.replaceAll('-', '')}`;
  await prisma.user.create({ data: {
    id: userId, email: `contract-${run}@example.invalid`, phone: `+3491${run.replaceAll('-', '').slice(0, 10)}`,
    passwordHash: 'unusable-contract-fixture', firstName: 'Contract', lastName: 'Fixture', role: 'CLIENT',
  } });
  await prisma.clientProfile.create({ data: { id: clientId, userId, country: 'ES', paymentMethods: [] } });
  await prisma.booking.create({ data: {
    id: bookingId, clientId, scheduledDate: new Date('2030-01-01T10:00:00Z'), endDate: new Date('2030-01-01T11:00:00Z'),
    address: 'Synthetic contract fixture', city: 'Madrid', state: 'Madrid', postalCode: '28001',
    totalPrice: '100.00', serviceAmount: '100.00', platformFee: '0.00',
    professionalCommission: '0.00', professionalEarnings: '100.00', currency: 'EUR', status: 'PENDING',
  } });
  await prisma.payment.create({ data: {
    id: paymentId, bookingId, amount: '100.00', currency: 'EUR', method: 'STRIPE', status: 'PROCESSING', transactionId: intentId,
  } });

  const capture = () => captureClient.$transaction((tx) => applySuccessfulPayment({
    tx, bookingId, providerTransactionId: intentId, providerAmountMinor: 10000,
    providerCurrency: 'eur', source: 'CONTRACT_ACCEPTANCE', ledgerEnabled: false,
  }));
  const originalRetrieve = stripe.paymentIntents.retrieve;
  const originalCreate = stripe.paymentIntents.create;
  let captureCommitted = false;
  stripe.paymentIntents.create = async () => { throw new Error('This scenario must never create a provider intent.'); };
  stripe.paymentIntents.retrieve = async (id) => {
    assert.equal(id, intentId);
    // The controller has already read PROCESSING. Capture on an independent connection commits now.
    await capture();
    captureCommitted = true;
    assert.equal((await captureClient.payment.findUnique({ where: { id: paymentId } })).status, 'COMPLETED');
    return { id: intentId, amount: 10000, currency: 'eur', status: 'succeeded', client_secret: null };
  };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let failure;
  try {
    await createPaymentIntent({ body: { bookingId }, user: { id: userId }, log: { error() {} } }, res, (error) => { failure = error; });
    assert.equal(failure, undefined);
    assert.equal(captureCommitted, true);
    const afterIntent = await captureClient.payment.findUnique({ where: { id: paymentId } });
    const replay = await capture();
    const eventCount = await captureClient.outboxEvent.count({ where: { aggregateId: paymentId, eventType: 'payment.completed' } });
    assert.deepEqual({ statusAfterIntent: afterIntent.status, replayDuplicate: replay.duplicate, completionEvents: eventCount }, {
      statusAfterIntent: 'COMPLETED', replayDuplicate: true, completionEvents: 1,
    }, 'Intent preparation must preserve capture state and exactly-once completion effects.');
  } finally {
    stripe.paymentIntents.retrieve = originalRetrieve;
    stripe.paymentIntents.create = originalCreate;
    // Preserve immutable audit/outbox evidence. The CI service owns and discards this isolated database.
  }
});
