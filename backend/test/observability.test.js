process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger } = require('../src/modules/observability/logger');
const { redactText, sanitizeTelemetry } = require('../src/modules/observability/redaction');
const { fingerprintError, reportError } = require('../src/modules/observability/error.service');
const { ensureIncidentForError } = require('../src/modules/observability/incident.service');
const {
  INCIDENT_TRANSITIONS,
  transitionIncident,
} = require('../src/modules/observability/incident-lifecycle.service');
const { createWebhookAlertAdapter } = require('../src/modules/observability/alerting.service');
const { getLiveness, getReadiness } = require('../src/modules/observability/health.service');
const { registry } = require('../src/modules/observability/metrics');
const { telemetryMetadata } = require('../src/modules/observability/context');

test('central telemetry sanitization removes secrets, payment data and PII recursively', () => {
  const sanitized = sanitizeTelemetry({
    operation: 'capture',
    password: 'secret',
    nested: { email: 'person@example.com', cardNumber: '4242424242424242', safe: 'ok' },
  });
  assert.deepEqual(sanitized, { operation: 'capture', nested: { safe: 'ok' } });
  const text = redactText('whsec_abcdefghijklmnopqrstuvwxyz012345 person@example.com 4242 4242 4242 4242 +34 612 345 678 10.1.2.3');
  assert.doesNotMatch(text, /whsec_|person@|4242|612|10\.1\.2\.3/);
});

test('asynchronous metadata preserves correlation and a valid W3C carrier', () => {
  const metadata = telemetryMetadata({
    requestId: 'request-1', correlationId: 'journey-1',
    traceId: '0123456789abcdef0123456789abcdef', spanId: '0123456789abcdef',
  }, { event: 'payment.completed', token: 'never-store-this-token' });
  assert.equal(metadata.requestId, 'request-1');
  assert.equal(metadata.correlationId, 'journey-1');
  assert.equal(metadata.traceId, '0123456789abcdef0123456789abcdef');
  assert.equal(metadata.traceparent, '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
  assert.equal('token' in metadata, false);
});

test('structured logger never serializes protected fields or raw exception stacks', () => {
  const output = [];
  const log = createLogger({ write: (chunk) => output.push(JSON.parse(chunk)) });
  log.error({ password: 'top-secret', email: 'person@example.com', err: Object.assign(new Error('token=abcdabcdabcdabcdabcdabcdabcd'), { stack: 'secret stack' }) }, 'failed');
  assert.equal(output.length, 1);
  const serialized = JSON.stringify(output[0]);
  assert.doesNotMatch(serialized, /top-secret|person@example\.com|secret stack|abcdabcd/);
  assert.equal(output[0].service, 'homeservices-core-api');
  assert.equal(output[0].level, 50);
});

const createErrorDatabase = () => {
  const groups = new Map();
  const events = [];
  const errorGroup = {
    updateMany: async ({ where, data }) => {
      const group = groups.get(where.fingerprint);
      if (!group) return { count: 0 };
      const start = group.windowStartedAt.getTime();
      const matches = where.windowStartedAt.gte ? start >= where.windowStartedAt.gte.getTime() : start < where.windowStartedAt.lt.getTime();
      if (!matches) return { count: 0 };
      for (const [key, value] of Object.entries(data)) {
        group[key] = value && typeof value === 'object' && 'increment' in value ? group[key] + value.increment : value;
      }
      return { count: 1 };
    },
    create: async ({ data }) => {
      if (groups.has(data.fingerprint)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const group = { id: `group-${groups.size + 1}`, status: 'OPEN', occurrenceCount: 1, windowOccurrenceCount: 1, ...data };
      groups.set(group.fingerprint, group);
      return group;
    },
    findUnique: async ({ where }) => groups.get(where.fingerprint),
  };
  const client = {
    errorGroup,
    errorEvent: { create: async ({ data }) => { const event = { id: `event-${events.length + 1}`, ...data }; events.push(event); return event; } },
  };
  client.$transaction = (operation) => operation(client);
  return { client, events, groups };
};

test('equivalent failures produce one deterministic group and immutable correlated events', async () => {
  const database = createErrorDatabase();
  const req = {
    method: 'GET', originalUrl: '/bookings/123?token=secret',
    context: { requestId: 'req-1', correlationId: 'corr-1', traceId: '0123456789abcdef0123456789abcdef' },
    get: () => '1.2.3', params: {},
  };
  const first = await reportError(Object.assign(new Error('Booking 12345 failed for person@example.com'), { code: 'DB_FAILURE' }), req, database.client);
  const second = await reportError(Object.assign(new Error('Booking 67890 failed for another@example.com'), { code: 'DB_FAILURE' }), req, database.client);

  assert.equal(first.group.id, second.group.id);
  assert.equal(database.groups.size, 1);
  assert.equal(database.events.length, 2);
  assert.equal(second.group.occurrenceCount, 2);
  assert.equal(second.group.windowOccurrenceCount, 2);
  assert.equal(second.event.endpoint, '/bookings/:id');
  assert.equal(second.event.correlationId, 'corr-1');
  assert.doesNotMatch(second.event.message, /example\.com/);
  assert.equal(fingerprintError({ message: 'Failure 12345' }), fingerprintError({ message: 'Failure 67890' }));
});

test('incident creation deduplicates one error group window and emits one alert', async () => {
  const incidents = new Map();
  const outbox = [];
  const audits = [];
  const tx = {
    incident: {
      findUnique: async ({ where }) => incidents.get(where.deduplicationKey),
      create: async ({ data }) => {
        if (incidents.has(data.deduplicationKey)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const incident = { id: 'incident-1', status: 'OPEN', detectedAt: new Date(), ...data };
        incidents.set(data.deduplicationKey, incident);
        return incident;
      },
    },
    outboxEvent: { create: async ({ data }) => { outbox.push(data); } },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  const client = { ...tx, $transaction: (operation) => operation(tx) };
  const report = {
    group: { id: 'group-1', errorCode: 'DB_FAILURE', normalizedMessage: 'Database unavailable', service: 'api', severity: 'ERROR', windowStartedAt: new Date(), windowOccurrenceCount: 20 },
    event: { id: 'event-20', requestId: 'req', correlationId: 'corr', traceId: '0123456789abcdef0123456789abcdef' },
  };
  const first = await ensureIncidentForError(report, client);
  const duplicate = await ensureIncidentForError(report, client);
  assert.equal(first.id, duplicate.id);
  assert.equal(incidents.size, 1);
  assert.equal(outbox.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(outbox[0].payload.route, 'operations-on-call');
});

test('incident lifecycle is strict, auditable and supports controlled reopening', async () => {
  assert.deepEqual(INCIDENT_TRANSITIONS.CLOSED, ['INVESTIGATING']);
  let incident = { id: 'incident-1', status: 'CLOSED', severity: 'HIGH', service: 'api', closedAt: new Date(), resolvedAt: new Date(), detectedAt: new Date(), deduplicationKey: 'key' };
  const events = []; const audits = []; const outbox = [];
  const tx = {
    incident: {
      findUnique: async () => incident,
      updateMany: async ({ where, data }) => { if (where.status !== incident.status) return { count: 0 }; incident = { ...incident, ...data }; return { count: 1 }; },
    },
    incidentEvent: { create: async ({ data }) => events.push(data) },
    auditLog: { create: async ({ data }) => audits.push(data) },
    outboxEvent: { create: async ({ data }) => outbox.push(data) },
  };
  const client = { $transaction: (operation) => operation(tx) };
  const result = await transitionIncident({ incidentId: incident.id, toStatus: 'INVESTIGATING', actorId: 'admin', reason: 'Failure returned', context: { correlationId: 'corr' } }, client);
  assert.equal(result.incident.status, 'INVESTIGATING');
  assert.equal(result.incident.closedAt, null);
  assert.equal(events[0].eventType, 'REOPENED');
  assert.equal(audits.length, 1);
  assert.equal(outbox[0].eventType, 'incident.reopened');
  await assert.rejects(() => transitionIncident({ incidentId: incident.id, toStatus: 'CLOSED', actorId: 'admin', reason: 'invalid' }, client), /cannot transition/);
});

test('signed alert adapter sends a sanitized payload and fails on non-success responses', async () => {
  let request;
  const adapter = createWebhookAlertAdapter({
    url: 'https://alerts.example.com/hooks',
    signingSecret: 'a'.repeat(32),
    fetchImpl: async (url, options) => { request = { url: String(url), options }; return { ok: true, status: 202 }; },
  });
  await adapter({ incidentId: 'i-1', route: 'operations-on-call', email: 'person@example.com' });
  assert.equal(request.url, 'https://alerts.example.com/hooks');
  assert.match(request.options.headers['x-homeservices-alert-signature'], /^v1=[0-9a-f]{64}$/);
  assert.doesNotMatch(request.options.body, /person@example\.com/);

  const failing = createWebhookAlertAdapter({
    url: 'https://alerts.example.com/hooks',
    signingSecret: 'b'.repeat(32),
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(() => failing({ incidentId: 'i-2', route: 'operations-on-call' }), (error) => {
    assert.equal(error.code, 'ALERT_DELIVERY_FAILED');
    assert.equal(error.retryable, true);
    return true;
  });
});

test('liveness is process-only and readiness fails closed without infrastructure details', async () => {
  assert.equal(getLiveness().status, 'HEALTHY');
  const unavailable = {
    $queryRaw: async () => { throw new Error('postgresql://user:password@secret-host/database'); },
    outboxEvent: { groupBy: async () => { throw new Error('connection refused at secret-host'); }, count: async () => 0 },
  };
  const failed = await getReadiness(unavailable);
  assert.equal(failed.status, 'OUTAGE');
  assert.equal(failed.dependencies.database.message, 'Dependency unavailable');
  assert.doesNotMatch(JSON.stringify(failed), /secret-host|password/);

  const ready = await getReadiness({
    $queryRaw: async () => [{ '?column?': 1 }],
    outboxEvent: { groupBy: async () => [], count: async () => 0 },
  });
  assert.equal(ready.status, 'HEALTHY');
  assert.match(await registry.metrics(), /homeservices_dependency_checks_total/);
});
