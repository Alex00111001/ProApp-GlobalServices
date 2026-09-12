const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/prisma');
const env = require('../../config/env');

const CUSTOMER_ACCESS_AUDIENCE = 'homeservices-customer-api';
const CUSTOMER_ACCESS_ISSUER = 'homeservices-identity';

const httpError = (statusCode, code, message) => Object.assign(new Error(message), {
  statusCode,
  code,
});

const digest = (value, pepper = env.customerSessionPepper) => crypto
  .createHmac('sha256', pepper)
  .update(String(value || ''))
  .digest('hex');

const opaqueToken = () => crypto.randomBytes(48).toString('base64url');
const contextHash = (value) => value ? digest(String(value).trim().slice(0, 1000)) : null;

const publicSession = (session, current = false) => ({
  id: session.id,
  status: session.status,
  expiresAt: session.expiresAt,
  lastSeenAt: session.lastSeenAt,
  createdAt: session.createdAt,
  current,
});

const signAccessToken = ({ userId, role, sessionId }) => jwt.sign(
  { role, sessionId, kind: 'customer' },
  env.jwtSecret,
  {
    algorithm: 'HS256',
    audience: CUSTOMER_ACCESS_AUDIENCE,
    issuer: CUSTOMER_ACCESS_ISSUER,
    subject: userId,
    expiresIn: `${env.customerAccessTokenMinutes}m`,
  }
);

const createCustomerSessionInTransaction = async ({ userId, role, userAgent, ipAddress }, tx) => {
  const refreshToken = opaqueToken();
  const expiresAt = new Date(Date.now() + env.customerSessionHours * 60 * 60 * 1000);
  const session = await tx.customerSession.create({
    data: {
      userId,
      expiresAt,
      userAgentHash: contextHash(userAgent),
      ipAddressHash: contextHash(ipAddress),
    },
  });
  await tx.customerRefreshToken.create({
    data: {
      sessionId: session.id,
      tokenHash: digest(refreshToken),
      expiresAt,
    },
  });
  return {
    accessToken: signAccessToken({ userId, role, sessionId: session.id }),
    refreshToken,
    session: publicSession(session, true),
  };
};

const createCustomerSession = (input, client = prisma) => client.$transaction(
  (tx) => createCustomerSessionInTransaction(input, tx)
);

const revokeCustomerSession = async ({ sessionId, userId, reason = 'USER_REQUEST' }, client = prisma) => client.$transaction(async (tx) => {
  const now = new Date();
  const updated = await tx.customerSession.updateMany({
    where: { id: sessionId, userId, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now, revocationReason: reason },
  });
  if (updated.count) {
    await tx.customerRefreshToken.updateMany({
      where: { sessionId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: now },
    });
  }
  return updated.count === 1;
});

const revokeAllCustomerSessionsInTransaction = async ({ userId, reason }, tx) => {
  const now = new Date();
  const sessions = await tx.customerSession.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!sessions.length) return 0;
  const ids = sessions.map((session) => session.id);
  await tx.customerRefreshToken.updateMany({
    where: { sessionId: { in: ids }, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now },
  });
  const result = await tx.customerSession.updateMany({
    where: { id: { in: ids }, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now, revocationReason: reason },
  });
  return result.count;
};

const revokeAllCustomerSessions = (input, client = prisma) => client.$transaction(
  (tx) => revokeAllCustomerSessionsInTransaction(input, tx)
);

const invalidRefresh = () => httpError(401, 'CUSTOMER_REFRESH_INVALID', 'Session refresh credentials are invalid or expired.');

const refreshCustomerSession = async ({ refreshToken, userAgent, ipAddress }, client = prisma) => {
  if (!refreshToken || refreshToken.length < 32 || refreshToken.length > 256) throw invalidRefresh();
  const tokenHash = digest(refreshToken);
  const record = await client.customerRefreshToken.findUnique({
    where: { tokenHash },
    include: {
      session: {
        include: { user: { select: { id: true, role: true, isActive: true } } },
      },
    },
  });
  if (!record) throw invalidRefresh();

  const now = new Date();
  const session = record.session;
  if (record.status !== 'ACTIVE') {
    if (record.status === 'ROTATED' && session.status === 'ACTIVE') {
      await revokeCustomerSession({
        sessionId: session.id,
        userId: session.userId,
        reason: 'REFRESH_TOKEN_REPLAY',
      }, client);
    }
    throw invalidRefresh();
  }
  if (
    record.expiresAt <= now ||
    session.expiresAt <= now ||
    session.status !== 'ACTIVE' ||
    !session.user.isActive
  ) {
    await revokeCustomerSession({ sessionId: session.id, userId: session.userId, reason: 'SESSION_EXPIRED' }, client);
    throw invalidRefresh();
  }
  if (session.userAgentHash && session.userAgentHash !== contextHash(userAgent)) {
    await revokeCustomerSession({ sessionId: session.id, userId: session.userId, reason: 'CLIENT_BINDING_MISMATCH' }, client);
    throw invalidRefresh();
  }

  const nextRefreshToken = opaqueToken();
  const rotated = await client.$transaction(async (tx) => {
    const claimed = await tx.customerRefreshToken.updateMany({
      where: { id: record.id, status: 'ACTIVE', expiresAt: { gt: now } },
      data: { status: 'ROTATED', usedAt: now },
    });
    if (claimed.count !== 1) return null;
    await tx.customerRefreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: digest(nextRefreshToken),
        expiresAt: session.expiresAt,
      },
    });
    const updatedSession = await tx.customerSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now, ipAddressHash: contextHash(ipAddress) },
    });
    return updatedSession;
  });

  if (!rotated) {
    await revokeCustomerSession({
      sessionId: session.id,
      userId: session.userId,
      reason: 'CONCURRENT_REFRESH_REPLAY',
    }, client);
    throw invalidRefresh();
  }

  return {
    accessToken: signAccessToken({ userId: session.user.id, role: session.user.role, sessionId: session.id }),
    refreshToken: nextRefreshToken,
    session: publicSession(rotated, true),
  };
};

const authenticateCustomerAccessToken = async (accessToken, client = prisma) => {
  let payload;
  try {
    payload = jwt.verify(accessToken, env.jwtSecret, {
      algorithms: ['HS256'],
      audience: CUSTOMER_ACCESS_AUDIENCE,
      issuer: CUSTOMER_ACCESS_ISSUER,
    });
  } catch {
    throw httpError(401, 'CUSTOMER_ACCESS_INVALID', 'Invalid or expired token.');
  }
  if (payload.kind !== 'customer' || !payload.sub || !payload.sessionId) {
    throw httpError(401, 'CUSTOMER_ACCESS_INVALID', 'Invalid or expired token.');
  }
  const session = await client.customerSession.findFirst({
    where: {
      id: payload.sessionId,
      userId: payload.sub,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
      user: { isActive: true },
    },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          role: true,
          isActive: true,
          marketId: true,
          countryCode: true,
          registrationLocale: true,
          clientProfile: { select: { id: true, userId: true } },
          professionalProfile: { select: { id: true, userId: true, status: true } },
        },
      },
    },
  });
  if (!session) throw httpError(401, 'CUSTOMER_SESSION_INVALID', 'Invalid or expired token.');
  return { user: session.user, session };
};

const listCustomerSessions = async ({ userId, currentSessionId }, client = prisma) => {
  await client.customerSession.updateMany({
    where: { userId, status: 'ACTIVE', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
  const sessions = await client.customerSession.findMany({
    where: { userId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      lastSeenAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return sessions.map((session) => publicSession(session, session.id === currentSessionId));
};

module.exports = {
  CUSTOMER_ACCESS_AUDIENCE,
  CUSTOMER_ACCESS_ISSUER,
  authenticateCustomerAccessToken,
  contextHash,
  createCustomerSession,
  createCustomerSessionInTransaction,
  digest,
  listCustomerSessions,
  refreshCustomerSession,
  revokeAllCustomerSessions,
  revokeAllCustomerSessionsInTransaction,
  revokeCustomerSession,
  signAccessToken,
};
