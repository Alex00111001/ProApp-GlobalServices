const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { comparePassword } = require('../../utils/password');

const ACCESS_AUDIENCE = 'homeservices-admin';
const ACCESS_ISSUER = 'homeservices-core-api';

const httpError = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const opaqueToken = () => crypto.randomBytes(32).toString('base64url');
const digest = (value, pepper = env.adminSessionPepper) => crypto
  .createHmac('sha256', pepper)
  .update(String(value || ''))
  .digest('hex');

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const assignmentInclude = {
  role: {
    include: {
      permissions: { include: { permission: true } },
    },
  },
};

const loadAdminIdentity = async (userId, client = prisma) => {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: true,
      isActive: true,
      countryCode: true,
    },
  });
  if (!user || !user.isActive) throw httpError(401, 'ADMIN_SESSION_INVALID', 'Administrative session is invalid.');

  const assignments = await client.userRoleAssignment.findMany({
    where: { userId, status: 'ACTIVE' },
    include: assignmentInclude,
    orderBy: { grantedAt: 'asc' },
  });
  if (assignments.length === 0) throw httpError(403, 'ADMIN_ACCESS_DENIED', 'Administrative access is not assigned.');

  const roles = assignments.map(({ role }) => ({ id: role.id, key: role.key, name: role.name }));
  const permissions = [...new Set(assignments.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))].sort();
  return { user, roles, permissions };
};

const signAccessToken = ({ userId, sessionId }) => jwt.sign(
  { userId, sessionId, type: 'admin_access' },
  env.jwtSecret,
  {
    audience: ACCESS_AUDIENCE,
    issuer: ACCESS_ISSUER,
    expiresIn: `${env.adminAccessTokenMinutes}m`,
    jwtid: crypto.randomUUID(),
  }
);

const verifyAdminAccessToken = (token) => {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { audience: ACCESS_AUDIENCE, issuer: ACCESS_ISSUER });
    if (payload.type !== 'admin_access' || !payload.userId || !payload.sessionId) throw new Error('Invalid claims');
    return payload;
  } catch {
    throw httpError(401, 'ADMIN_SESSION_INVALID', 'Administrative session is invalid or expired.');
  }
};

const buildSessionResponse = (identity, session, accessToken, refreshToken, csrfToken) => ({
  accessToken,
  refreshToken,
  csrfToken,
  accessTokenExpiresInSeconds: env.adminAccessTokenMinutes * 60,
  session: {
    id: session.id,
    expiresAt: session.expiresAt,
  },
  ...identity,
});

const createAdminSession = async ({ email, password, userAgent, ipAddress }, client = prisma) => {
  const user = await client.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive || !await comparePassword(password, user.passwordHash)) {
    throw httpError(401, 'INVALID_ADMIN_CREDENTIALS', 'Invalid administrative credentials.');
  }

  const identity = await loadAdminIdentity(user.id, client);
  const refreshToken = opaqueToken();
  const csrfToken = opaqueToken();
  const expiresAt = new Date(Date.now() + env.adminSessionHours * 60 * 60 * 1000);
  const session = await client.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return tx.adminSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: digest(refreshToken),
        csrfTokenHash: digest(csrfToken),
        expiresAt,
        userAgentHash: userAgent ? digest(userAgent) : null,
        ipAddressHash: ipAddress ? digest(ipAddress) : null,
      },
    });
  });
  const accessToken = signAccessToken({ userId: user.id, sessionId: session.id });
  return buildSessionResponse(identity, session, accessToken, refreshToken, csrfToken);
};

const refreshAdminSession = async ({ refreshToken, csrfToken, userAgent, ipAddress }, client = prisma) => {
  if (!refreshToken || !csrfToken) throw httpError(401, 'ADMIN_REFRESH_REQUIRED', 'Administrative refresh credentials are required.');
  const session = await client.adminSession.findUnique({ where: { refreshTokenHash: digest(refreshToken) } });
  if (session?.status === 'ACTIVE' && session.expiresAt <= new Date()) {
    await client.adminSession.updateMany({
      where: { id: session.id, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
  }
  if (!session || session.status !== 'ACTIVE' || session.expiresAt <= new Date()) {
    throw httpError(401, 'ADMIN_SESSION_INVALID', 'Administrative session is invalid or expired.');
  }
  if (!safeEqual(session.csrfTokenHash, digest(csrfToken))) {
    throw httpError(403, 'ADMIN_CSRF_INVALID', 'Administrative session verification failed.');
  }
  if (session.userAgentHash && !safeEqual(session.userAgentHash, digest(userAgent))) {
    throw httpError(401, 'ADMIN_SESSION_CONTEXT_CHANGED', 'Administrative session context changed.');
  }

  const identity = await loadAdminIdentity(session.userId, client);
  const nextRefreshToken = opaqueToken();
  const nextCsrfToken = opaqueToken();
  const updated = await client.adminSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: digest(nextRefreshToken),
      csrfTokenHash: digest(nextCsrfToken),
      lastSeenAt: new Date(),
      ipAddressHash: ipAddress ? digest(ipAddress) : session.ipAddressHash,
    },
  });
  const accessToken = signAccessToken({ userId: session.userId, sessionId: session.id });
  return buildSessionResponse(identity, updated, accessToken, nextRefreshToken, nextCsrfToken);
};

const authenticateAdminToken = async (token, client = prisma) => {
  const payload = verifyAdminAccessToken(token);
  const session = await client.adminSession.findUnique({ where: { id: payload.sessionId } });
  if (session?.status === 'ACTIVE' && session.expiresAt <= new Date()) {
    await client.adminSession.updateMany({
      where: { id: session.id, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
  }
  if (!session || session.userId !== payload.userId || session.status !== 'ACTIVE' || session.expiresAt <= new Date()) {
    throw httpError(401, 'ADMIN_SESSION_INVALID', 'Administrative session is invalid or expired.');
  }
  const identity = await loadAdminIdentity(session.userId, client);
  return { ...identity, session };
};

const revokeAdminSession = async ({ sessionId, actorId, reason }, client = prisma) => {
  const session = await client.adminSession.findUnique({ where: { id: sessionId } });
  if (!session) throw httpError(404, 'ADMIN_SESSION_NOT_FOUND', 'Administrative session was not found.');
  if (session.status !== 'ACTIVE') return session;
  if (session.userId !== actorId && !reason) throw httpError(400, 'REVOCATION_REASON_REQUIRED', 'A revocation reason is required.');
  return client.adminSession.update({
    where: { id: session.id },
    data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: reason || 'USER_LOGOUT' },
  });
};

module.exports = {
  ACCESS_AUDIENCE,
  ACCESS_ISSUER,
  authenticateAdminToken,
  createAdminSession,
  digest,
  loadAdminIdentity,
  refreshAdminSession,
  revokeAdminSession,
  safeEqual,
  signAccessToken,
  verifyAdminAccessToken,
};
