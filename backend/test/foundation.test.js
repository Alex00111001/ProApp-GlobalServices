const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, roleGrantsPermission } = require('../src/modules/identity/permission-catalog');
const { inPercentage, matchesRules } = require('../src/modules/configuration/feature-flags.service');
const { EVENT_NAMES, isKnownEvent } = require('../src/modules/growth/events/event-taxonomy');
const { sanitizeMetadata, trackEvent } = require('../src/modules/growth/events/event.service');
const { fingerprintError, normalizeMessage } = require('../src/modules/observability/error.service');
const { shouldRecommendIncident } = require('../src/modules/observability/incident.service');

test('administrative roles expose least-privilege permission sets', () => {
  assert.equal(roleGrantsPermission('SUPER_ADMIN', PERMISSIONS.ROLES_MANAGE), true);
  assert.equal(roleGrantsPermission('MARKETING_ADMIN', PERMISSIONS.MARKETING_MANAGE), true);
  assert.equal(roleGrantsPermission('MARKETING_ADMIN', PERMISSIONS.PAYOUTS_MANAGE), false);
  assert.equal(roleGrantsPermission('FINANCE_ADMIN', PERMISSIONS.PAYOUTS_MANAGE), true);
  assert.equal(roleGrantsPermission('FINANCE_ADMIN', PERMISSIONS.DISPUTES_READ), true);
  assert.equal(roleGrantsPermission('FINANCE_ADMIN', PERMISSIONS.RECONCILIATION_RUN), true);
  assert.equal(roleGrantsPermission('OPERATIONS_ADMIN', PERMISSIONS.RECONCILIATION_RUN), false);
});

test('feature percentage assignment is deterministic', () => {
  const first = inPercentage('new-refunds', 'user-42', 25);
  assert.equal(inPercentage('new-refunds', 'user-42', 25), first);
  assert.equal(inPercentage('new-refunds', 'user-42', 100), true);
  assert.equal(inPercentage('new-refunds', 'user-42', 0), false);
});

test('feature rules require every configured market dimension', () => {
  const rules = { environments: ['production'], countries: ['ES'], percentage: 100 };
  assert.equal(matchesRules('flag', rules, { environment: 'production', country: 'ES', subjectId: '1' }), true);
  assert.equal(matchesRules('flag', rules, { environment: 'production', country: 'MX', subjectId: '1' }), false);
});

test('event taxonomy keeps customer and professional funnel milestones explicit', () => {
  assert.equal(isKnownEvent('booking_created'), true);
  assert.equal(isKnownEvent('referral_converted'), true);
  assert.equal(isKnownEvent('password_entered'), false);
  assert.equal(new Set(EVENT_NAMES).size, EVENT_NAMES.length);
});

test('event metadata removes credentials recursively', () => {
  assert.deepEqual(sanitizeMetadata({ screen: 'checkout', token: 'secret', nested: { cvv: '123', step: 2 } }), {
    screen: 'checkout',
    nested: { step: 2 },
  });
});

test('event ingestion derives identity outside the submitted payload', async () => {
  let created;
  const client = { marketingEvent: { create: async (input) => { created = input.data; return { id: 'event-1' }; } } };
  await trackEvent({ eventName: 'app_opened', userId: 'spoofed', metadata: {} }, { userId: 'trusted' }, client);
  assert.equal(created.userId, 'trusted');
});

test('error fingerprints group variable identifiers and numbers', () => {
  const a = fingerprintError({ message: 'Payment 12345 failed for 123e4567-e89b-12d3-a456-426614174000' });
  const b = fingerprintError({ message: 'Payment 67890 failed for 987e6543-e21b-12d3-a456-426614174999' });
  assert.equal(a, b);
  assert.equal(normalizeMessage('order 12345'), 'order :number');
});

test('incident recommendation requires threshold inside the time window', () => {
  assert.equal(shouldRecommendIncident({ occurrenceCount: 20, firstSeenAt: new Date() }), true);
  assert.equal(shouldRecommendIncident({ occurrenceCount: 19, firstSeenAt: new Date() }), false);
  assert.equal(shouldRecommendIncident({ occurrenceCount: 100, firstSeenAt: new Date(Date.now() - 600_000) }), false);
});
