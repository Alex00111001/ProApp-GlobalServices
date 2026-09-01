const { hasPermission } = require('../modules/identity/authorization.service');
const { writeAuditLog } = require('../modules/audit/audit.service');

const createRequirePermission = (permission, dependencies = {}) => async (req, res, next) => {
  const permissionCheck = dependencies.hasPermission || hasPermission;
  const audit = dependencies.writeAuditLog || writeAuditLog;
  try {
    const preloaded = req.permissions instanceof Set
      ? req.permissions.has('*') || req.permissions.has(permission)
      : null;
    if (preloaded === true || (preloaded === null && await permissionCheck(req.user, permission))) return next();
    await audit({
      req,
      action: 'AUTHORIZATION_DENIED',
      resourceType: 'PERMISSION',
      resourceId: permission,
      outcome: 'DENIED',
    }).catch(() => {});
    return res.status(403).json({
      error: 'Forbidden. Insufficient permissions.',
      code: 'INSUFFICIENT_PERMISSION',
      correlationId: req.context?.correlationId,
    });
  } catch (error) {
    return next(error);
  }
};

const requirePermission = (permission) => createRequirePermission(permission);

module.exports = { createRequirePermission, requirePermission };
