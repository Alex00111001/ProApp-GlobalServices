const errorWithStatus = (message, status) => Object.assign(new Error(message), { status });
const { telemetryMetadata } = require('../../observability/context');

const approvePayoutInTx = async ({ tx, payoutId, approverId, requestContext = {} }) => {
  const payout = await tx.payout.findUnique({
    where: { id: payoutId },
    include: { booking: true, payment: true, earning: true, professional: true },
  });
  if (!payout) throw errorWithStatus('Payout not found', 404);
  if (payout.status === 'APPROVED' || payout.status === 'PROCESSING' || payout.status === 'COMPLETED') {
    return { payout, duplicate: true };
  }
  if (payout.status !== 'REQUESTED' && payout.status !== 'FAILED') {
    throw errorWithStatus(`Payout cannot be approved from ${payout.status}`, 409);
  }
  if (payout.requestedBy && payout.requestedBy === approverId) {
    throw errorWithStatus('Payout requester cannot approve the same payout', 409);
  }
  if (payout.booking.status !== 'COMPLETED' || payout.payment.status !== 'COMPLETED') {
    throw errorWithStatus('Payout requires a completed booking and captured payment', 409);
  }
  if (!payout.professional.stripeAccountId) {
    throw errorWithStatus('Professional does not have a connected Stripe account', 409);
  }
  const approvedAt = new Date();
  const claimed = await tx.payout.updateMany({
    where: { id: payout.id, status: { in: ['REQUESTED', 'FAILED'] } },
    data: {
      status: 'APPROVED',
      approvedBy: approverId,
      approvedAt,
      connectedAccountId: payout.professional.stripeAccountId,
      failureReason: null,
    },
  });
  if (claimed.count === 0) throw errorWithStatus('Payout state changed before approval', 409);
  const updated = await tx.payout.findUnique({
    where: { id: payout.id },
    include: { booking: true, payment: true, earning: true, professional: true },
  });
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Payout',
      aggregateId: payout.id,
      eventType: 'payout.approved',
      payload: { payoutId: payout.id, bookingId: payout.bookingId, professionalId: payout.professionalId },
      metadata: telemetryMetadata(requestContext, { connectedAccountId: payout.professional.stripeAccountId }),
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: approverId,
      action: 'payout.approved',
      resourceType: 'Payout',
      resourceId: payout.id,
      outcome: 'SUCCESS',
      before: { status: payout.status },
      after: { status: 'APPROVED', approvedAt: approvedAt.toISOString(), connectedAccountId: payout.professional.stripeAccountId },
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      traceId: requestContext.traceId,
    },
  });
  return { payout: updated, duplicate: false };
};

module.exports = { approvePayoutInTx };
