const prisma = require('../../../config/prisma');
const { decimalToMinor } = require('../pricing/pricing.service');
const { normalizeCaptureAmounts } = require('../ledger/payment-capture-journal');
const { buildRefundEntries } = require('./refund-journal');
const { ensureAccounts } = require('../payments/payment-capture.service');
const { postTransactionInTx } = require('../ledger/ledger.service');

const REFUND_PROCESSING_LEASE_MS = 5 * 60 * 1000;
const errorWithStatus = (message, status) => Object.assign(new Error(message), { status });

const assertProviderRefundMatches = ({ providerRefund, refund, refundMinor }) => {
  if (!providerRefund?.id || providerRefund.amount !== refundMinor) {
    throw errorWithStatus('Stripe refund amount does not match the approved refund', 409);
  }
  if (!providerRefund.currency || providerRefund.currency.toUpperCase() !== refund.currency.toUpperCase()) {
    throw errorWithStatus('Stripe refund currency does not match the approved refund', 409);
  }
  const paymentIntentId = typeof providerRefund.payment_intent === 'string'
    ? providerRefund.payment_intent
    : providerRefund.payment_intent?.id;
  if (!paymentIntentId || !refund.payment?.transactionId || paymentIntentId !== refund.payment.transactionId) {
    throw errorWithStatus('Stripe refund belongs to a different payment intent', 409);
  }
  if (providerRefund.metadata?.refundId !== refund.id) {
    throw errorWithStatus('Stripe refund metadata does not match the approved refund', 409);
  }
};

const assertRefundExecutable = ({
  refund,
  previouslyRefundedMinor,
  previousServiceRefundMinor = 0,
  previousPlatformFeeRefundMinor = 0,
  now = new Date(),
}) => {
  if (!refund) throw errorWithStatus('Refund not found', 404);
  if (refund.status === 'COMPLETED') return { duplicate: true };
  if (!refund.approvedBy || !refund.approvedAt) throw errorWithStatus('Refund requires prior approval', 409);
  if (!refund.decisionRecord) throw errorWithStatus('Refund requires immutable decision evidence', 409);
  if (refund.requestedBy && refund.requestedBy === refund.approvedBy) {
    throw errorWithStatus('Refund violates requester/approver separation', 409);
  }
  if (!['APPROVED', 'FAILED', 'PROCESSING'].includes(refund.status)) {
    throw errorWithStatus('Refund is not executable in its current state', 409);
  }
  if (
    refund.status === 'PROCESSING' &&
    refund.processingStartedAt &&
    now.getTime() - refund.processingStartedAt.getTime() < REFUND_PROCESSING_LEASE_MS
  ) {
    throw errorWithStatus('Refund execution is already in progress', 409);
  }
  if (!refund.payment || refund.payment.method !== 'STRIPE' || !refund.payment.transactionId) {
    throw errorWithStatus('Refund requires a captured Stripe payment', 409);
  }
  if (!['COMPLETED', 'REFUNDED'].includes(refund.payment.status)) {
    throw errorWithStatus('Refund requires a completed payment', 409);
  }
  const refundMinor = decimalToMinor(refund.totalAmount);
  const capturedMinor = decimalToMinor(refund.payment.amount);
  const capture = normalizeCaptureAmounts({ booking: refund.booking, payment: refund.payment });
  const refundAmounts = {
    serviceRefundMinor: decimalToMinor(refund.serviceAmount),
    platformFeeRefundMinor: decimalToMinor(refund.platformFeeAmount),
  };
  if (refundMinor <= 0) throw errorWithStatus('Refund amount must be positive', 409);
  if (refundMinor !== refundAmounts.serviceRefundMinor + refundAmounts.platformFeeRefundMinor) {
    throw errorWithStatus('Refund total must equal service and platform fee components', 409);
  }
  if (String(refund.currency).toUpperCase() !== capture.currency) {
    throw errorWithStatus('Refund currency does not match the captured payment', 409);
  }
  if (previouslyRefundedMinor + refundMinor > capturedMinor) {
    throw errorWithStatus('Refund total exceeds the captured payment', 409);
  }
  if (previousServiceRefundMinor + refundAmounts.serviceRefundMinor > capture.serviceAmountMinor) {
    throw errorWithStatus('Refund service amount exceeds captured service economics', 409);
  }
  if (previousPlatformFeeRefundMinor + refundAmounts.platformFeeRefundMinor > capture.platformFeeMinor) {
    throw errorWithStatus('Refund platform fee exceeds the captured customer fee', 409);
  }
  buildRefundEntries({
    refund: refundAmounts,
    capture,
    accountIds: {
      paymentClearing: 'payment-clearing',
      professionalPayable: 'professional-payable',
      platformFeeRevenue: 'platform-fee-revenue',
      commissionRevenue: 'commission-revenue',
    },
  });
  return { duplicate: false, refundMinor, capturedMinor, capture, refundAmounts };
};

const finalizeRefundInTx = async ({
  tx,
  refundId,
  providerRefundId,
  executorId,
  ledgerEnabled,
  processedAt = new Date(),
  requestContext = {},
  source = 'ADMIN_REFUND_EXECUTION',
}) => {
  const refund = await tx.refund.findUnique({
    where: { id: refundId },
    include: {
      decisionRecord: true,
      payment: true,
      booking: { include: { client: { select: { userId: true } } } },
    },
  });
  if (!refund) throw errorWithStatus('Refund not found', 404);
  if (refund.status === 'COMPLETED') return { refund, duplicate: true, ledgerTransaction: null };
  if (refund.status !== 'PROCESSING') throw errorWithStatus('Refund was not claimed for execution', 409);

  const previous = await tx.refund.aggregate({
    where: { paymentId: refund.paymentId, status: 'COMPLETED', id: { not: refund.id } },
    _sum: { totalAmount: true, serviceAmount: true, platformFeeAmount: true },
  });
  const previouslyRefundedMinor = previous._sum.totalAmount ? decimalToMinor(previous._sum.totalAmount) : 0;
  const previousPlatformFeeMinor = previous._sum.platformFeeAmount ? decimalToMinor(previous._sum.platformFeeAmount) : 0;
  const previousServiceRefundMinor = previous._sum.serviceAmount ? decimalToMinor(previous._sum.serviceAmount) : 0;
  const refundMinor = decimalToMinor(refund.totalAmount);
  const capturedMinor = decimalToMinor(refund.payment.amount);
  const cumulativeRefundMinor = previouslyRefundedMinor + refundMinor;
  if (cumulativeRefundMinor > capturedMinor) throw errorWithStatus('Refund total exceeds the captured payment', 409);

  const capture = normalizeCaptureAmounts({ booking: refund.booking, payment: refund.payment });
  const refundAmounts = {
    serviceRefundMinor: decimalToMinor(refund.serviceAmount),
    platformFeeRefundMinor: decimalToMinor(refund.platformFeeAmount),
  };
  if (refundMinor !== refundAmounts.serviceRefundMinor + refundAmounts.platformFeeRefundMinor) {
    throw errorWithStatus('Refund total must equal service and platform fee components', 409);
  }
  if (String(refund.currency).toUpperCase() !== capture.currency) {
    throw errorWithStatus('Refund currency does not match the captured payment', 409);
  }
  if (previousServiceRefundMinor + refundAmounts.serviceRefundMinor > capture.serviceAmountMinor) {
    throw errorWithStatus('Refund service amount exceeds captured service economics', 409);
  }
  if (previousPlatformFeeMinor + refundAmounts.platformFeeRefundMinor > capture.platformFeeMinor) {
    throw errorWithStatus('Refund platform fee exceeds the captured customer fee', 409);
  }
  const placeholderAccountIds = {
    paymentClearing: 'payment-clearing',
    professionalPayable: 'professional-payable',
    platformFeeRevenue: 'platform-fee-revenue',
    commissionRevenue: 'commission-revenue',
  };
  buildRefundEntries({ refund: refundAmounts, capture, accountIds: placeholderAccountIds });

  let ledgerTransaction = null;
  if (ledgerEnabled) {
    const captureTransaction = await tx.ledgerTransaction.findUnique({
      where: { idempotencyKey: `payment:${refund.payment.id}:capture` },
    });
    if (!captureTransaction) throw errorWithStatus('Capture ledger transaction is required before refund reversal', 409);
    const accountIds = await ensureAccounts(tx, capture.currency);
    ledgerTransaction = await postTransactionInTx({
      idempotencyKey: `refund:${refund.id}:completed`,
      bookingId: refund.bookingId,
      paymentId: refund.paymentId,
      refundId: refund.id,
      description: 'Stripe refund completed',
      metadata: { providerRefundId, executorId },
      entries: buildRefundEntries({ refund: refundAmounts, capture, accountIds }),
    }, tx);
  }

  await tx.payment.update({
    where: { id: refund.payment.id },
    data: {
      status: cumulativeRefundMinor === capturedMinor ? 'REFUNDED' : 'COMPLETED',
      refundAmount: (cumulativeRefundMinor / 100).toFixed(2),
      refundedAt: processedAt,
    },
  });
  const completed = await tx.refund.update({
    where: { id: refund.id },
    data: {
      status: 'COMPLETED',
      providerRefundId,
      processedAt,
      failureReason: null,
    },
    include: { decisionRecord: true },
  });

  const cumulativePlatformFeeMinor = previousPlatformFeeMinor + refundAmounts.platformFeeRefundMinor;
  if (capture.platformFeeMinor > 0 && cumulativePlatformFeeMinor >= capture.platformFeeMinor) {
    await tx.booking.update({
      where: { id: refund.bookingId },
      data: { platformFeeState: 'REFUNDED' },
    });
  }
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Refund',
      aggregateId: refund.id,
      eventType: 'refund.completed',
      payload: { refundId: refund.id, bookingId: refund.bookingId, paymentId: refund.paymentId },
      metadata: { providerRefundId, source },
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: executorId,
      action: 'refund.completed',
      resourceType: 'Refund',
      resourceId: refund.id,
      outcome: 'SUCCESS',
      before: { status: refund.status },
      after: { status: 'COMPLETED', providerRefundId },
      metadata: { ledgerDualWrite: ledgerEnabled, source },
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      traceId: requestContext.traceId,
    },
  });
  if (refund.booking.client?.userId) {
    await tx.notification.create({
      data: {
        userId: refund.booking.client.userId,
        bookingId: refund.bookingId,
        type: 'SYSTEM',
        title: 'Reembolso procesado',
        message: `Tu reembolso de ${refund.totalAmount} ${refund.currency} ha sido procesado.`,
      },
    });
  }
  return { refund: completed, duplicate: false, ledgerTransaction };
};

const reconcileProviderRefundInTx = async ({
  tx,
  providerRefund,
  ledgerEnabled,
  processedAt = new Date(),
  requestContext = {},
  source = 'STRIPE_WEBHOOK',
  executorId = null,
}) => {
  const refundId = providerRefund?.metadata?.refundId;
  if (!refundId) return { ignored: true, duplicate: false, pending: false };

  const refund = await tx.refund.findUnique({
    where: { id: refundId },
    include: { decisionRecord: true, payment: true, booking: true },
  });
  if (!refund) throw errorWithStatus('Stripe refund references an unknown internal refund', 409);
  if (!refund.approvedBy || !refund.approvedAt || !refund.decisionRecord) {
    throw errorWithStatus('Stripe refund lacks approved immutable internal evidence', 409);
  }
  if (refund.requestedBy && refund.requestedBy === refund.approvedBy) {
    throw errorWithStatus('Stripe refund violates requester/approver separation', 409);
  }
  assertProviderRefundMatches({
    providerRefund,
    refund,
    refundMinor: decimalToMinor(refund.totalAmount),
  });
  if (refund.providerRefundId && refund.providerRefundId !== providerRefund.id) {
    throw errorWithStatus('Internal refund is linked to a different Stripe refund', 409);
  }
  if (refund.status === 'COMPLETED') {
    if (providerRefund.status !== 'succeeded') {
      throw errorWithStatus('Stripe reported a non-success state for a completed refund', 409);
    }
    return { refund, ignored: false, duplicate: true, pending: false };
  }
  if (refund.status === 'FAILED' && ['failed', 'canceled'].includes(providerRefund.status)) {
    return { refund, ignored: false, duplicate: true, pending: false };
  }
  if (refund.status !== 'PROCESSING') {
    throw errorWithStatus('Stripe refund event is not linked to an executing refund', 409);
  }

  if (['failed', 'canceled'].includes(providerRefund.status)) {
    const failed = await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: 'FAILED',
        providerRefundId: providerRefund.id,
        processedAt,
        failureReason: providerRefund.failure_reason || `Stripe refund ${providerRefund.status}`,
      },
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Refund',
        aggregateId: refund.id,
        eventType: 'refund.failed',
        payload: { refundId: refund.id, bookingId: refund.bookingId, paymentId: refund.paymentId },
        metadata: { providerRefundId: providerRefund.id, source },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: executorId,
        action: 'refund.failed',
        resourceType: 'Refund',
        resourceId: refund.id,
        outcome: 'FAILURE',
        before: { status: refund.status },
        after: { status: 'FAILED', providerRefundId: providerRefund.id },
        metadata: { source, failureReason: failed.failureReason },
        requestId: requestContext.requestId,
        correlationId: requestContext.correlationId,
        traceId: requestContext.traceId,
      },
    });
    return { refund: failed, ignored: false, duplicate: false, pending: false };
  }

  if (providerRefund.status === 'succeeded') {
    const result = await finalizeRefundInTx({
      tx,
      refundId: refund.id,
      providerRefundId: providerRefund.id,
      executorId,
      ledgerEnabled,
      processedAt,
      requestContext,
      source,
    });
    return { ...result, ignored: false, pending: false };
  }

  const processing = await tx.refund.update({
    where: { id: refund.id },
    data: { providerRefundId: providerRefund.id, status: 'PROCESSING', failureReason: null },
  });
  return { refund: processing, ignored: false, duplicate: false, pending: true };
};

const executeApprovedRefund = async ({
  refundId,
  executorId,
  stripeClient,
  ledgerEnabled,
  client = prisma,
  now = new Date(),
  requestContext = {},
}) => {
  const refund = await client.refund.findUnique({
    where: { id: refundId },
    include: { payment: true, booking: true, decisionRecord: true },
  });
  if (refund?.status === 'COMPLETED') return { refund, duplicate: true, pending: false };
  const previous = refund?.paymentId
    ? await client.refund.aggregate({
      where: { paymentId: refund.paymentId, status: 'COMPLETED', id: { not: refund.id } },
      _sum: { totalAmount: true, serviceAmount: true, platformFeeAmount: true },
    })
    : { _sum: { totalAmount: null, serviceAmount: null, platformFeeAmount: null } };
  const previouslyRefundedMinor = previous._sum.totalAmount ? decimalToMinor(previous._sum.totalAmount) : 0;
  const previousServiceRefundMinor = previous._sum.serviceAmount ? decimalToMinor(previous._sum.serviceAmount) : 0;
  const previousPlatformFeeRefundMinor = previous._sum.platformFeeAmount ? decimalToMinor(previous._sum.platformFeeAmount) : 0;
  const executable = assertRefundExecutable({
    refund,
    previouslyRefundedMinor,
    previousServiceRefundMinor,
    previousPlatformFeeRefundMinor,
    now,
  });
  if (executable.duplicate) return { refund, duplicate: true, pending: false };

  if (ledgerEnabled) {
    const captureTransaction = await client.ledgerTransaction.findUnique({
      where: { idempotencyKey: `payment:${refund.payment.id}:capture` },
    });
    if (!captureTransaction) throw errorWithStatus('Capture ledger transaction is required before refund execution', 409);
  }

  const leaseExpiredBefore = new Date(now.getTime() - REFUND_PROCESSING_LEASE_MS);
  const claimed = await client.refund.updateMany({
    where: {
      id: refund.id,
      approvedBy: { not: null },
      OR: [
        { status: { in: ['APPROVED', 'FAILED'] } },
        { status: 'PROCESSING', processingStartedAt: { lt: leaseExpiredBefore } },
      ],
    },
    data: {
      status: 'PROCESSING',
      processingStartedAt: now,
      attempts: { increment: 1 },
      failureReason: null,
    },
  });
  if (claimed.count === 0) throw errorWithStatus('Refund execution is already in progress', 409);

  try {
    const providerRefund = refund.providerRefundId
      ? await stripeClient.refunds.retrieve(refund.providerRefundId)
      : await stripeClient.refunds.create({
        payment_intent: refund.payment.transactionId,
        amount: executable.refundMinor,
        metadata: {
          refundId: refund.id,
          bookingId: refund.bookingId,
          paymentId: refund.paymentId,
        },
      }, { idempotencyKey: `refund:${refund.id}:execute` });

    assertProviderRefundMatches({ providerRefund, refund, refundMinor: executable.refundMinor });

    const result = await client.$transaction((tx) => reconcileProviderRefundInTx({
      tx,
      providerRefund,
      executorId,
      ledgerEnabled,
      processedAt: now,
      requestContext,
      source: 'ADMIN_REFUND_EXECUTION',
    }));
    if (result.refund?.status === 'FAILED') throw errorWithStatus('Stripe rejected the refund', 502);
    return { ...result, pending: Boolean(result.pending) };
  } catch (error) {
    await client.refund.updateMany({
      where: { id: refund.id, status: 'PROCESSING' },
      data: { failureReason: String(error.message || error).slice(0, 1000) },
    }).catch(() => {});
    throw error;
  }
};

module.exports = {
  REFUND_PROCESSING_LEASE_MS,
  assertProviderRefundMatches,
  assertRefundExecutable,
  finalizeRefundInTx,
  reconcileProviderRefundInTx,
  executeApprovedRefund,
};
