const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { REQUEST_EVIDENCE, consumerMethod } = require('../scripts/api-contract/consumer-request-evidence');
const { buildInventory } = require('../scripts/api-contract/inventory-command');
const { buildOpenApi } = require('../scripts/api-contract/openapi-command');
const { createBookingSchema, loginSchema } = require('../src/validators/auth.validators');
const { bookingCancellationBody, bookingRejectionBody, paymentConfirmationBody, bookingIdParams, bookingListQuery } = require('../src/validators/legacy-request.validators');
const { normalizeBookingPayload } = require('../src/shared/http/compatibility');
const { bookingInputContext } = require('../src/contracts/booking.inputs');
const { uuid, booking } = require('./helpers/input-contract-cases');

const inventory = buildInventory();
const api = buildOpenApi(inventory);
const ajv = new Ajv({ strict: false }); addFormats(ajv);
async function executeActualConsumer(entry, args) {
  const { source } = consumerMethod(entry);
  const script = entry.consumer === 'Customer mobile' ? `class Consumer { ${source} }; new Consumer()` : `const consumer = { ${source} }; consumer`;
  const calls = [];
  const transport = Object.fromEntries(['post', 'get'].map((method) => [method, async (url, body, config) => {
    calls.push({ method: method.toUpperCase(), url, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)), config });
    return { data: { user: { role: 'PROFESSIONAL' }, booking: { id: uuid } } };
  }]));
  // Only the network and device storage are isolated. The request-building production method is executed unchanged.
  const consumer = vm.runInNewContext(stripTypeScriptTypes(script, { mode: 'strip' }), {
    client: transport, Date, Number, JSON, SecureStore: { setItemAsync: async () => {} }, TOKEN_KEY: 'test-storage-key',
  });
  consumer.client = transport;
  await consumer[entry.method](...args);
  assert.equal(calls.length, 1);
  return calls[0];
}

for (const entry of REQUEST_EVIDENCE) test(`${entry.consumer} ${entry.method}: execute actual request builder against wire/runtime authority`, async () => {
  const args = entry.method === 'createBooking' ? [{ ...booking, zipCode: booking.postalCode, scheduledTime: '10:30' }, 'consumer-booking-key-001']
    : entry.method === 'login' ? [' PERSON@EXAMPLE.INVALID ', 'unit-placeholder-only']
      : entry.method === 'confirmPayment' ? [uuid, ' pi_example123 ']
        : entry.method === 'bookings' ? [50] : [uuid];
  const sent = await executeActualConsumer(entry, args);
  assert.equal(sent.method, entry.operation.split(' ')[0]);
  const route = inventory.routes.find((r) => `${r.method} ${r.path}` === entry.operation);
  assert.ok(route);
  assert.ok(inventory.consumers.some((c) => c.operation === entry.operation && c.file === entry.file && c.inputCompatibilityEvidence?.method === entry.method));
  assert.equal(`/api${sent.url}`.replace(uuid, '{id}'), route.path);
  const operation = api.paths[route.path][route.method.toLowerCase()];
  if (entry.method === 'createBooking') {
    assert.ok(createBookingSchema.safeParse(normalizeBookingPayload(sent.body)).success);
    assert.equal(bookingInputContext.header.parse(sent.config.headers['Idempotency-Key']), 'consumer-booking-key-001');
    assert.equal(new Date(sent.body.scheduledDate).getHours(), 10);
    assert.equal(new Date(sent.body.scheduledDate).getMinutes(), 30);
    assert.equal(ajv.compile(operation.requestBody.content['application/json'].schema)(sent.body), true);
  } else if (entry.method === 'login' || entry.method === 'confirmPayment') {
    const schema = entry.method === 'login' ? loginSchema : paymentConfirmationBody;
    assert.ok(schema.safeParse(sent.body).success);
    assert.equal(ajv.compile(operation.requestBody.content['application/json'].schema)(sent.body), true);
  } else if (entry.method === 'bookings') {
    assert.deepEqual(bookingListQuery.parse(sent.body.params), { page: 1, limit: 50 });
  } else {
    assert.ok(bookingIdParams.safeParse({ id: uuid }).success);
    assert.equal(sent.body, undefined, 'Professional/Customer sends bodyless lifecycle command.');
    if (entry.method === 'rejectBooking' || entry.method === 'cancelBooking') {
      const schema = entry.method === 'rejectBooking' ? bookingRejectionBody : bookingCancellationBody;
      assert.deepEqual(schema.parse(sent.body), { reason: null });
      assert.equal(operation.requestBody.required, false);
    } else assert.equal(operation['x-homeservices-request-body'], 'IGNORED_BY_RUNTIME_NOT_COMMAND_FIELDS');
  }
});
