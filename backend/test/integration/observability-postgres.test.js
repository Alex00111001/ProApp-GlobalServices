require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') {
  throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true to run database integration tests deliberately.');
}
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated Supabase test database.');
if (process.env.NODE_ENV === 'production') throw new Error('Database integration tests refuse production.');

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../src/config/prisma');
const { reportError } = require('../../src/modules/observability/error.service');
const { ensureIncidentForError } = require('../../src/modules/observability/incident.service');
const { transitionIncident } = require('../../src/modules/observability/incident-lifecycle.service');
const { getReadiness } = require('../../src/modules/observability/health.service');

// Dot-separated bounded segments survive telemetry redaction while remaining unique
// between runs. A long opaque token is intentionally redacted and would collapse
// independent test runs into the same production fingerprint.
const runId = `observability.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
let groupId;
let incidentId;

test.after(async () => {
  if (incidentId) {
    await prisma.incidentComment.deleteMany({ where: { incidentId } });
    await prisma.incidentEvent.deleteMany({ where: { incidentId } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: incidentId } });
    await prisma.auditLog.deleteMany({ where: { resourceId: incidentId } });
    await prisma.incident.deleteMany({ where: { id: incidentId } });
  }
  if (groupId) {
    await prisma.errorEvent.deleteMany({ where: { errorGroupId: groupId } });
    await prisma.auditLog.deleteMany({ where: { resourceId: groupId } });
    await prisma.errorGroup.deleteMany({ where: { id: groupId } });
  }
  await prisma.serviceHealthSnapshot.deleteMany({ where: { metadata: { path: ['testRun'], equals: runId } } }).catch(() => {});
  await prisma.$disconnect();
});

test('PostgreSQL persists concurrent grouped occurrences, one incident and an auditable reopen', async () => {
  const request = (sequence) => ({
    method: 'POST',
    originalUrl: `/integration/observability?secret=${sequence}`,
    params: {},
    context: {
      requestId: `${runId}-request-${sequence}`,
      correlationId: runId,
      traceId: sequence.toString(16).padStart(32, '0'),
      spanId: sequence.toString(16).padStart(16, '0'),
    },
    get: () => 'integration-test',
  });

  const reports = await Promise.all(Array.from({ length: 20 }, (_, index) => reportError(
    Object.assign(new Error(`Provider operation ${10_000 + index} failed`), {
      code: 'OBSERVABILITY_INTEGRATION_FAILURE',
      module: runId,
      operation: 'concurrent-grouping',
      severity: 'ERROR',
    }),
    request(index + 1),
    prisma
  )));

  const group = await prisma.errorGroup.findUnique({ where: { fingerprint: reports[0].group.fingerprint } });
  groupId = group.id;
  assert.equal(group.occurrenceCount, 20);
  assert.equal(group.windowOccurrenceCount, 20);
  assert.equal(await prisma.errorEvent.count({ where: { errorGroupId: group.id } }), 20);

  const report = { group, event: reports.at(-1).event };
  const [first, duplicate] = await Promise.all([
    ensureIncidentForError(report, prisma),
    ensureIncidentForError(report, prisma),
  ]);
  incidentId = first.id;
  assert.equal(first.id, duplicate.id);
  assert.equal(await prisma.incident.count({ where: { errorGroupId: group.id } }), 1);
  assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: incidentId, eventType: 'incident.alert_requested' } }), 1);

  for (const status of ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED', 'INVESTIGATING']) {
    await transitionIncident({
      incidentId,
      toStatus: status,
      reason: `Integration transition to ${status}`,
      context: { requestId: `${runId}-${status}`, correlationId: runId, traceId: reports[0].event.traceId },
    }, prisma);
  }
  const reopened = await prisma.incident.findUnique({ where: { id: incidentId } });
  assert.equal(reopened.status, 'INVESTIGATING');
  assert.equal(reopened.resolvedAt, null);
  assert.equal(reopened.closedAt, null);
  assert.equal(await prisma.incidentEvent.count({ where: { incidentId, eventType: 'REOPENED' } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { resourceId: incidentId, correlationId: runId } }), 7);
  assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: incidentId, eventType: 'incident.reopened' } }), 1);
});

test('PostgreSQL-backed readiness checks required dependencies without leaking connection data', async () => {
  const readiness = await getReadiness(prisma);
  assert.notEqual(readiness.status, 'OUTAGE');
  assert.equal(readiness.dependencies.database.status, 'HEALTHY');
  assert.doesNotMatch(JSON.stringify(readiness), /postgres(?:ql)?:\/\//i);
});
