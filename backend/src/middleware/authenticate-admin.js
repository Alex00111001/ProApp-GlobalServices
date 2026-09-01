const { authenticateAdminToken } = require('../modules/identity/admin-session.service');
const { logError } = require('../modules/observability/safe-log');

const bearerToken = (header) => {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const createAuthenticateAdmin = (authenticate = authenticateAdminToken) => async (req, res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({
      error: 'Administrative authentication required.',
      code: 'ADMIN_AUTHENTICATION_REQUIRED',
      correlationId: req.context?.correlationId,
    });
  }
  try {
    const identity = await authenticate(token);
    req.user = identity.user;
    req.adminSession = identity.session;
    req.adminRoles = identity.roles;
    req.permissions = new Set(identity.permissions);
    return next();
  } catch (error) {
    logError(req, error, 'Administrative authentication failed');
    return res.status(error.statusCode || 401).json({
      error: error.statusCode === 403 ? error.message : 'Administrative session is invalid or expired.',
      code: error.code || 'ADMIN_SESSION_INVALID',
      correlationId: req.context?.correlationId,
    });
  }
};

module.exports = { authenticateAdmin: createAuthenticateAdmin(), bearerToken, createAuthenticateAdmin };
