process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-customer-jwt-secret-at-least-32-characters';
process.env.CUSTOMER_SESSION_PEPPER ||= 'test-customer-pepper-at-least-32-characters';

const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const {
  authenticateCustomerAccessToken,
  createCustomerSession,
  digest,
  refreshCustomerSession,
  revokeAllCustomerSessionsInTransaction,
} = require('../src/modules/identity/customer-session.service');
const { PostgresRateLimitStore } = require('../src/middleware/postgres-rate-limit-store');

const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';

test('customer login persists only a refresh digest and emits short-lived audience-bound access', async () => {
  let persistedRefresh;
  const session = {
    id: sessionId,
    userId,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3_600_000),
    lastSeenAt: new Date(),
    createdAt: new Date(),
  };
  const tx = {
    customerSession: { create: async () => session },
    customerRefreshToken: { create: async ({ data }) => { persistedRefresh = data; } },
  };
  const result = await createCustomerSession({
    userId,
    role: 'CLIENT',
    userAgent: 'native-client',
    ipAddress: '127.0.0.1',
  }, { $transaction: (work) => work(tx) });

  assert.notEqual(result.refreshToken, persistedRefresh.tokenHash);
  assert.equal(persistedRefresh.tokenHash, digest(result.refreshToken));
  const decoded = jwt.decode(result.accessToken);
  assert.equal(decoded.sub, userId);
  assert.equal(decoded.sessionId, sessionId);
  assert.equal(decoded.aud, 'homeservices-customer-api');
  assert.equal(decoded.iss, 'homeservices-identity');
  assert.ok(decoded.exp - decoded.iat <= 30 * 60);
});

test('customer access requires an active persisted session and returns a minimal identity', async () => {
  const created = await createCustomerSession({ userId, role: 'PROFESSIONAL' }, {
    $transaction: (work) => work({
      customerSession: { create: async () => ({ id: sessionId, userId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 3_600_000), lastSeenAt: new Date(), createdAt: new Date() }) },
      customerRefreshToken: { create: async () => undefined },
    }),
  });
  const identity = await authenticateCustomerAccessToken(created.accessToken, {
    customerSession: {
      findFirst: async () => ({
        id: sessionId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3_600_000),
        user: { id: userId, role: 'PROFESSIONAL', isActive: true, professionalProfile: { id: 'profile-1', status: 'APPROVED' } },
      }),
    },
  });
  assert.equal(identity.user.id, userId);
  assert.equal(Object.hasOwn(identity.user, 'passwordHash'), false);
});

test('refresh rotation conditionally consumes one token and never returns the previous token', async () => {
  const current = 'a'.repeat(64);
  const expiresAt = new Date(Date.now() + 3_600_000);
  const record = {
    id: 'token-1',
    status: 'ACTIVE',
    expiresAt,
    session: {
      id: sessionId,
      userId,
      status: 'ACTIVE',
      expiresAt,
      userAgentHash: null,
      user: { id: userId, role: 'CLIENT', isActive: true },
    },
  };
  let createdHash;
  const client = {
    customerRefreshToken: { findUnique: async () => record },
    $transaction: async (work) => work({
      customerRefreshToken: {
        updateMany: async () => ({ count: 1 }),
        create: async ({ data }) => { createdHash = data.tokenHash; },
      },
      customerSession: {
        update: async () => ({ ...record.session, lastSeenAt: new Date(), createdAt: new Date() }),
      },
    }),
  };
  const refreshed = await refreshCustomerSession({ refreshToken: current }, client);
  assert.notEqual(refreshed.refreshToken, current);
  assert.equal(createdHash, digest(refreshed.refreshToken));
});

test('password changes revoke sessions and active refresh tokens in one transaction', async () => {
  const operations = [];
  const count = await revokeAllCustomerSessionsInTransaction({ userId, reason: 'PASSWORD_CHANGED' }, {
    customerSession: {
      findMany: async () => [{ id: sessionId }],
      updateMany: async ({ data }) => { operations.push(data); return { count: 1 }; },
    },
    customerRefreshToken: {
      updateMany: async ({ data }) => { operations.push(data); return { count: 1 }; },
    },
  });
  assert.equal(count, 1);
  assert.equal(operations[0].status, 'REVOKED');
  assert.equal(operations[1].revocationReason, 'PASSWORD_CHANGED');
});

test('auth rate limit store uses one shared PostgreSQL bucket contract', async () => {
  let query;
  const resetAt = new Date(Date.now() + 60_000);
  const store = new PostgresRateLimitStore({
    prefix: 'auth-login',
    client: { $queryRaw: async (sql) => { query = sql; return [{ count: 3, resetAt }]; } },
  });
  store.init({ windowMs: 60_000 });
  const result = await store.increment('opaque-key');
  assert.deepEqual(result, { totalHits: 3, resetTime: resetAt });
  assert.ok(query.values.includes('auth-login:opaque-key'));
});
