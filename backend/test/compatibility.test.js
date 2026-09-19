const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBookingPayload,
  normalizeRegistrationPayload,
} = require('../src/shared/http/compatibility');

test('legacy full name registration is accepted without overriding canonical fields', () => {
  assert.deepEqual(
    normalizeRegistrationPayload({ name: 'Ana María López', email: 'ana@example.com' }),
    {
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'María López',
    }
  );
  assert.equal(
    normalizeRegistrationPayload({ name: 'Legacy Name', firstName: 'Canonical', lastName: 'User' }).firstName,
    'Canonical'
  );
});

test('legacy zipCode is normalized to postalCode', () => {
  const result = normalizeBookingPayload({ zipCode: '30001' });
  assert.equal(result.postalCode, '30001');
  assert.equal(Object.hasOwn(result, 'zipCode'), false);
});

test('separate legacy time is merged into the scheduled date', () => {
  const result = normalizeBookingPayload({
    scheduledDate: '2026-09-10T00:00:00.000Z',
    scheduledTime: '14:35',
  });
  const date = new Date(result.scheduledDate);
  assert.equal(date.getHours(), 14);
  assert.equal(date.getMinutes(), 35);
  assert.equal(Object.hasOwn(result, 'scheduledTime'), false);
});

test('supported old and canonical booking requests pass the same runtime schema', () => {
  const { createBookingSchema } = require('../src/validators/auth.validators');
  const canonical = {
    professionalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    services: [{ serviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', quantity: 1 }],
    scheduledDate: '2026-09-20T12:00:00.000Z',
    address: 'Example address', city: 'Madrid', state: 'Madrid', postalCode: '28001',
  };
  const { postalCode, ...old } = canonical;
  const normalized = normalizeBookingPayload({ ...old, zipCode: postalCode, scheduledTime: '14:35' });
  assert.equal(createBookingSchema.safeParse(normalized).success, true);
  assert.equal(createBookingSchema.safeParse(normalizeBookingPayload(canonical)).success, true);
  assert.equal(createBookingSchema.safeParse(normalizeBookingPayload({ ...canonical, unknown: true })).success, false);
  assert.equal(normalizeBookingPayload(null), null);
  assert.deepEqual(normalizeBookingPayload([]), []);
});

test('old registration aliases are removed while unknown fields remain rejected', () => {
  const { registerSchema } = require('../src/validators/auth.validators');
  const { LEGAL_DOCUMENT_VERSION } = require('../src/config/business');
  const input = {
    name: 'Example Person', email: 'example@example.test', phone: '+34910000000',
    password: 'Example-passphrase-123', countryCode: 'ES', acceptTerms: true,
    acceptPrivacy: true, termsVersion: LEGAL_DOCUMENT_VERSION, privacyVersion: LEGAL_DOCUMENT_VERSION,
  };
  assert.equal(registerSchema.safeParse(normalizeRegistrationPayload(input)).success, true);
  assert.equal(registerSchema.safeParse(normalizeRegistrationPayload({ ...input, unknown: true })).success, false);
});

test('bodyless mobile cancellation and rejection retain optional-reason compatibility', () => {
  const { bookingCancellationBody, bookingRejectionBody } = require('../src/validators/legacy-request.validators');
  for (const schema of [bookingCancellationBody, bookingRejectionBody]) {
    assert.deepEqual(schema.parse(undefined), { reason: null });
    assert.deepEqual(schema.parse({ reason: '  Example reason  ' }), { reason: 'Example reason' });
    assert.equal(schema.safeParse({ reason: 123 }).success, false);
  }
});
