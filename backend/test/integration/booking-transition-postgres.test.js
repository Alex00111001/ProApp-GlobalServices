/*
Task classification
- Phase: approved PRR-105 tranche
- Domain: Marketplace / booking lifecycle
- Risk: HIGH (transaction races, terminal transitions, financial projections)
- Capability tier: DEEP review; isolated integration fixture implementation
- Provider/model: operator-selected; DEEP final review required by MODEL_ROUTING
- Skills: booking-engine, testing, systematic-engineering, api-contract-engineering, backend-fastapi, database-prisma
- Escalation triggers: an unexpected terminal-state winner, duplicate financial evidence, or a wire-contract failure
- Required verification: isolated PostgreSQL transaction/concurrency evidence and mutation response DTO serialization

The controller harness exercises successful lifecycle DTOs and database races,
including creation idempotency and schedule contention with Markets disabled.
*/

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') {
  throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true to run database integration tests deliberately.');
}
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Booking transition integration tests require NODE_ENV=test.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must point to the isolated loopback homeservices_ci PostgreSQL database.');
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
if (!loopbackHosts.has(databaseUrl.hostname) || databaseUrl.pathname.replace(/^\/+/, '') !== 'homeservices_ci') {
  throw new Error('Booking transition integration tests refuse non-loopback or non-homeservices_ci DATABASE_URL targets.');
}

const assert = require('node:assert/strict');
process.env.FINANCIAL_REFUND_REQUESTS_ENABLED = 'true';
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const prisma = require('../../src/config/prisma');
const bookingController = require('../../src/controllers/booking.controller');
const { bookingMutationResponses } = require('../../src/contracts/booking.responses');
const { requestContext } = require('../../src/middleware/request-context');
const { errorContract, publicErrorFromException } = require('../../src/shared/http/error-contract');
const { responseContract } = require('../../src/shared/http/response-contract');
const { applySuccessfulPayment } = require('../../src/modules/billing/payments/payment-capture.service');

const runId = `booking-transition-${randomUUID()}`;
const fixtures = [];
const actors = new Map();
let server;
let origin;

const actorBoundary = (req, res, next) => {
  const actor = actors.get(req.get('x-booking-transition-actor'));
  if (!actor) return res.status(401).json({ error: 'Integration actor is required.' });
  req.user = actor;
  return next();
};

const createControllerHarness = () => {
  const app = express();
  app.use(requestContext);
  app.use(errorContract);
  app.use(express.json());
  app.use(actorBoundary);
  app.post('/', responseContract(bookingMutationResponses.create), bookingController.createBooking);
  app.post('/:id/confirm', responseContract(bookingMutationResponses.confirm), bookingController.confirmBooking);
  app.post('/:id/reject', responseContract(bookingMutationResponses.reject), bookingController.rejectBooking);
  app.post('/:id/start', responseContract(bookingMutationResponses.start), bookingController.startBooking);
  app.post('/:id/complete', responseContract(bookingMutationResponses.complete), bookingController.completeBooking);
  app.post('/:id/cancel', responseContract(bookingMutationResponses.cancel), bookingController.cancelBooking);
  app.use((thrown, req, res, next) => {
    if (res.headersSent) return next(thrown);
    const response = publicErrorFromException({
      thrown,
      requestId: req.context?.requestId,
      correlationId: req.context?.correlationId,
    });
    return res.status(response.statusCode).json(response.body);
  });
  return app;
};

const request = async ({ fixture, action, actor = 'professional', body }) => {
  const response = await fetch(`${origin}/${fixture.bookingId}/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-booking-transition-actor': fixture.actors[actor],
      'x-request-id': `${runId}-${action}-${randomUUID()}`,
      'x-correlation-id': runId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};

const createFixture = async ({ status = 'PENDING', paymentStatus } = {}) => {
  const id = randomUUID();
  const fixture = {
    id,
    bookingId: randomUUID(),
    clientId: randomUUID(),
    professionalId: randomUUID(),
    clientUserId: randomUUID(),
    professionalUserId: randomUUID(),
    paymentId: paymentStatus ? randomUUID() : null,
    actors: {},
  };
  fixtures.push(fixture);

  await prisma.user.createMany({ data: [
    {
      id: fixture.clientUserId,
      email: `${runId}-${id}-client@example.test`,
      phone: `+349${id.replaceAll('-', '').slice(0, 9)}`,
      passwordHash: 'integration-fixture-only',
      firstName: 'Booking', lastName: 'Client', role: 'CLIENT',
    },
    {
      id: fixture.professionalUserId,
      email: `${runId}-${id}-professional@example.test`,
      phone: `+348${id.replaceAll('-', '').slice(0, 9)}`,
      passwordHash: 'integration-fixture-only',
      firstName: 'Booking', lastName: 'Professional', role: 'PROFESSIONAL',
    },
  ] });
  await prisma.clientProfile.create({ data: { id: fixture.clientId, userId: fixture.clientUserId, country: 'ES', paymentMethods: [] } });
  await prisma.professionalProfile.create({ data: { id: fixture.professionalId, userId: fixture.professionalUserId, status: 'APPROVED' } });
  await prisma.booking.create({ data: {
    id: fixture.bookingId,
    clientId: fixture.clientId,
    professionalId: fixture.professionalId,
    status,
    scheduledDate: new Date('2030-01-02T10:00:00.000Z'),
    endDate: new Date('2030-01-02T11:00:00.000Z'),
    address: 'Synthetic integration fixture', city: 'Madrid', state: 'Madrid', postalCode: '28001',
    totalPrice: '108.00', serviceAmount: '100.00', platformFee: '8.00', professionalCommission: '15.00',
    professionalEarnings: '85.00', currency: 'EUR',
    pricingSnapshot: { source: 'booking-transition-postgres-test', version: 1 },
  } });
  if (paymentStatus) {
    await prisma.payment.create({ data: {
      id: fixture.paymentId, bookingId: fixture.bookingId, amount: '108.00', currency: 'EUR',
      status: paymentStatus, method: 'STRIPE', transactionId: `pi_${id.replaceAll('-', '')}`,
    } });
  }

  fixture.actors.professional = `${fixture.id}:professional`;
  fixture.actors.client = `${fixture.id}:client`;
  actors.set(fixture.actors.professional, {
    id: fixture.professionalUserId, role: 'PROFESSIONAL',
    professionalProfile: { id: fixture.professionalId, status: 'APPROVED' },
  });
  actors.set(fixture.actors.client, { id: fixture.clientUserId, role: 'CLIENT', clientProfile: { id: fixture.clientId } });
  return fixture;
};

const countBookingEvidence = (bookingId, eventType) => prisma.outboxEvent.count({
  where: { aggregateType: 'Booking', aggregateId: bookingId, eventType },
});

const cleanFixture = async (fixture) => {
  actors.delete(fixture.actors.professional);
  actors.delete(fixture.actors.client);
  const additionalBookings = await prisma.booking.findMany({
    where: { clientId: fixture.clientId, id: { not: fixture.bookingId } }, select: { id: true },
  });
  const additionalIds = additionalBookings.map((booking) => booking.id);
  await prisma.bookingService.deleteMany({ where: { bookingId: { in: additionalIds } } });
  await prisma.notification.deleteMany({ where: { bookingId: { in: additionalIds } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: additionalIds } } });
  await prisma.auditLog.deleteMany({ where: { resourceId: { in: additionalIds } } });
  await prisma.idempotencyRecord.deleteMany({ where: { scope: `booking:create:${fixture.clientUserId}` } });
  await prisma.booking.deleteMany({ where: { id: { in: additionalIds } } });
  const payouts = await prisma.payout.findMany({ where: { bookingId: fixture.bookingId }, select: { id: true } });
  const refunds = await prisma.refund.findMany({ where: { bookingId: fixture.bookingId }, select: { id: true } });
  const payoutIds = payouts.map((item) => item.id);
  const refundIds = refunds.map((item) => item.id);
  const incident = fixture.paymentId && await prisma.incident.findUnique({
    where: { deduplicationKey: `payment:cancelled-booking:${fixture.paymentId}` },
  });
  if (incident) {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: incident.id } });
    await prisma.incidentEvent.deleteMany({ where: { incidentId: incident.id } });
    await prisma.incident.delete({ where: { id: incident.id } });
  }

  await prisma.refundDecision.deleteMany({ where: { refundId: { in: refundIds } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [fixture.bookingId, ...(fixture.paymentId ? [fixture.paymentId] : []), ...payoutIds, ...refundIds] } } });
  await prisma.auditLog.deleteMany({ where: { OR: [
    { actorId: { in: [fixture.clientUserId, fixture.professionalUserId] } },
    { resourceId: { in: [fixture.bookingId, ...(fixture.paymentId ? [fixture.paymentId] : []), ...payoutIds, ...refundIds] } },
  ] } });
  await prisma.notification.deleteMany({ where: { bookingId: fixture.bookingId } });
  await prisma.payout.deleteMany({ where: { id: { in: payoutIds } } });
  await prisma.refund.deleteMany({ where: { id: { in: refundIds } } });
  await prisma.bookingPolicyAcceptance.deleteMany({ where: { bookingId: fixture.bookingId } });
  if (fixture.refundPolicyId) await prisma.refundPolicy.delete({ where: { id: fixture.refundPolicyId } });
  await prisma.earning.deleteMany({ where: { bookingId: fixture.bookingId } });
  if (fixture.paymentId) await prisma.payment.deleteMany({ where: { id: fixture.paymentId } });
  await prisma.booking.deleteMany({ where: { id: fixture.bookingId } });
  await prisma.clientProfile.deleteMany({ where: { id: fixture.clientId } });
  if (fixture.serviceId) await prisma.service.deleteMany({ where: { id: fixture.serviceId } });
  if (fixture.categoryId) {
    await prisma.professionalCategory.deleteMany({ where: { professionalId: fixture.professionalId, categoryId: fixture.categoryId } });
    await prisma.category.deleteMany({ where: { id: fixture.categoryId } });
  }
  await prisma.professionalProfile.deleteMany({ where: { id: fixture.professionalId } });
  await prisma.user.deleteMany({ where: { id: { in: [fixture.clientUserId, fixture.professionalUserId] } } });
};

const cleanup = async () => {
  while (fixtures.length) await cleanFixture(fixtures.pop());
};

test.before(async () => {
  server = http.createServer(createControllerHarness());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test('create Booking serializes its customer DTO and preserves PostgreSQL idempotency and slot exclusion', async () => {
  const fixture = await createFixture();
  try {
    fixture.categoryId = randomUUID();
    fixture.serviceId = randomUUID();
    await prisma.category.create({ data: { id: fixture.categoryId, name: `${runId}-${fixture.id}`, slug: fixture.id } });
    await prisma.professionalCategory.create({ data: { professionalId: fixture.professionalId, categoryId: fixture.categoryId } });
    await prisma.service.create({ data: {
      id: fixture.serviceId, professionalId: fixture.professionalId, categoryId: fixture.categoryId,
      name: 'Synthetic service', basePrice: '100.00', duration: 60,
    } });
    const body = {
      professionalId: fixture.professionalId, scheduledDate: '2030-01-03T10:00:00.000Z',
      address: 'Synthetic integration fixture', city: 'Madrid', state: 'Madrid', postalCode: '28001',
      services: [{ serviceId: fixture.serviceId, quantity: 1 }],
    };
    const create = async (key) => {
      const response = await fetch(`${origin}/`, {
        method: 'POST', headers: {
          'content-type': 'application/json', 'x-booking-transition-actor': fixture.actors.client,
          ...(key ? { 'idempotency-key': key } : {}),
        }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await create()).status, 400);
    const key = `booking-create-${fixture.id}`;
    const results = await Promise.all([create(key), create(key)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
    assert.equal(results[0].body.booking.id, results[1].body.booking.id);
    for (const result of results) {
      assert.equal(result.body.booking.status, 'PENDING');
      assert.equal(result.body.booking.professional.user.phone, undefined);
      assert.equal(result.body.booking.pricingSnapshot, undefined);
    }
    assert.equal((await create(`${key}-other`)).status, 409);
    assert.equal(await prisma.booking.count({ where: { clientId: fixture.clientId, scheduledDate: new Date(body.scheduledDate) } }), 1);
    assert.equal((await prisma.clientProfile.findUniqueOrThrow({ where: { id: fixture.clientId } })).totalBookings, 1);
  } finally { await cleanup(); }
});

test.after(async () => {
  try {
    await cleanup();
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});

test('two concurrent confirms commit one transition and one booking.confirmed outbox event', async () => {
  const fixture = await createFixture();
  try {
    const results = await Promise.all([request({ fixture, action: 'confirm' }), request({ fixture, action: 'confirm' })]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 200]);
    assert.equal(results.filter((result) => result.body.duplicate === false).length, 1);
    assert.equal(results.filter((result) => result.body.duplicate === true).length, 1);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } })).status, 'CONFIRMED');
    assert.equal(await countBookingEvidence(fixture.bookingId, 'booking.confirmed'), 1);
    for (const result of results) {
      assert.equal(result.body.booking.status, 'CONFIRMED');
      assert.equal(result.body.booking.client.user.phone, undefined, 'professional DTO must be serialized through its response contract');
    }
  } finally {
    await cleanup();
  }
});

test('confirm racing reject produces one terminal decision and one corresponding transition event', async () => {
  const fixture = await createFixture();
  try {
    const [confirm, reject] = await Promise.all([
      request({ fixture, action: 'confirm' }),
      request({ fixture, action: 'reject', body: { reason: 'Synthetic concurrent decline' } }),
    ]);
    assert.equal([confirm.status, reject.status].filter((status) => status === 200).length, 1);
    assert.equal([confirm.status, reject.status].filter((status) => status === 409).length, 1);
    const conflict = [confirm, reject].find((result) => result.status === 409);
    assert.equal(conflict.body.code, 'BOOKING_TRANSITION_CONFLICT', 'errorContract must normalize the losing transition');
    assert.equal(conflict.body.correlationId, runId);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } });
    assert.ok(['CONFIRMED', 'CANCELLED'].includes(booking.status));
    assert.equal(await countBookingEvidence(fixture.bookingId, 'booking.confirmed')
      + await countBookingEvidence(fixture.bookingId, 'booking.rejected'), 1);
  } finally {
    await cleanup();
  }
});

test('successful reject, start, and cancel controller paths emit their declared wire DTOs', async () => {
  const rejected = await createFixture();
  const started = await createFixture({ status: 'CONFIRMED' });
  const cancelled = await createFixture();
  try {
    const reject = await request({ fixture: rejected, action: 'reject', body: { reason: 'Synthetic decline' } });
    const start = await request({ fixture: started, action: 'start' });
    const cancel = await request({ fixture: cancelled, action: 'cancel', actor: 'client', body: { reason: 'Synthetic cancellation' } });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.booking.status, 'CANCELLED');
    assert.equal(reject.body.duplicate, false);
    assert.equal(start.status, 200);
    assert.equal(start.body.booking.status, 'IN_PROGRESS');
    assert.equal(start.body.duplicate, false);
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.booking.status, 'CANCELLED');
    assert.equal(cancel.body.duplicate, false);
    assert.equal(cancel.body.booking.professional.user.phone, undefined, 'customer DTO must be serialized through its response contract');
    assert.equal(await countBookingEvidence(rejected.bookingId, 'booking.rejected'), 1);
    assert.equal(await countBookingEvidence(started.bookingId, 'booking.started'), 1);
    assert.equal(await countBookingEvidence(cancelled.bookingId, 'booking.cancelled'), 1);
  } finally {
    await cleanup();
  }
});

test('paid completion racing cancellation leaves one terminal winner and creates earnings/statistics only for completion', async () => {
  const fixture = await createFixture({ status: 'IN_PROGRESS', paymentStatus: 'COMPLETED' });
  try {
    const [complete, cancel] = await Promise.all([
      request({ fixture, action: 'complete' }),
      request({ fixture, action: 'cancel', actor: 'client', body: { reason: 'Synthetic concurrent cancellation' } }),
    ]);
    assert.equal([complete.status, cancel.status].filter((status) => status === 200).length, 1);
    assert.equal([complete.status, cancel.status].filter((status) => status === 409).length, 1);
    const conflict = [complete, cancel].find((result) => result.status === 409);
    assert.ok(['BOOKING_TRANSITION_CONFLICT', 'CONFLICT'].includes(conflict.body.code));
    assert.equal(conflict.body.correlationId, runId);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } });
    const professional = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: fixture.professionalId } });
    if (booking.status === 'COMPLETED') {
      assert.equal(await prisma.earning.count({ where: { bookingId: fixture.bookingId } }), 1);
      assert.equal(professional.totalBookings, 1);
      assert.equal(professional.totalEarnings.toString(), '85');
      assert.equal(await countBookingEvidence(fixture.bookingId, 'booking.completed'), 1);
      assert.equal(await countBookingEvidence(fixture.bookingId, 'booking.cancelled'), 0);
      assert.equal(complete.body.booking.status, 'COMPLETED');
    } else {
      assert.equal(booking.status, 'CANCELLED');
      assert.equal(await prisma.earning.count({ where: { bookingId: fixture.bookingId } }), 0);
      assert.equal(professional.totalBookings, 0);
      assert.equal(professional.totalEarnings.toString(), '0');
      assert.equal(await countBookingEvidence(fixture.bookingId, 'booking.completed'), 0);
      assert.equal(await countBookingEvidence(fixture.bookingId, 'booking.cancelled'), 1);
      assert.equal(cancel.body.booking.status, 'CANCELLED');
      assert.equal(cancel.body.booking.professional.user.phone, undefined, 'customer cancellation DTO must be serialized through its response contract');
    }
  } finally {
    await cleanup();
  }
});

test('duplicate completion does not duplicate earnings, professional statistics, or booking.completed outbox evidence', async () => {
  const fixture = await createFixture({ status: 'IN_PROGRESS', paymentStatus: 'COMPLETED' });
  try {
    const first = await request({ fixture, action: 'complete' });
    const replay = await request({ fixture, action: 'complete' });
    assert.equal(first.status, 200);
    assert.equal(first.body.duplicate, false);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate, true);
    assert.equal(replay.body.booking.status, 'COMPLETED');
    assert.equal(await prisma.earning.count({ where: { bookingId: fixture.bookingId } }), 1);
    assert.equal(await countBookingEvidence(fixture.bookingId, 'booking.completed'), 1);
    const professional = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: fixture.professionalId } });
    assert.equal(professional.totalBookings, 1);
    assert.equal(professional.totalEarnings.toString(), '85');
  } finally {
    await cleanup();
  }
});

test('historical CASH cannot authorize a new completion or earning', async () => {
  const fixture = await createFixture({ status: 'IN_PROGRESS', paymentStatus: 'COMPLETED' });
  try {
    await prisma.payment.update({ where: { id: fixture.paymentId }, data: { method: 'CASH' } });
    const completion = await request({ fixture, action: 'complete' });
    assert.equal(completion.status, 409);
    assert.equal(completion.body.code, 'CASH_PAYMENT_DISABLED');
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } })).status, 'IN_PROGRESS');
    assert.equal(await prisma.earning.count({ where: { bookingId: fixture.bookingId } }), 0);
  } finally { await cleanup(); }
});

for (const order of ['capture-first', 'reject-first', 'concurrent']) {
  test(`professional rejection and Stripe capture reconcile exactly once (${order})`, async () => {
    const fixture = await createFixture({ paymentStatus: 'PROCESSING' });
    try {
      const policy = await prisma.refundPolicy.create({ data: {
        key: `${runId}-${fixture.id}`, version: 1, status: 'DRAFT', country: 'ES',
        rules: [{ key: 'professional-decline', when: { whoCancelled: 'PROFESSIONAL', bookingStatus: 'CANCELLED' },
          serviceRefundPercentage: 100, platformFeeRefundPercentage: 100, outcome: 'APPROVED' }],
      } });
      fixture.refundPolicyId = policy.id;
      await prisma.bookingPolicyAcceptance.create({ data: {
        bookingId: fixture.bookingId, refundPolicyId: policy.id, policyVersion: 1,
        country: 'ES', language: 'es', evidence: { source: 'isolated-integration-test' },
      } });
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
      const capture = () => prisma.$transaction((tx) => applySuccessfulPayment({
        tx, bookingId: fixture.bookingId, providerTransactionId: payment.transactionId,
        providerAmountMinor: 10_800, providerCurrency: 'eur', source: 'BOOKING_TRANSITION_TEST', ledgerEnabled: false,
      }));
      const reject = () => request({ fixture, action: 'reject', body: { reason: 'Synthetic professional decline' } });
      let rejection;
      if (order === 'capture-first') { await capture(); rejection = await reject(); }
      else if (order === 'reject-first') { rejection = await reject(); await capture(); }
      else { [rejection] = await Promise.all([reject(), capture()]); }
      assert.equal(rejection.status, 200);
      assert.equal(rejection.body.booking.status, 'CANCELLED');
      await capture();
      assert.equal((await reject()).body.duplicate, true);
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } })).status, 'CANCELLED');
      assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } })).status, 'COMPLETED');
      const refunds = await prisma.refund.findMany({ where: { bookingId: fixture.bookingId } });
      assert.equal(refunds.length, 1);
      assert.equal(refunds[0].status, 'REQUESTED');
      assert.equal(refunds[0].totalAmount.toString(), '108');
      assert.equal(await prisma.refundDecision.count({ where: { refundId: refunds[0].id } }), 1);
      assert.equal(await prisma.incident.count({
        where: { deduplicationKey: `payment:cancelled-booking:${fixture.paymentId}` },
      }), 1);
      assert.equal(await countBookingEvidence(fixture.bookingId, 'booking.rejected'), 1);
      assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: fixture.paymentId, eventType: 'payment.completed' } }), 1);
    } finally { await cleanup(); }
  });
}
