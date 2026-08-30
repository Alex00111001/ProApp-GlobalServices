const { hasPermission } = require('../modules/identity/authorization.service');
const { writeAuditLog } = require('../modules/audit/audit.service');

const requirePermission = (permission) => async (req, res, next) => {
  try {
    if (await hasPermission(req.user, permission)) return next();
    await writeAuditLog({
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

module.exports = { requirePermission };
