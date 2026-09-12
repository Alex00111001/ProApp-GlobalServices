const { createHash } = require('node:crypto');
const { Prisma } = require('@prisma/client');

const ACTIVE_SLOT_STATUSES = Object.freeze(['PENDING', 'CONFIRMED', 'IN_PROGRESS']);
const IDEMPOTENCY_SCOPE = 'booking:create';

const bookingError = (message, code, statusCode = 409) => Object.assign(new Error(message), {
  code,
  statusCode,
});

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};

const requestDigest = (value) => createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

const parseIdempotencyKey = (value) => {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
    throw bookingError(
      'A valid Idempotency-Key header is required for booking creation.',
      'BOOKING_IDEMPOTENCY_KEY_REQUIRED',
      400,
    );
  }
  return key;
};

const schedulingWindow = ({ scheduledDate, bookingServices, servicesById, now = new Date() }) => {
  const start = new Date(scheduledDate);
  if (Number.isNaN(start.getTime())) {
    throw bookingError('Booking start time is invalid.', 'BOOKING_START_INVALID', 400);
  }
  if (start.getTime() <= now.getTime()) {
    throw bookingError('Booking start time must be in the future.', 'BOOKING_START_NOT_FUTURE', 422);
  }

  let durationMinutes = 0;
  for (const item of bookingServices) {
    const service = servicesById.get(item.serviceId);
    const duration = Number(service?.duration);
    if (!Number.isSafeInteger(duration) || duration <= 0) {
      throw bookingError('A selected service has no valid scheduling duration.', 'SERVICE_DURATION_INVALID', 422);
    }
    durationMinutes += duration * item.quantity;
  }
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
    throw bookingError('Booking duration is invalid.', 'BOOKING_DURATION_INVALID', 422);
  }

  return {
    start,
    end: new Date(start.getTime() + durationMinutes * 60_000),
    durationMinutes,
  };
};

const acquireTransactionLock = (tx, lockKey) => tx.$queryRaw(Prisma.sql`
  SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS "locked"
`);

const claimBookingCreation = async ({
  tx,
  actorUserId,
  professionalId,
  idempotencyKey,
  requestHash,
  start,
  end,
  ttlHours,
  now = new Date(),
}) => {
  const scope = `${IDEMPOTENCY_SCOPE}:${actorUserId}`;
  await acquireTransactionLock(tx, `${scope}:${idempotencyKey}`);

  const existing = await tx.idempotencyRecord.findUnique({
    where: { scope_key: { scope, key: idempotencyKey } },
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw bookingError(
        'Idempotency key was already used for a different request.',
        'IDEMPOTENCY_PAYLOAD_CONFLICT',
      );
    }
    const bookingId = existing.responseBody?.bookingId;
    if (existing.status === 'COMPLETED' && typeof bookingId === 'string') {
      return { replayBookingId: bookingId };
    }
    throw bookingError(
      'A booking request with this idempotency key is already being processed.',
      'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    );
  }

  await tx.idempotencyRecord.create({
    data: {
      scope,
      key: idempotencyKey,
      requestHash,
      expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1_000),
    },
  });

  await acquireTransactionLock(tx, `booking:schedule:${professionalId}`);
  const conflict = await tx.booking.findFirst({
    where: {
      professionalId,
      status: { in: ACTIVE_SLOT_STATUSES },
      scheduledDate: { lt: end },
      OR: [
        { endDate: { gt: start } },
        { endDate: null, scheduledDate: { gte: start } },
      ],
    },
    select: { id: true },
  });
  if (conflict) {
    throw bookingError(
      'The professional is no longer available for the selected interval.',
      'BOOKING_SLOT_CONFLICT',
    );
  }

  return { replayBookingId: null };
};

const completeBookingCreation = ({ tx, actorUserId, idempotencyKey, bookingId, responseStatus = 201 }) => {
  const scope = `${IDEMPOTENCY_SCOPE}:${actorUserId}`;
  return tx.idempotencyRecord.update({
    where: { scope_key: { scope, key: idempotencyKey } },
    data: {
      status: 'COMPLETED',
      responseStatus,
      responseBody: { bookingId },
      completedAt: new Date(),
    },
  });
};

const findCompletedBookingCreation = async ({ client, actorUserId, idempotencyKey, requestHash }) => {
  const scope = `${IDEMPOTENCY_SCOPE}:${actorUserId}`;
  const existing = await client.idempotencyRecord.findUnique({
    where: { scope_key: { scope, key: idempotencyKey } },
  });
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw bookingError('Idempotency key was already used for a different request.', 'IDEMPOTENCY_PAYLOAD_CONFLICT');
  }
  const bookingId = existing.responseBody?.bookingId;
  return existing.status === 'COMPLETED' && typeof bookingId === 'string' ? bookingId : null;
};

module.exports = {
  ACTIVE_SLOT_STATUSES,
  claimBookingCreation,
  completeBookingCreation,
  findCompletedBookingCreation,
  parseIdempotencyKey,
  requestDigest,
  schedulingWindow,
};
