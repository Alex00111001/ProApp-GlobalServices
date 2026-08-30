const prisma = require('../../config/prisma');

const writeAuditLog = ({ req, action, resourceType, resourceId, outcome = 'SUCCESS', ...data }, client = prisma) =>
  client.auditLog.create({
    data: {
      actorId: req?.user?.id,
      action,
      resourceType,
      resourceId,
      outcome,
      reason: data.reason,
      before: data.before,
      after: data.after,
      metadata: data.metadata,
      requestId: req?.context?.requestId,
      correlationId: req?.context?.correlationId,
      traceId: req?.context?.traceId,
      ipAddress: req?.ip,
      userAgent: req?.get?.('user-agent'),
    },
  });

module.exports = { writeAuditLog };
