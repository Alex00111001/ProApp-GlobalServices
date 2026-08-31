const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, roleGrantsPermission } = require('../src/modules/identity/permission-catalog');
const { getPermissionKeys, hasPermission } = require('../src/modules/identity/authorization.service');
const { inPercentage, matchesRules } = require('../src/modules/configuration/feature-flags.service');
const { EVENT_NAMES, isKnownEvent } = require('../src/modules/growth/events/event-taxonomy');
const { sanitizeMetadata, trackEvent } = require('../src/modules/growth/events/event.service');
const { fingerprintError, normalizeMessage } = require('../src/modules/observability/error.service');
const { shouldRecommendIncident } = require('../src/modules/observability/incident.service');
const { normalizeErrorBody } = require('../src/shared/http/error-contract');
const { validateEnvironment } = require('../src/config/env');
const {
  markOutboxProcessed,
  rescheduleOutboxEvent,
  retryDelayMs,
  sanitizeOutboxError,
} = require('../src/modules/events/outbox.service');

test('administrative roles expose least-privilege permission sets', () => {
  assert.equal(roleGrantsPermission('SUPER_ADMIN', PERMISSIONS.ROLES_MANAGE), true);
  assert.equal(roleGrantsPermission('MARKETING_ADMIN', PERMISSIONS.MARKETING_MANAGE), true);
  assert.equal(roleGrantsPermission('MARKETING_ADMIN', PERMISSIONS.PAYOUTS_MANAGE), false);
  assert.equal(roleGrantsPermission('FINANCE_ADMIN', PERMISSIONS.PAYOUTS_MANAGE), true);
  assert.equal(roleGrantsPermission('FINANCE_ADMIN', PERMISSIONS.DISPUTES_READ), true);
  assert.equal(roleGrantsPermission('FINANCE_ADMIN', PERMISSIONS.RECONCILIATION_RUN), true);
  assert.equal(roleGrantsPermission('OPERATIONS_ADMIN', PERMISSIONS.RECONCILIATION_RUN), false);
});

test('database-backed RBAC grants only permissions from active assignments', async () => {
  let query;
  const client = {
    userRoleAssignment: {
      findMany: async (input) => {
        query = input;
        return [{
          role: {
            key: 'FINANCE_ADMIN',
            permissions: [{ permission: { key: PERMISSIONS.PAYOUTS_MANAGE } }],
          },
        }];
      },
    },
  };
  const user = { id: 'user-1', role: 'CLIENT' };
  const keys = await getPermissionKeys(user, client);
  assert.equal(query.where.status, 'ACTIVE');
  assert.equal(keys.has(PERMISSIONS.PAYOUTS_MANAGE), true);
  assert.equal(await hasPermission(user, PERMISSIONS.REFUNDS_MANAGE, client), false);
});

test('legacy ADMIN compatibility bridge remains explicit and database independent', async () => {
  const client = { userRoleAssignment: { findMany: async () => { throw new Error('must not query'); } } };
  assert.equal(await hasPermission({ id: 'legacy', role: 'ADMIN' }, PERMISSIONS.ROLES_MANAGE, client), true);
  assert.equal(await hasPermission(null, PERMISSIONS.DASHBOARD_READ, client), false);
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

test('feature rules fail closed when persisted configuration is malformed', () => {
  assert.equal(matchesRules('flag', { percentage: 101 }, { subjectId: '1' }), false);
  assert.equal(matchesRules('flag', { countries: 'ES' }, { country: 'ES', subjectId: '1' }), false);
  assert.equal(matchesRules('flag', { unknown: true }, { subjectId: '1' }), false);
});

test('event taxonomy keeps customer and professional funnel milestones explicit', () => {
  assert.equal(isKnownEvent('booking_created'), true);
  assert.equal(isKnownEvent('referral_converted'), true);
  assert.equal(isKnownEvent('password_entered'), false);
  assert.equal(new Set(EVENT_NAMES).size, EVENT_NAMES.length);
});

test('event metadata removes credentials recursively', () => {
  assert.deepEqual(sanitizeMetadata({ screen: 'checkout', token: 'secret', email: 'person@example.com', nested: { cvv: '123', phone: '+34123', step: 2 } }), {
    screen: 'checkout',
    nested: { step: 2 },
  });
});

test('production configuration fails closed and accepts an explicit complete configuration', () => {
  const valid = {
    NODE_ENV: 'production',
    PORT: '8080',
    DATABASE_URL: 'postgresql://user:password@database.example:5432/app',
    CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
    JWT_SECRET: 'a-secure-production-secret-with-32-characters',
    STRIPE_API_KEY: `rk_live_${'a'.repeat(32)}`,
    STRIPE_WEBHOOK_SECRET: `whsec_${'b'.repeat(32)}`,
  };
  assert.equal(validateEnvironment(valid).corsOrigins.length, 2);
  assert.throws(() => validateEnvironment({ ...valid, CORS_ORIGINS: '*' }), /explicit HTTP/);
  assert.throws(() => validateEnvironment({ ...valid, DATABASE_URL: '' }), /DATABASE_URL/);
  assert.throws(() => validateEnvironment({ ...valid, JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => validateEnvironment({ ...valid, FINANCIAL_PAYOUT_EXECUTION_ENABLED: 'yes' }), /either true or false/);
});

test('error contract adds stable correlation and redacts production failures', () => {
  assert.deepEqual(normalizeErrorBody({
    body: { error: 'Missing token' },
    statusCode: 401,
    correlationId: 'journey-1',
    isProduction: true,
  }), {
    error: 'Missing token',
    code: 'AUTHENTICATION_REQUIRED',
    correlationId: 'journey-1',
  });
  assert.deepEqual(normalizeErrorBody({
    body: { error: 'database password leaked', message: 'stack detail', details: ['secret'] },
    statusCode: 500,
    correlationId: 'journey-2',
    isProduction: true,
  }), {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    correlationId: 'journey-2',
  });
});

test('outbox leases are completed conditionally and failures back off or dead-letter', async () => {
  const writes = [];
  const client = { outboxEvent: { updateMany: async (input) => { writes.push(input); return { count: 1 }; } } };
  const lockedAt = new Date('2026-08-31T12:00:00.000Z');
  await markOutboxProcessed({ id: 'event-1', lockedAt }, client);
  await rescheduleOutboxEvent({ id: 'event-2', lockedAt, attempts: 2, error: new Error(`Bearer ${'x'.repeat(32)}`) }, client);
  await rescheduleOutboxEvent({ id: 'event-3', lockedAt, attempts: 8, error: 'failed' }, client);
  assert.deepEqual(writes[0].where, { id: 'event-1', status: 'PROCESSING', lockedAt });
  assert.equal(writes[1].data.status, 'PENDING');
  assert.equal(writes[2].data.status, 'DEAD_LETTER');
  assert.equal(retryDelayMs(2), 2_000);
  assert.equal(sanitizeOutboxError(`Bearer ${'x'.repeat(32)}`), '[REDACTED]');
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
