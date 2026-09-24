process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { z } = require('zod');
const { createGlobalErrorHandler } = require('../src/shared/http/global-error-handler');
const { errorContract } = require('../src/shared/http/error-contract');
const { defineErrorResponseContract, defineResponseContract, errorResponseContract, outputObject, responseContract } = require('../src/shared/http/response-contract');
const { safeErrorSchema } = require('../src/contracts/error.responses');
const { catalogSchemas } = require('../src/contracts/catalog.responses');
const { favoriteSchemas } = require('../src/contracts/favorite.responses');
const { experimentSchemas } = require('../src/contracts/experiment.responses');
const { publicContentResponses } = require('../src/contracts/public-content.responses');
const { paymentResponses } = require('../src/contracts/payment.responses');
const { bookingResponses } = require('../src/contracts/booking.responses');

const request = async (handler) => {
  const app = express();
  app.use((req, res, next) => { req.context = { requestId: 'req-test', correlationId: 'corr-test' }; next(); });
  app.use(errorContract);
  app.get('/test', responseContract(defineResponseContract({
    method: 'GET', path: '/test', operationId: 'test.response',
    responses: { 200: outputObject({ id: z.string().uuid(), name: z.string() }), 204: null },
  })), handler);
  app.use(createGlobalErrorHandler({ reportError: async () => ({}), ensureIncidentForError: async () => {} }));
  const server = app.listen(0);
  try {
    const address = server.address();
    return await fetch(`http://127.0.0.1:${address.port}/test`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('response contract strips undeclared fields at the runtime serialization boundary', async () => {
  const response = await request((req, res) => res.json({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Safe', passwordHash: 'must-not-leave',
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Safe' });
});

test('favorite professional DTO retains consumer fields while removing provider internals', () => {
  const result = favoriteSchemas.favoriteProfessional.safeParse({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'APPROVED',
    bio: null, yearsOfExperience: null, hourlyRate: null, serviceRadius: null, latitude: null, longitude: null,
    totalBookings: 0, averageRating: 0, totalReviews: 0, verifiedAt: null,
    createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z',
    user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', firstName: 'Safe', lastName: 'User', avatarUrl: null },
    categories: [], services: [], stripeAccountId: 'acct_private', totalEarnings: '100.00',
  });
  assert.equal(result.success, true);
  assert.equal(result.data.stripeAccountId, undefined);
  assert.equal(result.data.totalEarnings, undefined);
  assert.equal(result.data.user.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});

test('response contract fails closed on schema or success-status drift', async () => {
  for (const handler of [
    (req, res) => res.json({ id: 'not-a-uuid', name: 'Invalid' }),
    (req, res) => res.status(201).json({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Wrong status' }),
  ]) {
    const response = await request(handler);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR', requestId: 'req-test', correlationId: 'corr-test',
    });
  }
});

test('empty 204 responses are explicitly contracted', async () => {
  const response = await request((req, res) => res.status(204).send());
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
});

test('error response contracts enforce the safe-error allowlist before the global error boundary', async () => {
  const app = express();
  app.use((req, res, next) => { req.context = { requestId: 'req-error', correlationId: 'corr-error' }; next(); });
  app.use(errorContract);
  app.post('/cash', errorResponseContract(defineErrorResponseContract({
    method: 'POST', path: '/cash', operationId: 'test.cash.retired', responses: { 409: safeErrorSchema },
  })), (req, res) => res.status(409).json({
    success: false, error: 'Cash payment is unavailable', code: 'CASH_PAYMENT_DISABLED', privateProviderReason: 'must-not-leave',
  }));
  app.use(createGlobalErrorHandler({ reportError: async () => ({}), ensureIncidentForError: async () => {} }));
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/cash`, { method: 'POST' });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      success: false, error: 'Cash payment is unavailable', code: 'CASH_PAYMENT_DISABLED', requestId: 'req-error', correlationId: 'corr-error',
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('public catalog serialization removes professional payment and private review fields', () => {
  const safe = catalogSchemas.publicProfessional.parse({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'APPROVED',
    bio: null, yearsOfExperience: 5, hourlyRate: '25.00', serviceRadius: 10, latitude: 1, longitude: 2,
    totalBookings: 3, averageRating: 4.5, totalReviews: 2, verifiedAt: null,
    createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z',
    stripeAccountId: 'acct_private', totalEarnings: '999.00', rejectedReason: 'private',
  });
  assert.equal(safe.stripeAccountId, undefined);
  assert.equal(safe.totalEarnings, undefined);
  assert.equal(safe.rejectedReason, undefined);
});

test('experiment exposure DTO removes consent, allocation and tracing internals', () => {
  const safe = experimentSchemas.exposure.parse({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assignmentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    versionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    variantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    consentDecisionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    surface: 'booking.checkout', context: { placement: 'summary' },
    requestId: 'private-request', correlationId: 'private-correlation', traceId: 'private-trace',
    exposedAt: '2026-09-21T00:00:00.000Z',
  });
  assert.deepEqual(safe, {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assignmentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    surface: 'booking.checkout', context: { placement: 'summary' }, exposedAt: '2026-09-21T00:00:00.000Z',
  });
});

test('public content serializers expose only the rendered page and sitemap contract', () => {
  const page = publicContentResponses.content.responses[200];
  const safePage = page.schema.parse(page.serialize({
    key: 'home-cleaning', type: 'SERVICE_PAGE', marketCode: 'ES', locale: 'es-ES',
    title: 'Home cleaning', summary: 'Reviewed public content.', body: [{ type: 'paragraph', text: 'Safe copy.' }],
    seo: { title: 'Home cleaning', description: 'Reviewed public content.', canonical: 'https://public.example/es/es-es/service-page/home-cleaning', robots: 'index,follow', openGraph: { title: 'Home cleaning' }, structuredData: { '@type': 'Service' }, internalReview: 'do-not-publish' },
    publishedAt: new Date('2026-09-23T00:00:00.000Z'), etag: 'digest', contentDigest: 'private', authorId: 'private-author',
  }));
  assert.equal(safePage.authorId, undefined);
  assert.equal(safePage.seo.internalReview, undefined);
  assert.equal(safePage.publishedAt, '2026-09-23T00:00:00.000Z');

  const sitemap = publicContentResponses.sitemap.responses[200];
  const safeSitemap = sitemap.schema.parse(sitemap.serialize({
    marketCode: 'ES', locale: 'es-ES', digest: 'digest', internalSnapshotId: 'private',
    urls: [{ location: 'https://public.example/es/es-es/service-page/home-cleaning', lastModified: new Date('2026-09-23T00:00:00.000Z'), rowId: 'private' }],
  }));
  assert.equal(safeSitemap.internalSnapshotId, undefined);
  assert.equal(safeSitemap.urls[0].rowId, undefined);
});

test('payment serializers retain the customer checkout contract and remove financial/provider internals', () => {
  const payment = paymentResponses.confirm.responses[200];
  const body = payment.schema.parse(payment.serialize({
    success: true, duplicate: false, message: 'Pago confirmado exitosamente',
    payment: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bookingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', amount: '25.00', currency: 'EUR', status: 'COMPLETED', method: 'STRIPE', processedAt: new Date('2026-09-24T00:00:00.000Z'), refundedAt: null, refundAmount: null, createdAt: new Date('2026-09-24T00:00:00.000Z'), updatedAt: new Date('2026-09-24T00:00:00.000Z'), transactionId: 'pi_private', providerChargeId: 'ch_private' },
    booking: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', professionalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'CONFIRMED', scheduledDate: new Date('2026-09-25T00:00:00.000Z'), endDate: new Date('2026-09-25T01:00:00.000Z'), address: 'Calle segura 1', city: 'Madrid', state: 'Madrid', postalCode: '28001', notes: null, totalPrice: '25.00', serviceAmount: '20.00', platformFee: '5.00', professionalEarnings: '15.00', currency: 'EUR', cancelledBy: null, cancellationReason: null, cancelledAt: null, completedAt: null, createdAt: new Date('2026-09-24T00:00:00.000Z'), updatedAt: new Date('2026-09-24T00:00:00.000Z'), pricingSnapshot: { internal: true }, latitude: 1, longitude: 2,
      professional: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', stripeAccountId: 'acct_private', user: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', firstName: 'Pro', lastName: 'Safe', avatarUrl: null, phone: 'private' } },
      bookingServices: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', serviceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', quantity: 1, price: '20.00', subtotal: '20.00', service: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Cleaning', internalCost: '1.00' } }],
      payment: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bookingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', amount: '25.00', currency: 'EUR', status: 'COMPLETED', method: 'STRIPE', processedAt: new Date('2026-09-24T00:00:00.000Z'), refundedAt: null, refundAmount: null, createdAt: new Date('2026-09-24T00:00:00.000Z'), updatedAt: new Date('2026-09-24T00:00:00.000Z'), transactionId: 'pi_private' },
    },
  }));
  assert.equal(body.payment.transactionId, undefined);
  assert.equal(body.booking.pricingSnapshot, undefined);
  assert.equal(body.booking.latitude, undefined);
  assert.equal(body.booking.professional.stripeAccountId, undefined);
  assert.equal(body.booking.professional.user.phone, undefined);
  assert.equal(body.booking.bookingServices[0].service.internalCost, undefined);
  assert.equal(body.booking.payment.transactionId, undefined);
});

test('booking detail serializes distinct customer and professional views at the HTTP boundary', async () => {
  const id = (letter) => `${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`;
  const now = new Date('2026-09-24T12:00:00.000Z');
  const booking = {
    id: id('a'), status: 'CONFIRMED', scheduledDate: now, endDate: now,
    address: 'Calle segura 1', city: 'Madrid', state: 'Madrid', postalCode: '28001', notes: null,
    totalPrice: '25.00', platformFee: '5.00', professionalEarnings: '17.00', currency: 'EUR',
    createdAt: now, updatedAt: now, latitude: 40.1, longitude: -3.2,
    pricingSnapshot: { privateRule: true }, pricingPolicyId: id('b'),
    bookingServices: [{ id: id('b'), serviceId: id('c'), quantity: 1, price: '20.00', subtotal: '20.00',
      service: { id: id('c'), name: 'Limpieza', description: 'Servicio', internalCost: '1.00' } }],
    professional: { id: id('d'), averageRating: 4.5, stripeAccountId: 'acct_private',
      user: { id: id('e'), firstName: 'Ana', lastName: 'Profesional', avatarUrl: null, phone: 'private-phone' } },
    client: { id: id('f'), user: { id: id('1'), firstName: 'Luis', lastName: 'Cliente', avatarUrl: null,
      phone: 'private-phone', passwordHash: 'private-hash' } },
    payment: { id: id('2'), amount: '25.00', currency: 'EUR', status: 'COMPLETED', method: 'CASH', transactionId: 'private-provider' },
    review: { id: id('3'), comment: 'private-review', isVisible: false },
  };
  for (const role of ['CLIENT', 'PROFESSIONAL']) {
    const app = express();
    app.use((req, res, next) => { req.user = { role }; req.context = { requestId: 'req-booking', correlationId: 'corr-booking' }; next(); });
    app.use(errorContract);
    app.get('/detail', responseContract(bookingResponses.detail), (req, res) => res.json({ booking }));
    app.use(createGlobalErrorHandler({ reportError: async () => ({}), ensureIncidentForError: async () => {} }));
    const server = app.listen(0);
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/detail`);
      assert.equal(response.status, 200);
      const body = (await response.json()).booking;
      assert.equal(body.id, booking.id);
      assert.equal(body.bookingServices[0].service.name, 'Limpieza');
      assert.equal(body.latitude, undefined);
      assert.equal(body.pricingSnapshot, undefined);
      assert.equal(body.bookingServices[0].service.internalCost, undefined);
      if (role === 'CLIENT') {
        assert.equal(body.professional.user.firstName, 'Ana');
        assert.equal(body.professional.user.phone, undefined);
        assert.equal(body.payment.method, 'CASH');
        assert.equal(body.payment.transactionId, undefined);
        assert.equal(body.review.id, id('3'));
        assert.equal(body.review.comment, undefined);
        assert.equal(body.client, undefined);
        assert.equal(body.professionalEarnings, undefined);
      } else {
        assert.equal(body.client.user.firstName, 'Luis');
        assert.equal(body.client.user.phone, undefined);
        assert.equal(body.client.user.passwordHash, undefined);
        assert.equal(body.professionalEarnings, '17.00');
        assert.equal(body.payment, undefined);
        assert.equal(body.professional, undefined);
      }
      const list = role === 'CLIENT' ? bookingResponses.customerList : bookingResponses.professionalList;
      const listBody = list.responses[200].schema.parse(list.responses[200].serialize({
        bookings: [booking], pagination: { currentPage: 2, totalPages: 3, totalItems: 21 },
      }));
      assert.deepEqual(listBody.pagination, { currentPage: 2, totalPages: 3, totalItems: 21 });
      assert.equal(listBody.bookings[0].id, booking.id);
      assert.equal(listBody.bookings[0].client === undefined, role === 'CLIENT');
      assert.equal(listBody.bookings[0].professional === undefined, role === 'PROFESSIONAL');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
