const prisma = require('../../config/prisma');
const { redactText, sanitizeTelemetry } = require('../observability/redaction');

const writeAuditLog = ({ req, action, resourceType, resourceId, outcome = 'SUCCESS', ...data }, client = prisma) =>
  client.auditLog.create({
    data: {
      actorId: req?.user?.id,
      action,
      resourceType,
      resourceId,
      outcome,
      reason: data.reason ? redactText(data.reason) : undefined,
      before: sanitizeTelemetry(data.before),
      after: sanitizeTelemetry(data.after),
      metadata: sanitizeTelemetry(data.metadata),
      requestId: req?.context?.requestId,
      correlationId: req?.context?.correlationId,
      traceId: req?.context?.traceId,
      ipAddress: req?.ip,
      userAgent: redactText(req?.get?.('user-agent')).slice(0, 500) || undefined,
    },
  });

module.exports = { writeAuditLog };
