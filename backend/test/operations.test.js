process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Prisma } = require('@prisma/client');
const {
  getFinancialMonitoring,
  listAlertDeliveries,
  listIntegrations,
  listJobs,
} = require('../src/modules/admin/operations-read.service');
const {
  errorListQuerySchema,
  incidentStatusSchema,
  operationalListQuerySchema,
} = require('../src/validators/admin-operations.validators');
const { ROLE_PERMISSIONS } = require('../src/modules/identity/permission-catalog');
const { operationsResponses } = require('../src/contracts/operations.responses');

test('F5 operational query contracts cap cardinality and require auditable mutation reasons', () => {
  assert.equal(errorListQuerySchema.parse({ limit: '100' }).limit, 100);
  assert.throws(() => errorListQuerySchema.parse({ limit: '101' }));
  assert.equal(operationalListQuerySchema.parse({ page: '2' }).page, 2);
  assert.throws(() => incidentStatusSchema.parse({ status: 'INVESTIGATING', reason: 'short' }));
});

test('operations roles separate read visibility from error and incident mutation', () => {
  assert.ok(ROLE_PERMISSIONS.OPERATIONS_ADMIN.includes('operations.read'));
  assert.ok(ROLE_PERMISSIONS.OPERATIONS_ADMIN.includes('errors.manage'));
  assert.ok(ROLE_PERMISSIONS.SUPPORT_ADMIN.includes('errors.read'));
  assert.equal(ROLE_PERMISSIONS.SUPPORT_ADMIN.includes('errors.manage'), false);
  assert.equal(ROLE_PERMISSIONS.FINANCE_ADMIN.includes('financial.monitoring.read'), true);
});

test('job, integration and alert views expose failure state without raw provider or worker errors', async () => {
  const secretError = 'postgresql://operator:secret@private-host/database';
  const client = {
    outboxEvent: {
      findMany: async ({ where }) => where.eventType
        ? [{ id: 'alert-1', aggregateId: 'incident-1', eventType: 'incident.alert_requested', status: 'FAILED', attempts: 2, availableAt: new Date(), processedAt: null, createdAt: new Date(), payload: { route: 'operations-on-call', severity: 'HIGH', authorization: 'Bearer secret' }, lastError: secretError }]
        : [{ id: 'job-1', aggregateType: 'BOOKING', eventType: 'booking.created', status: 'FAILED', attempts: 2, availableAt: new Date(), lockedAt: null, processedAt: null, createdAt: new Date(), lastError: secretError }],
      count: async () => 1,
    },
    integrationEvent: {
      findMany: async () => [{ id: 'integration-1', provider: 'stripe', eventType: 'payment_intent.succeeded', status: 'FAILED', attempts: 1, correlationId: 'corr-1', receivedAt: new Date(), processingStartedAt: new Date(), processedAt: null, updatedAt: new Date(), lastError: secretError }],
      count: async () => 1,
    },
  };
  const query = { page: 1, limit: 25 };
  const [jobs, integrations, alerts] = await Promise.all([
    listJobs(query, client),
    listIntegrations(query, client),
    listAlertDeliveries(query, client),
  ]);
  assert.equal(jobs.items[0].hasError, true);
  assert.equal(integrations.items[0].hasError, true);
  assert.equal(alerts.items[0].route, 'operations-on-call');
  assert.equal(JSON.stringify({ jobs, integrations, alerts }).includes(secretError), false);
  assert.equal(Object.hasOwn(alerts.items[0], 'payload'), false);
});

test('alert list keeps safe historical routing data and omits malformed metadata', async () => {
  const time = new Date('2026-09-21T08:00:00.000Z');
  const row = {
    aggregateId: 'incident-1', eventType: 'incident.reopened', status: 'PENDING',
    attempts: 0, availableAt: time, processedAt: null, createdAt: time, lastError: null,
  };
  const payloads = [
    null, ['route'], { route: { internal: 'synthetic-private-value' }, severity: true },
    { route: '', severity: '' }, { route: 'https://example.invalid/webhook', severity: 'unexpected free text' },
    { route: 'operations-on-call', severity: 'HIGH' },
  ];
  const response = await listAlertDeliveries({ page: 1, limit: 25 }, {
    outboxEvent: {
      findMany: async () => payloads.map((payload, index) => ({ ...row, id: String(index), payload })),
      count: async () => payloads.length,
    },
  });
  const { schema, serialize } = operationsResponses.alerts.responses[200];
  const output = schema.parse(serialize(response));
  assert.deepEqual(output.items.map(({ route, severity }) => [route, severity]), [
    [null, null], [null, null], [null, null], [null, null], [null, null], ['operations-on-call', 'HIGH'],
  ]);
  assert.equal(JSON.stringify(output).includes('synthetic-private-value'), false);
});

test('financial monitoring is currency-separated, decimal-safe and read-only', async () => {
  const client = {
    refund: { groupBy: async () => [{ status: 'FAILED', currency: 'EUR', _count: { _all: 2 }, _sum: { totalAmount: new Prisma.Decimal('12.3456') } }] },
    payout: { groupBy: async () => [{ status: 'COMPLETED', currency: 'EUR', _count: { _all: 1 }, _sum: { amount: new Prisma.Decimal('9.1') } }] },
    dispute: { groupBy: async () => [{ status: 'OPEN', currency: 'USD', _count: { _all: 1 }, _sum: { amount: new Prisma.Decimal('20'), recoveredAmount: new Prisma.Decimal('2') } }] },
    reconciliationRun: { findMany: async () => [] },
  };
  const result = await getFinancialMonitoring(client);
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.refunds[0], { status: 'FAILED', currency: 'EUR', count: 2, amount: '12.35' });
  assert.equal(result.disputes[0].recoveredAmount, '2.00');
});
