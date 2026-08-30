const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, roleGrantsPermission } = require('../src/modules/identity/permission-catalog');
const { inPercentage, matchesRules } = require('../src/modules/configuration/feature-flags.service');
const { EVENT_NAMES, isKnownEvent } = require('../src/modules/growth/events/event-taxonomy');
const { sanitizeMetadata, trackEvent } = require('../src/modules/growth/events/event.service');

test('administrative roles expose least-privilege permission sets', () => {
  assert.equal(roleGrantsPermission('SUPER_ADMIN', PERMISSIONS.ROLES_MANAGE), true);
  assert.equal(roleGrantsPermission('MARKETING_ADMIN', PERMISSIONS.MARKETING_MANAGE), true);
  assert.equal(roleGrantsPermission('MARKETING_ADMIN', PERMISSIONS.PAYOUTS_MANAGE), false);
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
