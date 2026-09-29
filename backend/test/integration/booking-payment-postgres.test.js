require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;

if (process.env.NODE_ENV === 'production') {
  throw new Error('Database integration tests refuse to run with NODE_ENV=production.');
}
if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') {
  throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true to run database integration tests deliberately.');
}
if (!process.env.DIRECT_URL) {
  throw new Error('DIRECT_URL must point to the isolated PostgreSQL test database.');
}
const isolatedUrl = new URL(process.env.DIRECT_URL);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(isolatedUrl.hostname)
  || isolatedUrl.pathname !== '/homeservices_ci') {
  throw new Error('Booking payment tests require an isolated loopback homeservices_ci database.');
}

process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { applySuccessfulPayment } = require('../../src/modules/billing/payments/payment-capture.service');
const { claimBookingTransition } = require('../../src/modules/bookings/booking-lifecycle.service');
const { decimalToMinor } = require('../../src/modules/billing/pricing/pricing.service');
const { deleteFixtureOutbox } = require('./helpers/outbox-cleanup');

const createPrisma = () => new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
});
const prisma = createPrisma();
const runId = randomUUID();
const fixtures = [];
const usingClients = async (count, callback) => {
  const clients = Array.from({ length: count }, createPrisma);
  try {
    return await callback(clients);
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
};

const createFixture = async ({ status = 'PENDING' } = {}) => {
  const fixture = {
    userId: randomUUID(),
    professionalUserId: randomUUID(),
    clientId: randomUUID(),
    professionalId: randomUUID(),
    bookingId: randomUUID(),
    paymentId: randomUUID(),
    paymentIntentId: `pi_booking_integration_${randomUUID().replaceAll('-', '')}`,
  };
  fixtures.push(fixture);

  await prisma.user.createMany({
    data: [
      {
        id: fixture.userId,
        email: `booking-client-${fixture.userId}@example.invalid`,
        phone: `+3491${fixture.userId.replaceAll('-', '').slice(0, 9)}`,
        passwordHash: 'integration-only',
        firstName: 'Booking',
        lastName: 'Client',
        role: 'CLIENT',
      },
      {
        id: fixture.professionalUserId,
        email: `booking-pro-${fixture.professionalUserId}@example.invalid`,
        phone: `+3492${fixture.professionalUserId.replaceAll('-', '').slice(0, 9)}`,
        passwordHash: 'integration-only',
        firstName: 'Booking',
        lastName: 'Professional',
        role: 'PROFESSIONAL',
      },
    ],
  });
  await prisma.clientProfile.create({
    data: { id: fixture.clientId, userId: fixture.userId, country: 'ES', paymentMethods: [] },
  });
  await prisma.professionalProfile.create({
    data: { id: fixture.professionalId, userId: fixture.professionalUserId, status: 'APPROVED' },
  });
  await prisma.booking.create({
    data: {
      id: fixture.bookingId,
      clientId: fixture.clientId,
      professionalId: fixture.professionalId,
      status,
      ...(status === 'CANCELLED' ? {
        cancelledBy: 'CLIENT',
        cancellationReason: 'Integration cancellation race',
        cancelledAt: new Date(),
      } : {}),
      scheduledDate: new Date(Date.now() + 86_400_000),
      endDate: new Date(Date.now() + 90_000_000),
      address: 'Integration test only',
      city: 'Madrid',
      state: 'Madrid',
      postalCode: '28001',
      totalPrice: '108.00',
      serviceAmount: '100.00',
      platformFee: '8.00',
      professionalCommission: '15.00',
      professionalEarnings: '85.00',
      currency: 'EUR',
      pricingSnapshot: { version: 1, source: 'booking-payment-integration-test' },
    },
  });
  await prisma.payment.create({
    data: {
      id: fixture.paymentId,
      bookingId: fixture.bookingId,
      amount: '108.00',
      currency: 'EUR',
      status: 'PROCESSING',
      method: 'STRIPE',
      transactionId: fixture.paymentIntentId,
    },
  });
  return fixture;
};

const capture = (client, fixture, onTransactionStart) => client.$transaction(async (tx) => {
  if (onTransactionStart) {
    const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
    onTransactionStart(Number(pid));
  }
  return applySuccessfulPayment({
    tx,
    bookingId: fixture.bookingId,
    providerTransactionId: fixture.paymentIntentId,
    providerChargeId: null,
    providerAmountMinor: 10_800,
    providerCurrency: 'eur',
    source: 'POSTGRES_BOOKING_PAYMENT_INTEGRATION_TEST',
    ledgerEnabled: true,
    requestContext: { correlationId: `booking-payment-${runId}` },
  });
}, { timeout: 15_000 });

const assertCapturedEvidence = async (fixture) => {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  assert.equal(payment.status, 'COMPLETED');
  assert.equal(await prisma.ledgerTransaction.count({ where: { paymentId: fixture.paymentId } }), 1);
  assert.equal(await prisma.outboxEvent.count({
    where: { aggregateId: fixture.paymentId, eventType: 'payment.completed' },
  }), 1);
  assert.equal(await prisma.auditLog.count({
    where: { resourceId: fixture.paymentId, action: 'payment.completed' },
  }), 1);

  const entries = await prisma.ledgerEntry.findMany({
    where: { transaction: { paymentId: fixture.paymentId } },
  });
  const debit = entries.filter((entry) => entry.direction === 'DEBIT')
    .reduce((sum, entry) => sum + decimalToMinor(entry.amount), 0);
  const credit = entries.filter((entry) => entry.direction === 'CREDIT')
    .reduce((sum, entry) => sum + decimalToMinor(entry.amount), 0);
  assert.equal(debit, 10_800);
  assert.equal(credit, debit);
};

const cleanup = async () => {
  for (const fixture of fixtures) {
    const incident = await prisma.incident.findUnique({
      where: { deduplicationKey: `payment:cancelled-booking:${fixture.paymentId}` }, select: { id: true },
    });
    if (incident) {
      await deleteFixtureOutbox(prisma, { aggregateId: incident.id });
      await prisma.incidentEvent.deleteMany({ where: { incidentId: incident.id } });
      await prisma.incident.delete({ where: { id: incident.id } });
    }
    const ledgerTransactions = await prisma.ledgerTransaction.findMany({
      where: { OR: [{ bookingId: fixture.bookingId }, { paymentId: fixture.paymentId }] },
      select: { id: true },
    }).catch(() => []);
    const transactionIds = ledgerTransactions.map((item) => item.id);
    if (transactionIds.length) {
      await prisma.ledgerEntry.deleteMany({ where: { transactionId: { in: transactionIds } } });
      await prisma.ledgerTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    }
    const refunds = await prisma.refund.findMany({
      where: { bookingId: fixture.bookingId }, select: { id: true },
    });
    const refundIds = refunds.map((refund) => refund.id);
    if (refundIds.length) {
      await prisma.refundDecision.deleteMany({ where: { refundId: { in: refundIds } } });
      await deleteFixtureOutbox(prisma, { aggregateId: { in: refundIds } });
      await prisma.auditLog.deleteMany({ where: { resourceId: { in: refundIds } } });
      await prisma.refund.deleteMany({ where: { id: { in: refundIds } } });
    }
    await prisma.notification.deleteMany({ where: { bookingId: fixture.bookingId } });
    await deleteFixtureOutbox(prisma, { aggregateId: { in: [fixture.paymentId, fixture.bookingId] } });
    await prisma.auditLog.deleteMany({ where: { resourceId: fixture.paymentId } });
    await prisma.payment.deleteMany({ where: { id: fixture.paymentId } });
    await prisma.booking.deleteMany({ where: { id: fixture.bookingId } });
    await prisma.clientProfile.deleteMany({ where: { id: fixture.clientId } });
    await prisma.professionalProfile.deleteMany({ where: { id: fixture.professionalId } });
    await prisma.user.deleteMany({ where: { id: { in: [fixture.userId, fixture.professionalUserId] } } });
  }
};

test.after(async () => {
  try {
    await cleanup();
  } finally {
    await prisma.$disconnect();
  }
});

test('PostgreSQL capture preserves booking lifecycle, including late capture and replay', async () => {
  const existingAccounts = new Set((await prisma.ledgerAccount.findMany({
    where: { currency: 'EUR' }, select: { id: true },
  })).map((account) => account.id));

  try {
    const pending = await createFixture();
    const results = await usingClients(2, (clients) => Promise.all(clients.map((client) => capture(client, pending))));
    assert.equal(results.filter((result) => !result.duplicate).length, 1);
    assert.equal(results.filter((result) => result.duplicate).length, 1);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: pending.bookingId } })).status, 'PENDING');
    await assertCapturedEvidence(pending);

    const explicitAcceptance = await prisma.$transaction((tx) => claimBookingTransition({
      tx, bookingId: pending.bookingId, transition: 'CONFIRM',
    }));
    assert.equal(explicitAcceptance.booking.status, 'CONFIRMED');
    assert.equal(explicitAcceptance.duplicate, false);

    const cancelled = await createFixture({ status: 'CANCELLED' });
    const lateCaptureResults = await usingClients(2, (clients) => Promise.all(
      clients.map((client) => capture(client, cancelled)),
    ));
    assert.equal(lateCaptureResults.filter((result) => !result.duplicate).length, 1);
    assert.equal(lateCaptureResults.filter((result) => result.duplicate).length, 1);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: cancelled.bookingId } })).status, 'CANCELLED');
    await assertCapturedEvidence(cancelled);
    assert.equal(await prisma.incident.count({
      where: { deduplicationKey: `payment:cancelled-booking:${cancelled.paymentId}`, status: 'OPEN', severity: 'HIGH' },
    }), 1, 'late capture must enter the operational incident queue');

    const replay = await capture(prisma, cancelled);
    assert.equal(replay.duplicate, true);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: cancelled.bookingId } })).status, 'CANCELLED');
    await assertCapturedEvidence(cancelled);
  } finally {
    await cleanup();
    const createdAccounts = await prisma.ledgerAccount.findMany({
      where: { currency: 'EUR', id: { notIn: [...existingAccounts] }, entries: { none: {} } },
      select: { id: true },
    });
    if (createdAccounts.length) {
      await prisma.ledgerAccount.deleteMany({ where: { id: { in: createdAccounts.map((item) => item.id) } } });
    }
  }
});

test('PostgreSQL capture racing a committed cancellation leaves the booking cancelled', async () => {
  const existingAccounts = new Set((await prisma.ledgerAccount.findMany({
    where: { currency: 'EUR' }, select: { id: true },
  })).map((account) => account.id));
  let releaseCancellation;
  let signalCancellationLocked;
  let signalCapturePid;
  let captureClient;
  let cancellation;
  const cancellationGate = new Promise((resolve) => { releaseCancellation = resolve; });
  const cancellationLocked = new Promise((resolve) => { signalCancellationLocked = resolve; });
  const capturePid = new Promise((resolve) => { signalCapturePid = resolve; });

  try {
    const fixture = await createFixture();
    cancellation = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${fixture.bookingId} FOR UPDATE`;
      await tx.booking.update({
        where: { id: fixture.bookingId },
        data: {
          status: 'CANCELLED',
          cancelledBy: 'CLIENT',
          cancellationReason: 'Integration cancellation race',
          cancelledAt: new Date(),
        },
      });
      signalCancellationLocked();
      await cancellationGate;
    }, { timeout: 15_000 });
    await Promise.race([
      cancellationLocked,
      cancellation.then(() => { throw new Error('Cancellation committed before acquiring its row lock'); }),
    ]);

    captureClient = createPrisma();
    const capturePromise = capture(captureClient, fixture, signalCapturePid);
    const pid = await Promise.race([
      capturePid,
      capturePromise.then(() => { throw new Error('Capture finished before exposing its database session'); }),
    ]);
    let observedDatabaseLockWait = false;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !observedDatabaseLockWait) {
      const rows = await prisma.$queryRaw`
        SELECT wait_event_type, query FROM pg_stat_activity WHERE pid = ${pid}
      `;
      observedDatabaseLockWait = rows.some((row) => row.wait_event_type === 'Lock'
        && row.query.includes('Booking') && row.query.includes('FOR UPDATE'));
      if (!observedDatabaseLockWait) {
        const outcome = await Promise.race([
          capturePromise.then(() => 'completed', () => 'failed'),
          delay(25).then(() => 'waiting'),
        ]);
        if (outcome !== 'waiting') break;
      }
    }
    releaseCancellation();
    await cancellation;
    await capturePromise;

    assert.equal(observedDatabaseLockWait, true, 'capture must wait on the Booking row lock before cancellation commits');
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } })).status, 'CANCELLED');
    await assertCapturedEvidence(fixture);
    assert.equal(await prisma.incident.count({
      where: { deduplicationKey: `payment:cancelled-booking:${fixture.paymentId}`, status: 'OPEN' },
    }), 1);
  } finally {
    releaseCancellation?.();
    await cancellation?.catch(() => {});
    await captureClient?.$disconnect();
    await cleanup();
    const createdAccounts = await prisma.ledgerAccount.findMany({
      where: { currency: 'EUR', id: { notIn: [...existingAccounts] }, entries: { none: {} } },
      select: { id: true },
    });
    if (createdAccounts.length) {
      await prisma.ledgerAccount.deleteMany({ where: { id: { in: createdAccounts.map((item) => item.id) } } });
    }
  }
});
