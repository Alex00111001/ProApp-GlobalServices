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
      name: 'Ana María López',
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
});

test('separate legacy time is merged into the scheduled date', () => {
  const result = normalizeBookingPayload({
    scheduledDate: '2026-09-10T00:00:00.000Z',
    scheduledTime: '14:35',
  });
  const date = new Date(result.scheduledDate);
  assert.equal(date.getHours(), 14);
  assert.equal(date.getMinutes(), 35);
});
