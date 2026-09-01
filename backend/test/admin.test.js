process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword } = require('../src/utils/password');
const { createAuthenticateAdmin } = require('../src/middleware/authenticate-admin');
const { createRequirePermission } = require('../src/middleware/require-permission');
const {
  createAdminSession,
  digest,
  loadAdminIdentity,
  refreshAdminSession,
  signAccessToken,
  verifyAdminAccessToken,
} = require('../src/modules/identity/admin-session.service');
const { decideRoleChange, ensureEnabled, listRoleChangeRequests } = require('../src/modules/identity/admin-role-change.service');
const { dashboardDefinitions, listAuditLogs, maskEmail, maskPhone, PROFESSIONAL_TRANSITIONS } = require('../src/modules/admin/admin-read.service');
const { adminLoginSchema, dashboardQuerySchema, userListQuerySchema } = require('../src/validators/admin.validators');
const { refreshCookie } = require('../src/controllers/admin-auth.controller');

test('admin access tokens are short-lived audience-bound credentials', () => {
  const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' });
  const payload = verifyAdminAccessToken(token);
  assert.equal(payload.userId, 'user-1');
  assert.equal(payload.sessionId, 'session-1');
  assert.equal(payload.aud, 'homeservices-admin');
  assert.ok(payload.exp - payload.iat <= 15 * 60);
  assert.throws(() => verifyAdminAccessToken(`${token}corrupted`), /invalid or expired/i);
});

test('session material is hashed and refresh cookies are HttpOnly and strict', () => {
  assert.equal(digest('same-token'), digest('same-token'));
  assert.notEqual(digest('same-token'), 'same-token');
  const cookie = refreshCookie('opaque-token', new Date(Date.now() + 60_000));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/v1\/admin\/auth/);
  assert.doesNotMatch(cookie, /Domain=/);
});

test('refresh rejects missing browser binding and persists automatic expiry', async () => {
  const active = {
    id: 'session-active', userId: 'user-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000),
    csrfTokenHash: digest('csrf'), userAgentHash: digest('expected-browser'),
  };
  await assert.rejects(() => refreshAdminSession({ refreshToken: 'refresh', csrfToken: 'csrf' }, {
    adminSession: { findUnique: async () => active },
  }), (error) => error.code === 'ADMIN_SESSION_CONTEXT_CHANGED');

  let expired;
  await assert.rejects(() => refreshAdminSession({ refreshToken: 'refresh', csrfToken: 'csrf', userAgent: 'expected-browser' }, {
    adminSession: {
      findUnique: async () => ({ ...active, id: 'session-expired', expiresAt: new Date(Date.now() - 1) }),
      updateMany: async (input) => { expired = input; return { count: 1 }; },
    },
  }), (error) => error.code === 'ADMIN_SESSION_INVALID');
  assert.equal(expired.data.status, 'EXPIRED');
});

test('admin login requires an explicit active RBAC assignment', async () => {
  const passwordHash = await hashPassword('correct-password');
  const client = {
    user: {
      findUnique: async () => ({ id: 'user-1', email: 'admin@example.com', firstName: 'Ada', lastName: 'Admin', role: 'ADMIN', isActive: true, countryCode: 'ES', passwordHash }),
    },
    userRoleAssignment: { findMany: async () => [] },
  };
  await assert.rejects(() => createAdminSession({ email: 'admin@example.com', password: 'correct-password' }, client), (error) => error.code === 'ADMIN_ACCESS_DENIED');
});

test('admin login persists only hashed refresh context and returns effective permissions', async () => {
  const passwordHash = await hashPassword('correct-password');
  let created;
  const safeUser = { id: 'user-1', email: 'admin@example.com', firstName: 'Ada', lastName: 'Admin', avatarUrl: null, role: 'ADMIN', isActive: true, countryCode: 'ES' };
  const assignment = { role: { id: 'role-1', key: 'OPERATIONS_ADMIN', name: 'Operations', permissions: [{ permission: { key: 'dashboard.read' } }] } };
  const client = {
    user: { findUnique: async (input) => input.select ? safeUser : { ...safeUser, passwordHash } },
    userRoleAssignment: { findMany: async () => [assignment] },
    $transaction: async (work) => work({
      user: { update: async () => ({}) },
      adminSession: { create: async ({ data }) => { created = data; return { id: 'session-1', ...data }; } },
    }),
  };
  const result = await createAdminSession({ email: 'admin@example.com', password: 'correct-password', userAgent: 'browser', ipAddress: '127.0.0.1' }, client);
  assert.deepEqual(result.permissions, ['dashboard.read']);
  assert.equal(result.roles[0].key, 'OPERATIONS_ADMIN');
  assert.notEqual(created.refreshTokenHash, result.refreshToken);
  assert.notEqual(created.csrfTokenHash, result.csrfToken);
  assert.ok(result.accessToken);
});

test('admin middleware returns 401 without bearer token and preloads RBAC on success', async () => {
  const responses = [];
  const middleware = createAuthenticateAdmin(async () => ({
    user: { id: 'user-1' }, session: { id: 'session-1' }, roles: [{ key: 'ANALYST' }], permissions: ['dashboard.read'],
  }));
  await middleware({ headers: {}, context: { correlationId: 'corr-1' } }, { status(code) { responses.push(code); return this; }, json(body) { responses.push(body); } }, () => assert.fail('must not continue'));
  assert.equal(responses[0], 401);
  const req = { headers: { authorization: 'Bearer token' } };
  let continued = false;
  await middleware(req, {}, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.permissions.has('dashboard.read'), true);
});

test('permission middleware produces deterministic 403 and audits the denial', async () => {
  let audit;
  const middleware = createRequirePermission('users.manage', { writeAuditLog: async (entry) => { audit = entry; } });
  const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await middleware({ user: { id: 'admin-1' }, permissions: new Set(['users.read']), context: { correlationId: 'corr-403' } }, response, () => assert.fail('must not continue'));
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'INSUFFICIENT_PERMISSION');
  assert.equal(response.body.correlationId, 'corr-403');
  assert.equal(audit.outcome, 'DENIED');
});

test('four-eyes role review rejects the original requester before any assignment write', async () => {
  const tx = { adminRoleChangeRequest: { findUnique: async () => ({ id: 'change-1', status: 'REQUESTED', requestedById: 'admin-1', targetUserId: 'user-2', roleId: 'role-1', action: 'GRANT', role: {}, targetUser: {} }) } };
  const client = { $transaction: async (work) => work(tx) };
  await assert.rejects(() => decideRoleChange({ id: 'change-1', decision: 'APPROVE', reason: 'Independent review', req: { user: { id: 'admin-1' } } }, client, { enabled: true }), (error) => error.code === 'ROLE_CHANGE_FOUR_EYES_REQUIRED');
  assert.throws(() => ensureEnabled(false), (error) => error.code === 'ADMIN_ROLE_CHANGES_DISABLED');
});

test('admin query contracts are bounded and dashboard definitions are operationally explicit', () => {
  assert.equal(userListQuerySchema.parse({ page: '2', limit: '25', search: 'Ada' }).page, 2);
  assert.throws(() => userListQuerySchema.parse({ limit: '1000' }));
  assert.equal(dashboardQuerySchema.parse({ currency: 'EUR', timezone: 'Europe/Madrid' }).timezone, 'Europe/Madrid');
  assert.throws(() => dashboardQuerySchema.parse({ currency: 'eur', timezone: 'invalid/timezone' }));
  assert.equal(dashboardDefinitions.gmv.source, 'Payment COMPLETED');
  assert.match(dashboardDefinitions.takeRate.description, /GMV/);
  assert.equal(maskEmail('person@example.com'), 'pe***@example.com');
  assert.equal(maskPhone('+34123456789'), '+34***89');
  assert.equal(PROFESSIONAL_TRANSITIONS.PENDING_REVIEW.has('APPROVED'), true);
  assert.equal(PROFESSIONAL_TRANSITIONS.PENDING_REVIEW.has('SUSPENDED'), false);
  assert.throws(() => adminLoginSchema.parse({ email: 'not-an-email', password: 'password' }));
});

test('protected admin collections never return raw actor or target emails', async () => {
  const audit = await listAuditLogs({ page: 1, limit: 25 }, {
    auditLog: {
      findMany: async () => [{ id: 'audit-1', actor: { id: 'actor-1', firstName: 'Ada', lastName: 'Admin', email: 'ada@example.com' } }],
      count: async () => 1,
    },
  });
  assert.equal(audit.items[0].actor.email, undefined);
  assert.equal(audit.items[0].actor.emailMasked, 'ad***@example.com');

  const requests = await listRoleChangeRequests({}, {
    adminRoleChangeRequest: {
      findMany: async () => [{ id: 'change-1', targetUser: { id: 'target-1', firstName: 'Target', lastName: 'User', email: 'target@example.com' } }],
    },
  });
  assert.equal(requests[0].targetUser.email, undefined);
  assert.equal(requests[0].targetUser.emailMasked, 'ta***@example.com');
});

test('admin identity lookup never uses the legacy ADMIN wildcard', async () => {
  const client = {
    user: { findUnique: async () => ({ id: 'legacy', email: 'legacy@example.com', firstName: 'Legacy', lastName: 'Admin', role: 'ADMIN', isActive: true, countryCode: 'ES' }) },
    userRoleAssignment: { findMany: async () => [] },
  };
  await assert.rejects(() => loadAdminIdentity('legacy', client), (error) => error.code === 'ADMIN_ACCESS_DENIED');
});
