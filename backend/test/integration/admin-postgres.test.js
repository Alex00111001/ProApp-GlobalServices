require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true deliberately.');
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated Supabase test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const prisma = require('../../src/config/prisma');
const app = require('../../src/app');
const { hashPassword } = require('../../src/utils/password');
const { bootstrapRbac } = require('../../src/modules/identity/bootstrap-rbac');
const { authenticateAdminToken, createAdminSession, refreshAdminSession } = require('../../src/modules/identity/admin-session.service');
const { decideRoleChange, requestRoleChange } = require('../../src/modules/identity/admin-role-change.service');
const { getDashboard } = require('../../src/modules/admin/admin-read.service');

const runId = `admin.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
const userIds = [];
const incidentIds = [];
let errorGroupId;
let changeId;
let supportCaseId;
let passwordHash;
const requestContext = (userId, suffix) => ({
  user: { id: userId }, ip: '127.0.0.1', get: () => 'admin-integration-test',
  context: { requestId: `${runId}-${suffix}`, correlationId: runId, traceId: '1'.repeat(32) },
});

test.before(async () => {
  await bootstrapRbac(prisma);
  passwordHash = await hashPassword('integration-password');
});

test.after(async () => {
  if (incidentIds.length) await prisma.incident.deleteMany({ where: { id: { in: incidentIds } } });
  if (errorGroupId) await prisma.errorGroup.deleteMany({ where: { id: errorGroupId } });
  if (changeId) await prisma.adminRoleChangeRequest.deleteMany({ where: { id: changeId } });
  if (supportCaseId) {
    await prisma.automationEventDelivery.deleteMany({ where: { sourceEvent: { aggregateType: 'SupportCase', aggregateId: supportCaseId } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'SupportCase', aggregateId: supportCaseId } });
    await prisma.supportCaseComment.deleteMany({ where: { caseId: supportCaseId } });
    await prisma.supportCaseEvent.deleteMany({ where: { caseId: supportCaseId } });
    await prisma.supportCase.deleteMany({ where: { id: supportCaseId } });
  }
  await prisma.adminSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { correlationId: runId }] } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

const createUser = async (label, roleId) => {
  const user = await prisma.user.create({
    data: {
      email: `${runId}-${label}@example.test`.toLowerCase(), phone: `${Date.now()}${Math.floor(Math.random() * 100_000)}`,
      passwordHash, firstName: label, lastName: 'AdminTest', role: 'CLIENT', countryCode: 'ES',
    },
  });
  userIds.push(user.id);
  if (roleId) await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId, status: 'ACTIVE' } });
  return user;
};

test('PostgreSQL rotates admin refresh material and revocation is checked on every access token', async () => {
  const superRole = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const admin = await createUser('SessionOwner', superRole.id);
  const created = await createAdminSession({ email: admin.email, password: 'integration-password', userAgent: 'integration-browser', ipAddress: '127.0.0.1' }, prisma);
  const firstHash = (await prisma.adminSession.findUniqueOrThrow({ where: { id: created.session.id } })).refreshTokenHash;
  const refreshed = await refreshAdminSession({ refreshToken: created.refreshToken, csrfToken: created.csrfToken, userAgent: 'integration-browser', ipAddress: '127.0.0.1' }, prisma);
  const rotated = await prisma.adminSession.findUniqueOrThrow({ where: { id: created.session.id } });
  assert.notEqual(rotated.refreshTokenHash, firstHash);
  assert.equal((await authenticateAdminToken(refreshed.accessToken, prisma)).user.id, admin.id);
  await prisma.adminSession.update({ where: { id: created.session.id }, data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'INTEGRATION_TEST' } });
  await assert.rejects(() => authenticateAdminToken(refreshed.accessToken, prisma), (error) => error.code === 'ADMIN_SESSION_INVALID');
});

test('PostgreSQL serializes four-eyes role approval and writes one effective assignment', async () => {
  const superRole = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const analystRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ANALYST' } });
  const requester = await createUser('Requester', superRole.id);
  const reviewerA = await createUser('ReviewerA', superRole.id);
  const reviewerB = await createUser('ReviewerB', superRole.id);
  const target = await createUser('Target', null);

  const requested = await requestRoleChange({
    targetUserId: target.id, roleId: analystRole.id, action: 'GRANT', reason: 'Integration test approved access request',
    idempotencyKey: `${runId}:grant-analyst`, req: requestContext(requester.id, 'request'),
  }, prisma, { enabled: true });
  changeId = requested.id;

  const [first, replay] = await Promise.all([
    decideRoleChange({ id: requested.id, decision: 'APPROVE', reason: 'Independent integration approval A', req: requestContext(reviewerA.id, 'approve-a') }, prisma, { enabled: true }),
    decideRoleChange({ id: requested.id, decision: 'APPROVE', reason: 'Independent integration approval B', req: requestContext(reviewerB.id, 'approve-b') }, prisma, { enabled: true }),
  ]);
  assert.equal(first.status, 'EXECUTED');
  assert.equal(replay.status, 'EXECUTED');
  assert.equal(await prisma.userRoleAssignment.count({ where: { userId: target.id, roleId: analystRole.id, status: 'ACTIVE' } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { resourceId: requested.id, action: 'ADMIN_ROLE_CHANGE_EXECUTED' } }), 1);
});

test('PostgreSQL dashboard returns explicit, freshness-aware financial definitions', async () => {
  const dashboard = await getDashboard({ currency: 'EUR', timezone: 'Europe/Madrid' }, prisma);
  assert.equal(dashboard.range.currency, 'EUR');
  assert.match(dashboard.definitions.netPlatformRevenue.description, /comisiones profesionales/);
  assert.equal(typeof dashboard.freshness.partialData, 'boolean');
  assert.match(dashboard.metrics.netPlatformRevenue, /^-?\d+\.\d{2}$/);
});

test('HTTP admin contracts authenticate with cookies and audit deterministic 403 denials', async () => {
  const supportRole = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPPORT_ADMIN' } });
  const support = await createUser('HttpSupport', supportRole.id);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1/admin`;

  try {
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-correlation-id': `${runId}-http-login` },
      body: JSON.stringify({ email: support.email, password: 'integration-password' }),
    });
    assert.equal(login.status, 201);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(login.headers.get('set-cookie'), /SameSite=Strict/i);
    const session = await login.json();

    const denied = await fetch(`${baseUrl}/roles`, {
      headers: { authorization: `Bearer ${session.accessToken}`, 'x-correlation-id': `${runId}-http-denied` },
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 403);
    assert.equal(deniedBody.code, 'INSUFFICIENT_PERMISSION');
    assert.equal(deniedBody.correlationId, `${runId}-http-denied`);

    const allowed = await fetch(`${baseUrl}/users?page=1&limit=5`, {
      headers: { authorization: `Bearer ${session.accessToken}`, 'x-correlation-id': `${runId}-http-users` },
    });
    assert.equal(allowed.status, 200);
    assert.equal(Array.isArray((await allowed.json()).items), true);

    const operations = await fetch(`${baseUrl}/operations/overview`, {
      headers: { authorization: `Bearer ${session.accessToken}`, 'x-correlation-id': `${runId}-http-operations` },
    });
    assert.equal(operations.status, 200);
    const operationsBody = await operations.json();
    assert.equal(typeof operationsBody.errors, 'object');
    assert.deepEqual(Object.keys(operationsBody.health.dependencies).sort(), ['database', 'outbox']);
    assert.equal(typeof operationsBody.automation.deliveries, 'object');
    assert.equal(operationsBody.automation.manualReplayEnabled, false);
    assert.equal(typeof operationsBody.aiOperations.executions, 'object');
    assert.equal(operationsBody.aiOperations.autonomousSensitiveActions, false);
    assert.equal(operationsBody.financialAttention.latestReconciliation === null || typeof operationsBody.financialAttention.latestReconciliation.id === 'string', true);

    for (const path of ['/operations/errors', '/operations/incidents']) {
      const headers = { authorization: `Bearer ${session.accessToken}` };
      for (const [query, page, limit] of [
        ['', 1, 25],
        ['page=02&limit=2e1', 2, 20],
        ['limit%5B%5D=2', 1, 25],
      ]) {
        const response = await fetch(`${baseUrl}${path}?${query}`, { headers });
        assert.equal(response.status, 200, `${path}?${query}`);
        const body = await response.json();
        assert.ok(Array.isArray(body.items));
        assert.equal(body.pagination.page, page);
        assert.equal(body.pagination.limit, limit);
      }
      for (const query of ['limit=', 'limit=25&limit=25', 'limit=101', 'search=']) {
        const response = await fetch(`${baseUrl}${path}?${query}`, { headers });
        assert.equal(response.status, 400, `${path}?${query}`);
        assert.equal((await response.json()).code, 'VALIDATION_ERROR');
      }
    }

    const operationsHeaders = { authorization: `Bearer ${session.accessToken}` };
    const fixtureTime = new Date('2026-09-21T08:00:00.000Z');
    const group = await prisma.errorGroup.create({ data: {
      fingerprint: `fixture-${runId}`, environment: 'test', service: runId,
      normalizedMessage: 'Synthetic operations fixture', lastSeenAt: fixtureTime,
    } });
    errorGroupId = group.id;
    for (const errorGroupId of [group.id, null]) {
      const incident = await prisma.incident.create({ data: {
        title: 'Synthetic incident fixture', service: runId, detectedAt: fixtureTime, errorGroupId,
      } });
      incidentIds.push(incident.id);
    }
    const errorList = await fetch(`${baseUrl}/operations/errors?service=${encodeURIComponent(runId)}`, { headers: operationsHeaders });
    assert.equal(errorList.status, 200);
    const errors = await errorList.json();
    assert.deepEqual(errors.items.map(({ id, errorCode, lastSeenAt }) => ({ id, errorCode, lastSeenAt })), [
      { id: group.id, errorCode: null, lastSeenAt: fixtureTime.toISOString() },
    ]);

    const orderedIds = [...incidentIds].sort().reverse();
    for (const [index, id] of orderedIds.entries()) {
      const page = index + 1;
      const response = await fetch(`${baseUrl}/operations/incidents?service=${encodeURIComponent(runId)}&page=${page}&limit=1`, { headers: operationsHeaders });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.pagination, { page, limit: 1, totalItems: 2, totalPages: 2 });
      assert.equal(body.items.length, 1);
      assert.equal(body.items[0].id, id);
      assert.equal(body.items[0].detectedAt, fixtureTime.toISOString());
      assert.equal(body.items[0].resolvedAt, null);
      assert.deepEqual(body.items[0].errorGroup, id === incidentIds[0] ? {
        id: group.id, fingerprint: group.fingerprint, errorCode: null, occurrenceCount: group.occurrenceCount,
      } : null);
    }

    const deniedJobs = await fetch(`${baseUrl}/operations/jobs?page=1&limit=5`, {
      headers: { authorization: `Bearer ${session.accessToken}`, 'x-correlation-id': `${runId}-http-jobs-denied` },
    });
    assert.equal(deniedJobs.status, 403);
    assert.equal((await deniedJobs.json()).code, 'INSUFFICIENT_PERMISSION');

    const createdCaseResponse = await fetch(`${baseUrl}/operations/support/cases`, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json', 'x-correlation-id': `${runId}-support-create` },
      body: JSON.stringify({ subject: 'Integration support case', description: 'Validate the complete support lifecycle safely.', category: 'OTHER', priority: 'HIGH' }),
    });
    assert.equal(createdCaseResponse.status, 201);
    const createdCase = (await createdCaseResponse.json()).supportCase;
    supportCaseId = createdCase.id;
    assert.match(createdCase.caseKey, /^SUP-[A-F0-9]{8}$/);

    const supportList = await fetch(`${baseUrl}/operations/support/cases?search=${createdCase.caseKey}`, { headers: operationsHeaders });
    assert.equal(supportList.status, 200);
    const supportListBody = await supportList.json();
    assert.equal(supportListBody.items[0].id, supportCaseId);
    assert.equal(supportListBody.items[0].assignedTo, null);
    assert.equal(supportListBody.pagination.totalItems, 1);
    assert.equal(supportListBody.pagination.page, 1);
    assert.equal(supportListBody.pagination.limit, 25);

    const filteredSupportList = await fetch(
      `${baseUrl}/operations/support/cases?search=%20${createdCase.caseKey}%20&status=OPEN&priority=HIGH&page=01&limit=2e1`,
      { headers: operationsHeaders },
    );
    assert.equal(filteredSupportList.status, 200);
    const filteredSupportBody = await filteredSupportList.json();
    assert.deepEqual(filteredSupportBody.items.map(({ id }) => id), [supportCaseId]);
    assert.equal(filteredSupportBody.pagination.limit, 20);

    for (const query of ['search=', 'search=a&search=b', 'status=open', 'priority=high', 'assignedToId=invalid', 'page=1&page=2', 'limit=101']) {
      const invalidSupportList = await fetch(`${baseUrl}/operations/support/cases?${query}`, { headers: operationsHeaders });
      assert.equal(invalidSupportList.status, 400, query);
    }

    const supportDetail = await fetch(`${baseUrl}/operations/support/cases/${supportCaseId}`, { headers: operationsHeaders });
    assert.equal(supportDetail.status, 200);
    const detail = (await supportDetail.json()).supportCase;
    assert.equal(detail.createdBy.id, support.id);
    assert.equal(detail.events[0].toStatus, 'OPEN');
    assert.equal(detail.resolvedAt, null);
    assert.equal(Object.hasOwn(detail.events[0], 'metadata'), false);

    const supportOperators = await fetch(`${baseUrl}/operations/support/operators`, { headers: operationsHeaders });
    assert.equal(supportOperators.status, 200);
    assert.deepEqual((await supportOperators.json()).operators.find(({ id }) => id === support.id), {
      id: support.id, firstName: support.firstName, lastName: support.lastName,
    });

    const triaged = await fetch(`${baseUrl}/operations/support/cases/${supportCaseId}/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json', 'x-correlation-id': `${runId}-support-triage` },
      body: JSON.stringify({ status: 'TRIAGED', reason: 'Validated and accepted by integration support' }),
    });
    assert.equal(triaged.status, 200);
    const transition = await triaged.json();
    assert.equal(transition.supportCase.status, 'TRIAGED');
    assert.equal(transition.duplicate, false);
    const duplicateTransition = await fetch(`${baseUrl}/operations/support/cases/${supportCaseId}/status`, {
      method: 'PATCH',
      headers: { ...operationsHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'TRIAGED', reason: 'Repeated support transition for verification' }),
    });
    assert.equal(duplicateTransition.status, 200);
    assert.deepEqual(await duplicateTransition.json(), { supportCase: transition.supportCase, duplicate: true });
    assert.equal(await prisma.auditLog.count({
      where: { actorId: support.id, action: 'AUTHORIZATION_DENIED', resourceId: 'roles.read', outcome: 'DENIED' },
    }), 1);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: supportCaseId, action: { in: ['support.case_created', 'support.status_changed'] } } }), 2);
    assert.equal(await prisma.outboxEvent.count({
      where: { aggregateType: 'SupportCase', aggregateId: supportCaseId },
    }), 2);
    for (const duplicate of [false, true]) {
      const assignment = await fetch(`${baseUrl}/operations/support/cases/${supportCaseId}/assignment`, {
        method: 'PATCH',
        headers: { ...operationsHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ assignedToId: support.id, reason: 'Assign case to the synthetic test operator' }),
      });
      assert.equal(assignment.status, 200);
      assert.deepEqual(await assignment.json(), {
        supportCase: { id: supportCaseId, assignedToId: support.id, status: 'TRIAGED' }, duplicate,
      });
    }
    const addedComment = await fetch(`${baseUrl}/operations/support/cases/${supportCaseId}/comments`, {
      method: 'POST',
      headers: { ...operationsHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ body: ' Synthetic support comment ' }),
    });
    assert.equal(addedComment.status, 201);
    const { comment } = await addedComment.json();
    assert.equal(comment.caseId, supportCaseId);
    assert.equal(comment.authorId, support.id);
    assert.equal(comment.body, 'Synthetic support comment');
    assert.equal(new Date(comment.createdAt).toISOString(), comment.createdAt);
    assert.equal(await prisma.auditLog.count({
      where: { actorId: support.id, action: 'AUTHORIZATION_DENIED', resourceId: 'jobs.read', outcome: 'DENIED' },
    }), 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
