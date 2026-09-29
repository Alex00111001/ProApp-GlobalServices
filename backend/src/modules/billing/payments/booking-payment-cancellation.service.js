const env = require('../../../config/env');
const { createCancellationRefundRequestInTx } = require('../refunds/refund-request.service');
const { telemetryMetadata } = require('../../observability/context');
const { buildAlertRequest } = require('../../observability/alerting.service');

// Called inside the transition transaction after Payment -> Booking locks.
// Capture and cancellation/rejection share this authority whichever wins first.
// It records a policy decision and operational reconciliation; provider refund
// execution remains owned by the existing approved refund workflow.
const reconcileCancelledBookingPaymentInTx = async ({
  tx, booking, requestedBy = null, requestContext = {},
  refundRequestsEnabled = env.financialRefundRequestsEnabled,
}) => {
  if (booking.status !== 'CANCELLED' || booking.payment?.status !== 'COMPLETED') return null;
  const deduplicationKey = `payment:cancelled-booking:${booking.payment.id}`;
  const existing = await tx.incident.findUnique({ where: { deduplicationKey } });
  if (existing) {
    const refund = await tx.refund.findUnique({
      where: { idempotencyKey: `booking:${booking.id}:cancellation-refund` },
    });
    return refund ? { outcome: 'EXISTING', refund, duplicate: true } : null;
  }
  const refundRequest = refundRequestsEnabled
    ? await createCancellationRefundRequestInTx({
      tx, booking, requestedBy,
      whoCancelled: booking.cancelledBy || 'SYSTEM',
      reason: booking.cancellationReason,
      cancelledAt: booking.cancelledAt || new Date(),
      requestContext,
    }) : null;
  const created = await tx.incident.createMany({
    data: {
      deduplicationKey,
      title: 'Captured payment on cancelled booking',
      description: `Review payment ${booking.payment.id} and booking ${booking.id} for refund or reconciliation.`,
      service: 'billing', severity: 'HIGH',
    },
    skipDuplicates: true,
  });
  if (created.count === 1) {
    const incident = await tx.incident.findUnique({ where: { deduplicationKey } });
    const metadata = {
      bookingId: booking.id, paymentId: booking.payment.id,
      refundOutcome: refundRequest?.outcome || 'MANUAL_REVIEW',
    };
    await tx.incidentEvent.create({
      data: { incidentId: incident.id, eventType: 'CANCELLED_BOOKING_PAYMENT_RECONCILIATION', metadata },
    });
    const alert = buildAlertRequest(incident, requestContext);
    if (alert) await tx.outboxEvent.create({
      data: {
        aggregateType: 'Incident', aggregateId: incident.id, eventType: 'incident.alert_requested',
        payload: alert.payload, metadata: telemetryMetadata(requestContext, alert.metadata),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: requestedBy, action: 'payment.cancelled_booking_reconciliation',
        resourceType: 'Payment', resourceId: booking.payment.id, outcome: 'SUCCESS', metadata,
        requestId: requestContext.requestId, correlationId: requestContext.correlationId, traceId: requestContext.traceId,
      },
    });
  }
  return refundRequest;
};

module.exports = { reconcileCancelledBookingPaymentInTx };
