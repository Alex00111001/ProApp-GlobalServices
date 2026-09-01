const { Prisma } = require('@prisma/client');

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 8;

const boundedInteger = (name, value, minimum, maximum) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
};

const retryDelayMs = (attempts) => Math.min(60 * 60_000, 1_000 * (2 ** Math.max(0, attempts - 1)));

const sanitizeOutboxError = (error) => String(error?.message || error || 'Unknown outbox error')
  .replace(/(?:bearer\s+)?[A-Za-z0-9_-]{24,}/gi, '[REDACTED]')
  .slice(0, 2_000);

const claimOutboxBatch = async ({ batchSize = 50, leaseMs = DEFAULT_LEASE_MS, aggregateId, eventType } = {}, client) => {
  boundedInteger('batchSize', batchSize, 1, 200);
  boundedInteger('leaseMs', leaseMs, 1_000, 15 * 60_000);
  if (aggregateId !== undefined && (typeof aggregateId !== 'string' || aggregateId.length > 200)) {
    throw new Error('aggregateId must be a string of at most 200 characters');
  }
  if (eventType !== undefined && (typeof eventType !== 'string' || eventType.length > 200)) {
    throw new Error('eventType must be a string of at most 200 characters');
  }
  const database = client || require('../../config/prisma');
  const aggregateFilter = aggregateId === undefined
    ? Prisma.sql``
    : Prisma.sql`AND "aggregateId" = ${aggregateId}`;
  const eventTypeFilter = eventType === undefined
    ? Prisma.sql``
    : Prisma.sql`AND "eventType" = ${eventType}`;

  return database.$transaction((tx) => tx.$queryRaw(Prisma.sql`
    WITH candidates AS (
      SELECT "id"
      FROM "OutboxEvent"
      WHERE (
        ("status" = 'PENDING'::"OutboxStatus" AND "availableAt" <= CURRENT_TIMESTAMP)
        OR
        ("status" = 'PROCESSING'::"OutboxStatus"
          AND "lockedAt" <= CURRENT_TIMESTAMP - (${leaseMs} * INTERVAL '1 millisecond'))
      )
      ${aggregateFilter}
      ${eventTypeFilter}
      ORDER BY "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE "OutboxEvent" AS event
    SET "status" = 'PROCESSING'::"OutboxStatus",
        "lockedAt" = CURRENT_TIMESTAMP,
        "attempts" = event."attempts" + 1,
        "lastError" = NULL
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event.*
  `));
};

const markOutboxProcessed = async ({ id, lockedAt }, client) => {
  if (!id || !(lockedAt instanceof Date)) throw new Error('A claimed outbox id and lockedAt are required');
  const database = client || require('../../config/prisma');
  return database.outboxEvent.updateMany({
    where: { id, status: 'PROCESSING', lockedAt },
    data: { status: 'PROCESSED', processedAt: new Date(), lockedAt: null, lastError: null },
  });
};

const rescheduleOutboxEvent = async (
  { id, lockedAt, attempts, error, maxAttempts = DEFAULT_MAX_ATTEMPTS, retryable = true },
  client
) => {
  if (!id || !(lockedAt instanceof Date)) throw new Error('A claimed outbox id and lockedAt are required');
  boundedInteger('attempts', attempts, 1, Number.MAX_SAFE_INTEGER);
  boundedInteger('maxAttempts', maxAttempts, 1, 100);
  const database = client || require('../../config/prisma');
  const exhausted = retryable === false || attempts >= maxAttempts;
  return database.outboxEvent.updateMany({
    where: { id, status: 'PROCESSING', lockedAt },
    data: {
      status: exhausted ? 'DEAD_LETTER' : 'PENDING',
      availableAt: exhausted ? new Date() : new Date(Date.now() + retryDelayMs(attempts)),
      lockedAt: null,
      lastError: sanitizeOutboxError(error),
    },
  });
};

module.exports = {
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  claimOutboxBatch,
  markOutboxProcessed,
  rescheduleOutboxEvent,
  retryDelayMs,
  sanitizeOutboxError,
};
