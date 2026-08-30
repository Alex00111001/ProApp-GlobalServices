const { normalizeCaptureAmounts } = require('../ledger/payment-capture-journal');
const { decimalToMinor } = require('../pricing/pricing.service');
const { evaluateRefund } = require('./refund-policy.service');

const minorToDecimal = (amountMinor) => (amountMinor / 100).toFixed(2);

const resolveRefundPolicy = async ({ tx, bookingId, country, now }) => {
  const acceptance = await tx.bookingPolicyAcceptance.findFirst({
    where: { bookingId },
    include: { refundPolicy: true },
    orderBy: { acceptedAt: 'desc' },
  });
  if (acceptance) return { policy: acceptance.refundPolicy, acceptance };

  const policies = await tx.refundPolicy.findMany({
    where: {
      status: 'ACTIVE',
      AND: [
        { OR: [{ country }, { country: null }] },
        { OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] },
        { OR: [{ retiredAt: null }, { retiredAt: { gt: now } }] },
      ],
    },
    orderBy: { version: 'desc' },
  });
  const policy = policies.sort((left, right) => {
    const countryPriority = Number(right.country === country) - Number(left.country === country);
    return countryPriority || right.version - left.version;
  })[0];
  return { policy: policy || null, acceptance: null };
};

const createCancellationRefundRequestInTx = async ({
  tx,
  booking,
  requestedBy,
  whoCancelled,
  reason,
  cancelledAt,
}) => {
  if (!booking.payment || booking.payment.status !== 'COMPLETED') {
    return { outcome: 'NOT_CAPTURED', refund: null, duplicate: false };
  }

  const idempotencyKey = `booking:${booking.id}:cancellation-refund`;
  const existing = await tx.refund.findUnique({ where: { idempotencyKey } });
  if (existing) return { outcome: 'EXISTING', refund: existing, duplicate: true };

  const country = String(booking.client?.country || 'ES').toUpperCase();
  const { policy, acceptance } = await resolveRefundPolicy({
    tx,
    bookingId: booking.id,
    country,
    now: cancelledAt,
  });
  if (!policy) {
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Booking',
        aggregateId: booking.id,
        eventType: 'refund.policy_missing',
        payload: { bookingId: booking.id, paymentId: booking.payment.id, country },
      },
    });
    return { outcome: 'NO_POLICY', refund: null, duplicate: false };
  }

  const capture = normalizeCaptureAmounts({ booking, payment: booking.payment });
  const hoursBeforeScheduled = Math.floor((booking.scheduledDate.getTime() - cancelledAt.getTime()) / 3_600_000);
  const context = {
    whoCancelled,
    reason: reason || null,
    bookingStatus: booking.status,
    hoursBeforeScheduled,
  };
  const decision = evaluateRefund({
    rules: policy.rules,
    context,
    serviceAmountMinor: capture.serviceAmountMinor,
    platformFeeMinor: capture.platformFeeMinor,
  });
  if (decision.totalRefundMinor > capture.customerTotalMinor) {
    throw new Error('Refund policy decision exceeds the captured payment');
  }

  const reserved = await tx.refund.aggregate({
    where: {
      paymentId: booking.payment.id,
      status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'] },
    },
    _sum: { totalAmount: true },
  });
  const reservedMinor = reserved._sum.totalAmount ? decimalToMinor(reserved._sum.totalAmount) : 0;
  if (reservedMinor + decision.totalRefundMinor > capture.customerTotalMinor) {
    throw new Error('Refund requests cannot exceed the captured payment');
  }

  const status = decision.outcome === 'REJECTED' ? 'REJECTED' : 'REQUESTED';
  const refund = await tx.refund.create({
    data: {
      bookingId: booking.id,
      paymentId: booking.payment.id,
      refundPolicyId: policy.id,
      idempotencyKey,
      status,
      serviceAmount: minorToDecimal(decision.serviceRefundMinor),
      platformFeeAmount: minorToDecimal(decision.platformFeeRefundMinor),
      totalAmount: minorToDecimal(decision.totalRefundMinor),
      currency: capture.currency,
      decision: {
        ...decision,
        context,
        policyVersion: policy.version,
        acceptedPolicy: Boolean(acceptance),
      },
      requestedBy,
      decisionRecord: {
        create: {
          refundPolicyId: policy.id,
          policyVersion: policy.version,
          country,
          context,
          outcome: decision.outcome,
          matchedRule: decision.matchedRule,
          serviceRefundAmount: minorToDecimal(decision.serviceRefundMinor),
          platformFeeRefundAmount: minorToDecimal(decision.platformFeeRefundMinor),
          totalRefundAmount: minorToDecimal(decision.totalRefundMinor),
          currency: capture.currency,
          decidedAt: cancelledAt,
        },
      },
    },
  });
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Refund',
      aggregateId: refund.id,
      eventType: status === 'REJECTED' ? 'refund.rejected' : 'refund.requested',
      payload: { bookingId: booking.id, paymentId: booking.payment.id, refundId: refund.id },
      metadata: { policyId: policy.id, policyVersion: policy.version, matchedRule: decision.matchedRule },
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: requestedBy,
      action: 'refund.decision_recorded',
      resourceType: 'Refund',
      resourceId: refund.id,
      outcome: 'SUCCESS',
      after: { status, totalAmount: minorToDecimal(decision.totalRefundMinor), currency: capture.currency },
      metadata: { policyId: policy.id, policyVersion: policy.version, decisionOutcome: decision.outcome },
    },
  });
  return { outcome: decision.outcome, refund, duplicate: false };
};

module.exports = { resolveRefundPolicy, createCancellationRefundRequestInTx };
