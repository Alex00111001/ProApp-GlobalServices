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
let changeId;
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
  if (changeId) await prisma.adminRoleChangeRequest.deleteMany({ where: { id: changeId } });
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
    assert.equal(await prisma.auditLog.count({
      where: { actorId: support.id, action: 'AUTHORIZATION_DENIED', resourceId: 'roles.read', outcome: 'DENIED' },
    }), 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
