const { claimOutboxBatch, markOutboxProcessed, rescheduleOutboxEvent } = require('./outbox.service');
const { runWithTelemetryMetadata } = require('../observability/context');
const { logger } = require('../observability/logger');

const processOutboxBatch = async ({ eventType, handler, batchSize = 50, maxAttempts = 8 }, client) => {
  if (!eventType || typeof handler !== 'function') throw new Error('eventType and handler are required');
  const database = client || require('../../config/prisma');
  const events = await claimOutboxBatch({ eventType, batchSize }, database);
  const summary = { claimed: events.length, processed: 0, rescheduled: 0, deadLettered: 0 };

  for (const event of events) {
    await runWithTelemetryMetadata(event.metadata || {}, `outbox ${event.eventType}`, async (requestContext) => {
      const eventLog = logger.child({
        eventId: event.id,
        eventType: event.eventType,
        correlationId: requestContext.correlationId,
        traceId: requestContext.traceId,
      });
      try {
        await handler(event, { requestContext, log: eventLog });
        const result = await markOutboxProcessed({ id: event.id, lockedAt: event.lockedAt }, database);
        if (result.count !== 1) throw Object.assign(new Error('Outbox lease lost'), { code: 'OUTBOX_LEASE_LOST' });
        summary.processed += 1;
        eventLog.info('Outbox event processed');
      } catch (error) {
        const exhausted = event.attempts >= maxAttempts;
        await rescheduleOutboxEvent({
          id: event.id,
          lockedAt: event.lockedAt,
          attempts: event.attempts,
          error,
          maxAttempts,
          retryable: error.retryable !== false,
        }, database);
        if (exhausted || error.retryable === false) summary.deadLettered += 1;
        else summary.rescheduled += 1;
        eventLog.error({ err: error, exhausted }, 'Outbox event processing failed');
      }
    });
  }
  return summary;
};

module.exports = { processOutboxBatch };
