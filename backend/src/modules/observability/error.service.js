const { createHash, randomUUID } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const env = require('../../config/env');
const { redactText, safeRequestPath, sanitizeTelemetry } = require('./redaction');

const ERROR_WINDOW_MINUTES = env.observabilityErrorWindowMinutes;
const SERVICE_NAME = 'homeservices-core-api';
const ERROR_SEVERITIES = new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']);
const errorSeverity = (value) => ERROR_SEVERITIES.has(value) ? value : 'ERROR';
const boundedDimension = (value) => value == null ? undefined : redactText(value).slice(0, 100);

const normalizeMessage = (message = '') => redactText(message)
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
  .replace(/\b\d{3,}\b/g, ':number')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 2_000);

const fingerprintError = ({ service = SERVICE_NAME, module, operation, errorCode, message }) =>
  createHash('sha256')
    .update([service, module || '', operation || '', errorCode || '', normalizeMessage(message)].join('|'))
    .digest('hex');

const buildOccurrence = ({ error, req, fingerprint, message, errorGroupId }) => ({
  errorGroupId,
  fingerprint,
  severity: errorSeverity(error.severity),
  environment: env.environment,
  service: SERVICE_NAME,
  module: error.module,
  operation: error.operation,
  errorCode: error.code,
  message,
  stackTrace: env.isProduction ? undefined : redactText(error.stack),
  httpStatus: error.statusCode || error.status,
  endpoint: safeRequestPath(req?.originalUrl || req?.url),
  method: req?.method,
  userId: req?.user?.id,
  professionalId: req?.user?.professionalProfile?.id,
  bookingId: req?.params?.bookingId || (req?.baseUrl === '/api/bookings' ? req?.params?.id : undefined),
  requestId: req?.context?.requestId,
  correlationId: req?.context?.correlationId,
  traceId: req?.context?.traceId,
  appVersion: req?.get?.('x-app-version')?.slice(0, 64),
  metadata: sanitizeTelemetry(error.metadata),
});

const persistReport = async ({ database, error, req, fingerprint, message, now, windowCutoff }) => {
  const execute = async (tx) => {
    let group;
    if (typeof tx.$queryRaw === 'function') {
      [group] = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "ErrorGroup" (
          "id", "fingerprint", "severity", "environment", "service", "module", "operation",
          "errorCode", "normalizedMessage", "status", "firstSeenAt", "lastSeenAt",
          "occurrenceCount", "windowStartedAt", "windowOccurrenceCount"
        ) VALUES (
          ${randomUUID()}, ${fingerprint}, CAST(${errorSeverity(error.severity)} AS "ErrorSeverity"),
          ${env.environment}, ${SERVICE_NAME}, ${error.module ?? null}, ${error.operation ?? null}, ${error.code ?? null},
          ${message}, 'OPEN'::"ErrorStatus", ${now}, ${now}, 1, ${now}, 1
        )
        ON CONFLICT ("fingerprint") DO UPDATE SET
          "severity" = EXCLUDED."severity",
          "normalizedMessage" = EXCLUDED."normalizedMessage",
          "lastSeenAt" = EXCLUDED."lastSeenAt",
          "occurrenceCount" = "ErrorGroup"."occurrenceCount" + 1,
          "status" = CASE
            WHEN "ErrorGroup"."windowStartedAt" < ${windowCutoff} THEN 'OPEN'::"ErrorStatus"
            ELSE "ErrorGroup"."status"
          END,
          "windowStartedAt" = CASE
            WHEN "ErrorGroup"."windowStartedAt" < ${windowCutoff} THEN EXCLUDED."windowStartedAt"
            ELSE "ErrorGroup"."windowStartedAt"
          END,
          "windowOccurrenceCount" = CASE
            WHEN "ErrorGroup"."windowStartedAt" < ${windowCutoff} THEN 1
            ELSE "ErrorGroup"."windowOccurrenceCount" + 1
          END
        RETURNING *
      `);
    } else {
      const common = { lastSeenAt: now, severity: errorSeverity(error.severity), normalizedMessage: message };
      const current = await tx.errorGroup.updateMany({
        where: { fingerprint, windowStartedAt: { gte: windowCutoff } },
        data: { ...common, occurrenceCount: { increment: 1 }, windowOccurrenceCount: { increment: 1 } },
      });
      if (current.count === 0) {
        const reset = await tx.errorGroup.updateMany({
          where: { fingerprint, windowStartedAt: { lt: windowCutoff } },
          data: { ...common, status: 'OPEN', occurrenceCount: { increment: 1 }, windowStartedAt: now, windowOccurrenceCount: 1 },
        });
        if (reset.count === 0) {
          await tx.errorGroup.create({
            data: {
              fingerprint, severity: errorSeverity(error.severity), environment: env.environment,
              service: SERVICE_NAME, module: error.module, operation: error.operation,
              errorCode: error.code, normalizedMessage: message, firstSeenAt: now,
              lastSeenAt: now, windowStartedAt: now,
            },
          });
        }
      }
      group = await tx.errorGroup.findUnique({ where: { fingerprint } });
    }
    const event = await tx.errorEvent.create({
      data: buildOccurrence({ error, req, fingerprint, message, errorGroupId: group.id }),
    });
    return { event, group };
  };
  return typeof database.$transaction === 'function' ? database.$transaction(execute) : execute(database);
};

const reportError = async (error, req, client) => {
  const database = client || require('../../config/prisma');
  const message = normalizeMessage(error.message || 'Unknown error');
  const observedError = {
    ...error,
    message: error.message,
    stack: error.stack,
    severity: errorSeverity(error.severity),
    module: boundedDimension(error.module),
    operation: boundedDimension(error.operation),
    code: boundedDimension(error.code),
    metadata: error.metadata,
    status: error.status,
    statusCode: error.statusCode,
  };
  const fingerprint = fingerprintError({
    service: SERVICE_NAME,
    module: observedError.module,
    operation: observedError.operation,
    errorCode: observedError.code,
    message,
  });
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - ERROR_WINDOW_MINUTES * 60_000);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await persistReport({ database, error: observedError, req, fingerprint, message, now, windowCutoff });
    } catch (persistError) {
      if (persistError.code !== 'P2002' || attempt === 2) throw persistError;
    }
  }
  throw new Error('Error report persistence exhausted retries');
};

module.exports = {
  ERROR_WINDOW_MINUTES,
  ERROR_SEVERITIES,
  SERVICE_NAME,
  buildOccurrence,
  fingerprintError,
  normalizeMessage,
  reportError,
};
