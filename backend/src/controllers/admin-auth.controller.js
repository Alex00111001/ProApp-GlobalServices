const prisma = require('../config/prisma');
const env = require('../config/env');
const { adminLoginSchema, revokeSessionSchema } = require('../validators/admin.validators');
const {
  createAdminSession,
  loadAdminIdentity,
  refreshAdminSession,
  revokeAdminSession,
} = require('../modules/identity/admin-session.service');
const { writeAuditLog } = require('../modules/audit/audit.service');

const REFRESH_COOKIE = 'hs_admin_refresh';

const parseCookies = (header = '') => Object.fromEntries(String(header).split(';').map((part) => {
  const separator = part.indexOf('=');
  if (separator < 1) return null;
  return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
}).filter(Boolean));

const refreshCookie = (token, expiresAt) => [
  `${REFRESH_COOKIE}=${encodeURIComponent(token)}`,
  'Path=/api/v1/admin/auth',
  'HttpOnly',
  'SameSite=Strict',
  env.isProduction ? 'Secure' : null,
  expiresAt ? `Max-Age=${Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))}` : 'Max-Age=0',
].filter(Boolean).join('; ');

const publicSession = ({ refreshToken, ...payload }) => payload;
const noStore = (res) => res.set('Cache-Control', 'no-store');

exports.login = async (req, res, next) => {
  try {
    const credentials = adminLoginSchema.parse(req.body);
    const result = await createAdminSession({
      ...credentials,
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });
    res.set('Set-Cookie', refreshCookie(result.refreshToken, result.session.expiresAt));
    noStore(res);
    req.user = result.user;
    await writeAuditLog({
      req,
      action: 'ADMIN_SESSION_CREATED',
      resourceType: 'ADMIN_SESSION',
      resourceId: result.session.id,
      metadata: { roleKeys: result.roles.map((role) => role.key) },
    });
    return res.status(201).json(publicSession(result));
  } catch (error) {
    return next(error);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const result = await refreshAdminSession({
      refreshToken: parseCookies(req.headers.cookie)[REFRESH_COOKIE],
      csrfToken: req.get('x-admin-csrf-token'),
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });
    res.set('Set-Cookie', refreshCookie(result.refreshToken, result.session.expiresAt));
    noStore(res);
    return res.json(publicSession(result));
  } catch (error) {
    res.set('Set-Cookie', refreshCookie('', null));
    return next(error);
  }
};

exports.me = async (req, res, next) => {
  try {
    const identity = await loadAdminIdentity(req.user.id);
    noStore(res);
    return res.json({ ...identity, session: { id: req.adminSession.id, expiresAt: req.adminSession.expiresAt } });
  } catch (error) {
    return next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    await revokeAdminSession({ sessionId: req.adminSession.id, actorId: req.user.id });
    await writeAuditLog({
      req,
      action: 'ADMIN_SESSION_REVOKED',
      resourceType: 'ADMIN_SESSION',
      resourceId: req.adminSession.id,
      reason: 'USER_LOGOUT',
    });
    res.set('Set-Cookie', refreshCookie('', null));
    noStore(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};

exports.listSessions = async (req, res, next) => {
  try {
    await prisma.adminSession.updateMany({
      where: { userId: req.user.id, status: 'ACTIVE', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
    const sessions = await prisma.adminSession.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
        revocationReason: true,
        createdAt: true,
      },
    });
    noStore(res);
    return res.json({ sessions: sessions.map((session) => ({ ...session, current: session.id === req.adminSession.id })) });
  } catch (error) {
    return next(error);
  }
};

exports.revokeSession = async (req, res, next) => {
  try {
    const { reason } = revokeSessionSchema.parse(req.body);
    const session = await revokeAdminSession({ sessionId: req.params.id, actorId: req.user.id, reason });
    await writeAuditLog({
      req,
      action: 'ADMIN_SESSION_REVOKED',
      resourceType: 'ADMIN_SESSION',
      resourceId: session.id,
      reason,
      before: { status: 'ACTIVE' },
      after: { status: session.status },
    });
    if (session.id === req.adminSession.id) res.set('Set-Cookie', refreshCookie('', null));
    return res.json({ session: { id: session.id, status: session.status, revokedAt: session.revokedAt } });
  } catch (error) {
    return next(error);
  }
};

module.exports = { ...exports, REFRESH_COOKIE, parseCookies, refreshCookie };
