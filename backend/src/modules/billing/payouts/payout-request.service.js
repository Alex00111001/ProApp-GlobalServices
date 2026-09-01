const { decimalToMinor } = require('../pricing/pricing.service');
const { telemetryMetadata } = require('../../observability/context');

const createPayoutRequestForCompletedBookingInTx = async ({
  tx,
  booking,
  payment,
  earning,
  requestedBy,
  enabled,
  requestContext = {},
}) => {
  if (!enabled || !payment || payment.status !== 'COMPLETED' || payment.method !== 'STRIPE') {
    return { payout: null, duplicate: false, skipped: true };
  }
  if (!booking.professionalId || !earning) throw new Error('Completed booking requires professional earnings');
  const amountMinor = decimalToMinor(earning.netAmount);
  if (amountMinor <= 0) throw new Error('Professional payout amount must be positive');
  const idempotencyKey = `booking:${booking.id}:professional-payout`;
  const existing = await tx.payout.findUnique({ where: { bookingId: booking.id } });
  if (existing) return { payout: existing, duplicate: true, skipped: false };

  const payout = await tx.payout.create({
    data: {
      bookingId: booking.id,
      paymentId: payment.id,
      earningId: earning.id,
      professionalId: booking.professionalId,
      idempotencyKey,
      amount: (amountMinor / 100).toFixed(2),
      currency: String(payment.currency || booking.currency).toUpperCase(),
      requestedBy,
    },
  });
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Payout',
      aggregateId: payout.id,
      eventType: 'payout.requested',
      payload: { payoutId: payout.id, bookingId: booking.id, professionalId: booking.professionalId },
      metadata: telemetryMetadata(requestContext, { amountMinor, currency: payout.currency, source: 'BOOKING_COMPLETION' }),
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: requestedBy,
      action: 'payout.requested',
      resourceType: 'Payout',
      resourceId: payout.id,
      outcome: 'SUCCESS',
      after: { status: payout.status, bookingId: booking.id, amountMinor, currency: payout.currency },
      metadata: { source: 'BOOKING_COMPLETION' },
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      traceId: requestContext.traceId,
    },
  });
  return { payout, duplicate: false, skipped: false };
};

module.exports = { createPayoutRequestForCompletedBookingInTx };
