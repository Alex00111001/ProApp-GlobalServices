const { createHash } = require('node:crypto');
const env = require('../../config/env');

const normalizeMessage = (message = '') => String(message)
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
  .replace(/\b\d{3,}\b/g, ':number')
  .slice(0, 2_000);

const fingerprintError = ({ service = 'homeservices-core-api', module, operation, errorCode, message }) =>
  createHash('sha256')
    .update([service, module, operation, errorCode, normalizeMessage(message)].join('|'))
    .digest('hex');

const reportError = async (error, req, client) => {
  const database = client || require('../../config/prisma');
  const message = normalizeMessage(error.message || 'Unknown error');
  const fingerprint = fingerprintError({
    service: 'homeservices-core-api',
    module: error.module,
    operation: error.operation,
    errorCode: error.code,
    message,
  });
  return database.errorEvent.upsert({
    where: { fingerprint },
    create: {
      fingerprint,
      severity: error.severity || 'ERROR',
      environment: env.environment,
      service: 'homeservices-core-api',
      module: error.module,
      operation: error.operation,
      errorCode: error.code,
      message,
      stackTrace: env.isProduction ? undefined : error.stack,
      httpStatus: error.statusCode,
      endpoint: req?.originalUrl,
      method: req?.method,
      userId: req?.user?.id,
      professionalId: req?.user?.professionalProfile?.id,
      bookingId: req?.params?.bookingId || (req?.baseUrl === '/api/bookings' ? req?.params?.id : undefined),
      requestId: req?.context?.requestId,
      correlationId: req?.context?.correlationId,
      traceId: req?.context?.traceId,
    },
    update: {
      lastSeenAt: new Date(),
      occurrenceCount: { increment: 1 },
      requestId: req?.context?.requestId,
      correlationId: req?.context?.correlationId,
      traceId: req?.context?.traceId,
    },
  });
};

module.exports = { fingerprintError, normalizeMessage, reportError };
