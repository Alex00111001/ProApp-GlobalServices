process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const prisma = require('../src/config/prisma');
const controller = require('../src/controllers/booking.controller');
const router = require('../src/routes/booking.routes');

const BOOKING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROFESSIONAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FOREIGN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const responseDouble = () => {
  const response = { statusCode: 200, body: null };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return body; },
  };
  return { response, res };
};

const request = (user, body = {}) => ({
  params: { id: BOOKING_ID }, body, user,
  context: { requestId: 'authorization-test', correlationId: 'authorization-test' },
});

const client = (id = CLIENT_ID) => ({ id, role: 'CLIENT', clientProfile: { id: 'client-profile-1' } });
const professional = (id = PROFESSIONAL_ID, profileId = 'professional-profile-1') => ({
  id, role: 'PROFESSIONAL', professionalProfile: { id: profileId, status: 'APPROVED' },
});

const installReadOnlyBooking = (t, booking) => {
  const originalRead = prisma.booking.findUnique;
  const originalTransaction = prisma.$transaction;
  let transactions = 0;
  prisma.booking.findUnique = async () => booking;
  prisma.$transaction = async () => { transactions += 1; throw new Error('Unauthorized request opened a transaction'); };
  t.after(() => {
    prisma.booking.findUnique = originalRead;
    prisma.$transaction = originalTransaction;
  });
  return () => transactions;
};

const invoke = async (handler, req) => {
  const { response, res } = responseDouble();
  let forwarded = null;
  await handler(req, res, (error) => { forwarded = error; });
  assert.equal(forwarded, null);
  return response;
};

for (const [name, handler, status] of [
  ['confirm', controller.confirmBooking, 'PENDING'],
  ['reject', controller.rejectBooking, 'PENDING'],
  ['start', controller.startBooking, 'CONFIRMED'],
  ['complete', controller.completeBooking, 'IN_PROGRESS'],
]) {
  test(`${name} denies a foreign professional before any transaction`, async (t) => {
    const transactions = installReadOnlyBooking(t, {
      id: BOOKING_ID, status, professionalId: 'another-professional-profile',
      payment: { id: 'payment-1', status: 'COMPLETED', method: 'STRIPE' },
    });
    const result = await invoke(handler, request(professional()));
    assert.equal(result.statusCode, 403);
    assert.equal(transactions(), 0);
  });
}

for (const path of ['/:id/confirm', '/:id/reject', '/:id/start', '/:id/complete']) {
  test(`${path} mounted role guard blocks a client before the controller`, () => {
    const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods.post)?.route;
    assert.ok(route, `POST ${path} must be mounted`);
    const guards = route.stack.map((layer) => layer.handle);
    let proceeded = false;
    const { response, res } = responseDouble();
    guards[0](request(client()), res, () => { proceeded = true; });
    assert.equal(response.statusCode, 403);
    assert.equal(proceeded, false);
  });
}

for (const [name, user] of [
  ['foreign client', client(FOREIGN_ID)],
  ['foreign professional', professional(FOREIGN_ID, 'foreign-professional-profile')],
]) {
  test(`cancel denies ${name} before any transaction`, async (t) => {
    const transactions = installReadOnlyBooking(t, {
      id: BOOKING_ID, status: 'PENDING', client: { userId: CLIENT_ID },
      professional: { userId: PROFESSIONAL_ID }, payment: null,
    });
    const result = await invoke(controller.cancelBooking, request(user));
    assert.equal(result.statusCode, 403);
    assert.equal(transactions(), 0);
  });
}

test('reject does not replay an earlier professional cancellation as a rejection', async (t) => {
  const originalRead = prisma.booking.findUnique;
  const originalTransaction = prisma.$transaction;
  const priorCancellation = {
    id: BOOKING_ID, professionalId: 'professional-profile-1', status: 'CANCELLED',
    cancelledBy: 'PROFESSIONAL', cancellationReason: 'Cannot attend',
  };
  let mutations = 0;
  prisma.booking.findUnique = async () => priorCancellation;
  prisma.$transaction = async (work) => work({
    $queryRaw: async () => [],
    payment: { findUnique: async () => null },
    booking: {
      updateMany: async () => { mutations += 1; return { count: 0 }; },
      findUnique: async () => priorCancellation,
    },
    outboxEvent: {
      findFirst: async () => null,
      create: async () => { mutations += 1; },
    },
    auditLog: { create: async () => { mutations += 1; } },
    notification: { create: async () => { mutations += 1; } },
  });
  t.after(() => {
    prisma.booking.findUnique = originalRead;
    prisma.$transaction = originalTransaction;
  });
  const result = await invoke(controller.rejectBooking, request(professional()));
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, 'BOOKING_TRANSITION_CONFLICT');
  assert.equal(mutations, 1, 'only the conditional state claim may be attempted');
});
