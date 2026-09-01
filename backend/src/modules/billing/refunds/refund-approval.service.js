const { decimalToMinor } = require('../pricing/pricing.service');
const { telemetryMetadata } = require('../../observability/context');

const errorWithStatus = (message, status) => Object.assign(new Error(message), { status });

const approveRefundInTx = async ({ tx, refundId, approverId, requestContext = {} }) => {
  const refund = await tx.refund.findUnique({
    where: { id: refundId },
    include: { decisionRecord: true },
  });
  if (!refund) throw errorWithStatus('Refund not found', 404);
  if (refund.status === 'APPROVED' && refund.approvedBy) {
    return { refund, duplicate: true };
  }
  if (refund.status !== 'REQUESTED') throw errorWithStatus('Only requested refunds can be approved', 409);
  if (refund.requestedBy && refund.requestedBy === approverId) {
    throw errorWithStatus('Refund requester cannot approve the same refund', 409);
  }
  if (decimalToMinor(refund.totalAmount) === 0) {
    throw errorWithStatus('Refund amount requires manual resolution before approval', 409);
  }

  const approvedAt = new Date();
  const claimed = await tx.refund.updateMany({
    where: { id: refundId, status: 'REQUESTED' },
    data: { status: 'APPROVED', approvedBy: approverId, approvedAt, failureReason: null },
  });
  if (claimed.count === 0) throw errorWithStatus('Refund state changed before approval', 409);

  const approved = await tx.refund.findUnique({
    where: { id: refundId },
    include: { decisionRecord: true, booking: true, payment: true },
  });
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Refund',
      aggregateId: refundId,
      eventType: 'refund.approved',
      payload: { refundId, bookingId: approved.bookingId, paymentId: approved.paymentId },
      metadata: telemetryMetadata(requestContext, { approvedBy: approverId }),
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: approverId,
      action: 'refund.approved',
      resourceType: 'Refund',
      resourceId: refundId,
      outcome: 'SUCCESS',
      before: { status: refund.status },
      after: { status: 'APPROVED', approvedAt: approvedAt.toISOString() },
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      traceId: requestContext.traceId,
    },
  });
  return { refund: approved, duplicate: false };
};

const rejectRefundInTx = async ({ tx, refundId, reviewerId, reason, requestContext = {} }) => {
  const refund = await tx.refund.findUnique({ where: { id: refundId } });
  if (!refund) throw errorWithStatus('Refund not found', 404);
  if (refund.status === 'REJECTED') return { refund, duplicate: true };
  if (!['REQUESTED', 'APPROVED'].includes(refund.status)) {
    throw errorWithStatus('Refund can no longer be rejected', 409);
  }

  const claimed = await tx.refund.updateMany({
    where: { id: refundId, status: { in: ['REQUESTED', 'APPROVED'] } },
    data: { status: 'REJECTED', failureReason: reason },
  });
  if (claimed.count === 0) throw errorWithStatus('Refund state changed before rejection', 409);

  const rejected = await tx.refund.findUnique({ where: { id: refundId }, include: { decisionRecord: true } });
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Refund',
      aggregateId: refundId,
      eventType: 'refund.rejected',
      payload: { refundId, bookingId: refund.bookingId, paymentId: refund.paymentId },
      metadata: telemetryMetadata(requestContext, { reviewedBy: reviewerId, reason }),
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: reviewerId,
      action: 'refund.rejected',
      resourceType: 'Refund',
      resourceId: refundId,
      outcome: 'SUCCESS',
      before: { status: refund.status },
      after: { status: 'REJECTED', reason },
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      traceId: requestContext.traceId,
    },
  });
  return { refund: rejected, duplicate: false };
};

module.exports = { approveRefundInTx, rejectRefundInTx };
