process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { bookingMutationResponses, bookingSchemas } = require('../src/contracts/booking.responses');
const { normalizeBookingPayload } = require('../src/shared/http/compatibility');
const { createBookingSchema } = require('../src/validators/auth.validators');
const { bookingCancellationBody, bookingRejectionBody } = require('../src/validators/legacy-request.validators');
const bookingRouter = require('../src/routes/booking.routes');
const { requireApprovedProfessional } = require('../src/middleware/auth');

const repo = (...parts) => path.resolve(__dirname, '..', '..', ...parts);
const source = (...parts) => fs.readFileSync(repo(...parts), 'utf8');
const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(file);
  return /\.[jt]sx?$/.test(entry.name) ? [file] : [];
});
const uuid = (letter) => `${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`;
const timestamp = new Date('2026-09-24T12:00:00.000Z');

const booking = () => ({
  id: uuid('a'), status: 'IN_PROGRESS', scheduledDate: timestamp, endDate: timestamp,
  address: 'Calle segura 1', city: 'Madrid', state: 'Madrid', postalCode: '28001', notes: null,
  totalPrice: '25.00', platformFee: '5.00', professionalEarnings: '17.00', currency: 'EUR',
  createdAt: timestamp, updatedAt: timestamp,
  bookingServices: [{ id: uuid('b'), serviceId: uuid('c'), quantity: 1, price: '20.00', subtotal: '20.00',
    service: { id: uuid('c'), name: 'Limpieza', description: null } }],
  professional: { id: uuid('d'), averageRating: 4.5,
    user: { id: uuid('e'), firstName: 'Ana', lastName: 'Profesional', avatarUrl: null, phone: 'redacted' } },
  client: { id: uuid('f'), user: { id: uuid('1'), firstName: 'Luis', lastName: 'Cliente', avatarUrl: null, phone: 'redacted' } },
  payment: { id: uuid('2'), amount: '25.00', currency: 'EUR', status: 'COMPLETED', method: 'CASH' },
  review: { id: uuid('3') },
});

const routeFor = (suffix) => bookingRouter.stack.find((layer) => layer.route?.path === suffix);
const invokeMiddleware = (middleware, req) => {
  const result = { status: null, nextCalled: false };
  middleware(req, { status(code) { result.status = code; return this; }, json() {} }, (error) => {
    result.nextCalled = !error;
    result.error = error;
  });
  return result;
};

test('Customer create form fields normalize into the strict runtime request schema', () => {
  const apiClient = source('mobile-client', 'src', 'services', 'api.ts');
  const flow = source('mobile-client', 'src', 'screens', 'booking', 'BookingFlowScreen.tsx');
  const required = ['professionalId', 'scheduledDate', 'address', 'city', 'state', 'postalCode', 'services'];
  const actualRequired = Object.entries(createBookingSchema.shape)
    .filter(([, schema]) => !schema.isOptional())
    .map(([key]) => key);
  assert.deepEqual(actualRequired.sort(), required.sort());

  const formData = {
    professionalId: uuid('a'), services: [{ serviceId: uuid('b'), quantity: 2 }],
    scheduledDate: '2026-10-01T10:30:00.000Z', address: 'Calle Mayor 1', city: 'Madrid', state: 'Madrid',
    zipCode: '28001', notes: 'Leave at door', latitude: 40.4, longitude: -3.7,
  };
  const wireBody = normalizeBookingPayload({ ...formData, postalCode: formData.zipCode });
  assert.deepEqual(createBookingSchema.parse(wireBody), {
    professionalId: formData.professionalId, services: formData.services, scheduledDate: formData.scheduledDate,
    address: formData.address, city: formData.city, state: formData.state, postalCode: formData.zipCode,
    notes: formData.notes, latitude: formData.latitude, longitude: formData.longitude,
  });
  const legacyWireBody = normalizeBookingPayload({
    ...formData, scheduledTime: '10:30',
  });
  const legacyParsed = createBookingSchema.parse(legacyWireBody);
  assert.equal(legacyParsed.postalCode, formData.zipCode);
  assert.equal(new Date(legacyParsed.scheduledDate).getHours(), 10);
  assert.equal(new Date(legacyParsed.scheduledDate).getMinutes(), 30);

  for (const mapping of [
    'postalCode: data.zipCode', 'scheduledDate: scheduledDate.toISOString()',
    'professionalId: data.professionalId', 'services: data.services',
    'address: data.address', 'city: data.city', 'state: data.state',
    'notes: data.notes', 'latitude: data.latitude', 'longitude: data.longitude',
  ]) assert.ok(apiClient.includes(mapping), `customer API no longer sends expected create field mapping: ${mapping}`);
  assert.match(apiClient, /headers:\s*\{\s*'Idempotency-Key':\s*idempotencyKey\s*\}/);
  assert.match(flow, /scheduledTime:\s*selectedTime\.toTimeString\(\)\.slice\(0,\s*5\)/);
  assert.match(flow, /zipCode,/);
});

test('Customer create response exposes the field actually consumed by checkout for both first call and replay', () => {
  const clientApi = source('mobile-client', 'src', 'services', 'api.ts');
  const flow = source('mobile-client', 'src', 'screens', 'booking', 'BookingFlowScreen.tsx');
  const create = bookingMutationResponses.create;
  assert.match(clientApi, /return response\.data\.booking;/);
  assert.match(flow, /response\.id/);

  for (const status of [200, 201]) {
    const response = create.responses[status];
    assert.ok(response, `create status ${status} missing`);
    const body = response.schema.parse(response.serialize({
      message: 'Booking created successfully', booking: booking(), duplicate: status === 200,
    }, { user: { role: 'CLIENT' } }));
    assert.equal(typeof body.booking.id, 'string');
    assert.equal(body.duplicate, status === 200);
  }
  assert.match(clientApi, /return response\.data\.booking;/);
});

test('Booking reason inputs retain bounded runtime normalization that OpenAPI cannot claim as structural parity', () => {
  for (const schema of [bookingCancellationBody, bookingRejectionBody]) {
    assert.deepEqual(schema.parse(undefined), { reason: null });
    assert.deepEqual(schema.parse({ reason: null }), { reason: null });
    assert.deepEqual(schema.parse({ reason: '  Changed plans  ' }), { reason: 'Changed plans' });
    assert.equal(schema.parse({ reason: 'x'.repeat(700) }).reason.length, 500);
    assert.deepEqual(schema.parse({ reason: '  Changed plans  ', ignored: 'not persisted' }), { reason: 'Changed plans' });
  }
});

test('Professional list DTO contains the exact fields rendered by its booking card', () => {
  const card = source('mobile-professional', 'src', 'components', 'common', 'BookingCard.tsx');
  const output = bookingSchemas.professionalBooking.parse(
    bookingMutationResponses.complete.responses[200].serialize({
      message: 'Booking completed successfully', booking: booking(), duplicate: false, payout: null,
    }, { user: { role: 'PROFESSIONAL' } }).booking,
  );
  const consumed = [
    ['id', output.id], ['status', output.status], ['scheduledDate', output.scheduledDate],
    ['totalPrice', output.totalPrice], ['professionalEarnings', output.professionalEarnings],
    ['client.user.firstName', output.client.user.firstName], ['client.user.lastName', output.client.user.lastName],
    ['bookingServices[0].service.name', output.bookingServices[0].service.name],
  ];
  for (const [path, value] of consumed.slice(1)) assert.ok(value !== undefined, `response DTO omits rendered field ${path}`);
  for (const expression of [
    'booking.status', 'booking.scheduledDate', 'booking.totalPrice',
    'booking.professionalEarnings', 'booking.client.user.firstName', 'booking.client.user.lastName',
    'booking.bookingServices[0]?.service.name',
  ]) assert.ok(card.includes(expression), `expected rendered consumer read ${expression}`);
});

test('Customer and Professional transition UI calls match server actor authorization', () => {
  const customerUi = source('mobile-client', 'src', 'screens', 'booking', 'BookingDetailScreen.tsx');
  const customerHook = source('mobile-client', 'src', 'hooks', 'useBookings.ts');
  const professionalUi = source('mobile-professional', 'src', 'app', '(tabs)', 'bookings.tsx');
  const service = source('mobile-professional', 'src', 'services', 'api.ts');

  assert.match(customerUi, /apiClient\.cancelBooking\(bookingId\)/);
  assert.match(customerHook, /apiClient\.cancelBooking\(id\)/);
  assert.deepEqual(bookingCancellationBody.parse(undefined), { reason: null });
  assert.match(source('mobile-client', 'src', 'services', 'api.ts'), /post\(`\/bookings\/\$\{id\}\/cancel`\)/);
  assert.match(service, /post\(`\/bookings\/\$\{id\}\/cancel`\)/);

  const actionPaths = {
    confirm: '/:id/confirm', reject: '/:id/reject', start: '/:id/start', complete: '/:id/complete',
  };
  for (const [action, path] of Object.entries(actionPaths)) {
    const layer = routeFor(path);
    assert.ok(layer, `missing ${action} server route`);
    assert.ok(layer.route.stack.some((item) => item.handle === require('../src/middleware/auth').requireApprovedProfessional));
    const policy = layer.route.stack[0];
    assert.ok(policy, `${action} route lacks an authorize policy`);
    const customer = invokeMiddleware(policy.handle, { user: { role: 'CLIENT' } });
    assert.equal(customer.status, 403, `${action} must reject a customer actor`);
    const professional = invokeMiddleware(policy.handle, { user: { role: 'PROFESSIONAL' } });
    assert.equal(professional.nextCalled, true, `${action} must allow a professional actor to reach approval check`);
    const unapproved = invokeMiddleware(requireApprovedProfessional, { user: { role: 'PROFESSIONAL', professionalProfile: { status: 'PENDING_REVIEW' } } });
    assert.equal(unapproved.status, 403, `${action} must reject unapproved professionals`);
  }

  for (const action of ['confirmBooking', 'rejectBooking', 'startBooking', 'completeBooking']) {
    assert.ok(professionalUi.includes(`api.${action}`), `professional UI does not invoke ${action}`);
    assert.match(service, new RegExp(`async ${action}\\(id: string\\)`));
  }
  assert.doesNotMatch(professionalUi, /api\.cancelBooking\(/, 'professional cancel API is not currently used by this UI');
  assert.doesNotMatch(customerUi, /apiClient\.(confirmBooking|completeBooking)\(/);
  const customerRoot = repo('mobile-client', 'src');
  const hookFile = repo('mobile-client', 'src', 'hooks', 'useBookings.ts');
  const hookConsumers = sourceFiles(customerRoot)
    .filter((file) => file !== hookFile && /\buseBookings\b/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(customerRoot, file));
  assert.deepEqual(hookConsumers, [], 'customer confirm/complete helpers are in an unconsumed hook');
});

test('Customer consumer status type stays aligned with the Booking response enum', () => {
  const types = source('mobile-client', 'src', 'types', 'index.ts');
  const bookingStatusDeclaration = types.match(/export type BookingStatus\s*=\s*([^;]+);/s);
  assert.ok(bookingStatusDeclaration, 'customer BookingStatus type declaration missing');
  const declared = [...bookingStatusDeclaration[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]).sort();
  const emitted = [...bookingSchemas.customerBooking.shape.status.options].sort();
  assert.deepEqual(declared, emitted, 'customer BookingStatus declaration must represent emitted response statuses');
});

test('Admin Web and Public Web have no Booking lifecycle mutation consumer', () => {
  const admin = source('admin-web', 'src', 'pages', 'BookingsPage.tsx');
  const publicRoot = repo('public-web', 'src');
  assert.match(admin, /\/v1\/admin\/bookings\?page=/);
  assert.doesNotMatch(admin, /\/(confirm|reject|start|complete|cancel)(?:[?`'"/]|$)/);
  if (fs.existsSync(publicRoot)) {
    const publicFiles = [];
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (/\.[jt]sx?$/.test(entry.name)) publicFiles.push(fs.readFileSync(target, 'utf8'));
      }
    };
    visit(publicRoot);
    assert.doesNotMatch(publicFiles.join('\n'), /\/bookings\/\$\{[^}]+\}\/(confirm|reject|start|complete|cancel)/);
  }
});
