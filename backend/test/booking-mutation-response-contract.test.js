process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const { RESPONSE_CONTRACT } = require('../src/shared/http/response-contract');
const { bookingMutationResponses } = require('../src/contracts/booking.responses');
const bookingRouter = require('../src/routes/booking.routes');

const id = (char) => `${char.repeat(8)}-${char.repeat(4)}-4${char.repeat(3)}-8${char.repeat(3)}-${char.repeat(12)}`;
const now = new Date('2026-09-24T12:00:00.000Z');

const bookingFixture = () => ({
  id: id('a'), status: 'COMPLETED', scheduledDate: now, endDate: now,
  address: 'Calle segura 1', city: 'Madrid', state: 'Madrid', postalCode: '28001', notes: null,
  totalPrice: '25.00', serviceAmount: '20.00', platformFee: '5.00', professionalCommission: '3.00',
  professionalEarnings: '17.00', currency: 'EUR', createdAt: now, updatedAt: now,
  latitude: 40.1, longitude: -3.2, pricingSnapshot: { privateRule: true }, pricingPolicyId: id('b'),
  cancelledBy: 'CLIENT', cancellationReason: 'private reason', cancelledAt: now, completedAt: now,
  providerMetadata: { accessToken: 'private-provider-token' }, riskScore: 91,
  requestId: 'private-request', correlationId: 'private-correlation', traceId: 'private-trace',
  internalNote: 'private audit note', auditLog: [{ actorId: id('c') }],
  bookingServices: [{ id: id('d'), serviceId: id('e'), quantity: 1, price: '20.00', subtotal: '20.00',
    service: { id: id('e'), name: 'Limpieza', description: 'Servicio', internalCost: '1.00' } }],
  professional: { id: id('f'), averageRating: 4.5, stripeAccountId: 'acct_private',
    user: { id: id('1'), firstName: 'Ana', lastName: 'Profesional', avatarUrl: null, phone: '+34999999999', email: 'private@example.test' } },
  client: { id: id('2'), user: { id: id('3'), firstName: 'Luis', lastName: 'Cliente', avatarUrl: null,
    phone: '+34888888888', email: 'private@example.test', passwordHash: 'private-hash' } },
  payment: { id: id('4'), amount: '25.00', currency: 'EUR', status: 'COMPLETED', method: 'CASH',
    transactionId: 'private-transaction', providerChargeId: 'private-charge' },
  review: { id: id('5'), rating: 5, comment: 'private review', isVisible: false },
});

const requestContext = (role) => ({ user: { role } });
const cleanBooking = (contract, booking, role) => {
  const definition = contract.responses[200];
  return definition.schema.parse(definition.serialize({
    message: 'Booking updated successfully', booking, duplicate: false,
  }, requestContext(role)));
};

const operations = [
  ['create', 'POST', '/api/bookings', [200, 201]],
  ['confirm', 'POST', '/api/bookings/{id}/confirm', [200]],
  ['reject', 'POST', '/api/bookings/{id}/reject', [200]],
  ['start', 'POST', '/api/bookings/{id}/start', [200]],
  ['complete', 'POST', '/api/bookings/{id}/complete', [200]],
  ['cancel', 'POST', '/api/bookings/{id}/cancel', [200]],
];

test('each mounted Booking mutation declares its actual success statuses and is enforced by responseContract', () => {
  for (const [name, method, path, statuses] of operations) {
    const contract = bookingMutationResponses[name];
    assert.ok(contract, `missing booking mutation response contract: ${name}`);
    assert.equal(contract.method, method, `${name} method`);
    assert.equal(contract.path, path, `${name} path`);
    assert.deepEqual(Object.keys(contract.responses).map(Number).sort(), statuses);

    const routePath = path === '/api/bookings' ? '/' : path.replace('/api/bookings', '').replace(/\{id\}/g, ':id');
    const layer = bookingRouter.stack.find((entry) => entry.route?.path === routePath && entry.route.methods.post);
    assert.ok(layer, `missing mounted route for ${name}`);
    const middleware = layer.route.stack.find((entry) => entry.handle[RESPONSE_CONTRACT] === contract);
    assert.ok(middleware, `${name} route does not enforce its declared response contract`);
  }
});

test('create replay and first creation retain their 200 and 201 wire contracts', () => {
  const contract = bookingMutationResponses.create;
  for (const [status, duplicate] of [[200, true], [201, false]]) {
    const definition = contract.responses[status];
    assert.ok(definition, `create response status ${status} is missing`);
    const body = definition.schema.parse(definition.serialize({
      message: 'Booking created successfully', booking: bookingFixture(), duplicate,
    }, requestContext('CLIENT')));
    assert.equal(body.duplicate, duplicate);
    assert.equal(body.booking.id, id('a'));
  }
});

test('professional mutation DTOs expose only the professional projection', () => {
  for (const name of ['confirm', 'reject', 'start', 'complete', 'cancel']) {
    const contract = bookingMutationResponses[name];
    const source = bookingFixture();
    const professional = cleanBooking(contract, source, 'PROFESSIONAL').booking;

    assert.equal(professional.client.user.firstName, 'Luis');
    assert.equal(professional.client.user.phone, undefined);
    assert.equal(professional.client.user.passwordHash, undefined);
    assert.equal(professional.professionalEarnings, '17.00');
    assert.equal(professional.professional, undefined);
    assert.equal(professional.payment, undefined);

    for (const dto of [professional]) {
      assert.equal(dto.latitude, undefined);
      assert.equal(dto.longitude, undefined);
      assert.equal(dto.pricingSnapshot, undefined);
      assert.equal(dto.pricingPolicyId, undefined);
      assert.equal(dto.serviceAmount, undefined);
      assert.equal(dto.professionalCommission, undefined);
      assert.equal(dto.providerMetadata, undefined);
      assert.equal(dto.riskScore, undefined);
      assert.equal(dto.auditLog, undefined);
      assert.equal(dto.requestId, undefined);
      assert.equal(dto.correlationId, undefined);
      assert.equal(dto.traceId, undefined);
      assert.equal(dto.bookingServices[0].service.internalCost, undefined);
    }
  }
});

test('customer cancellation projection preserves historical CASH read without leaking payment internals', () => {
  const customer = cleanBooking(bookingMutationResponses.cancel, bookingFixture(), 'CLIENT').booking;
  assert.equal(customer.professional.user.firstName, 'Ana');
  assert.equal(customer.professional.user.phone, undefined);
  assert.equal(customer.client, undefined);
  assert.equal(customer.professionalEarnings, undefined);
  assert.equal(customer.payment.method, 'CASH');
  assert.equal(customer.payment.transactionId, undefined);
  assert.equal(customer.latitude, undefined);
  assert.equal(customer.pricingSnapshot, undefined);
  assert.equal(customer.providerMetadata, undefined);
});

test('completion exposes a safe payout summary and cancellation exposes a safe refund summary', () => {
  const completion = bookingMutationResponses.complete.responses[200];
  const payoutBody = completion.schema.parse(completion.serialize({
    message: 'Booking completed successfully', booking: bookingFixture(), duplicate: false,
    payout: { id: id('6'), status: 'REQUESTED', amount: '17.00', currency: 'EUR', requestedAt: now,
      approvedAt: null, processedAt: null, bookingId: id('a'), paymentId: id('4'), earningId: id('7'),
      professionalId: id('f'), idempotencyKey: 'private-key', providerTransferId: 'private-transfer', metadata: { secret: true } },
  }, requestContext('PROFESSIONAL')));
  assert.deepEqual(payoutBody.payout, {
    id: id('6'), status: 'REQUESTED', amount: '17.00', currency: 'EUR',
    requestedAt: now.toISOString(), approvedAt: null, processedAt: null,
  });

  const cancellation = bookingMutationResponses.cancel.responses[200];
  const refundBody = cancellation.schema.parse(cancellation.serialize({
    message: 'Booking cancelled successfully', booking: bookingFixture(), duplicate: false,
    refundRequest: { outcome: 'APPROVED', duplicate: false, refund: {
      id: id('8'), status: 'REQUESTED', serviceAmount: '20.00', platformFeeAmount: '5.00',
      totalAmount: '25.00', currency: 'EUR', requestedAt: now, processedAt: null,
      bookingId: id('a'), paymentId: id('4'), refundPolicyId: id('9'), idempotencyKey: 'private-key',
      decision: { private: true }, decisionRecordId: id('1'), providerRefundId: 'private-refund', metadata: { secret: true },
    } },
  }, requestContext('CLIENT')));
  assert.deepEqual(refundBody.refundRequest, {
    outcome: 'APPROVED', duplicate: false,
    refund: { id: id('8'), status: 'REQUESTED', serviceAmount: '20.00', platformFeeAmount: '5.00',
      totalAmount: '25.00', currency: 'EUR', requestedAt: now.toISOString(), processedAt: null },
  });
});
