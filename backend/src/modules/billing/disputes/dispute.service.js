const { Prisma } = require('@prisma/client');
const prisma = require('../../../config/prisma');
const { decimalToMinor } = require('../pricing/pricing.service');
const { ensureAccounts } = require('../payments/payment-capture.service');
const { postTransactionInTx } = require('../ledger/ledger.service');
const { buildTransferReversalEntries } = require('./dispute-journal');

const errorWithStatus = (message, status) => Object.assign(new Error(message), { status });
const activeProviderStatuses = new Set([
  'needs_response',
  'under_review',
  'warning_needs_response',
  'warning_under_review',
]);

const providerId = (value) => (typeof value === 'string' ? value : value?.id);
const moneyFromMinor = (amountMinor) => (amountMinor / 100).toFixed(2);

const mapDisputeStatus = (status) => {
  if (status === 'won') return 'WON';
  if (status === 'lost') return 'LOST';
  if (status === 'warning_closed' || status === 'prevented') return 'WARNING_CLOSED';
  if (status === 'under_review' || status === 'warning_under_review') return 'UNDER_REVIEW';
  return 'OPEN';
};

const validateProviderDispute = (providerDispute) => {
  const chargeId = providerId(providerDispute?.charge);
  const paymentIntentId = providerId(providerDispute?.payment_intent);
  if (
    !providerDispute?.id ||
    !providerDispute.status ||
    !chargeId ||
    !Number.isSafeInteger(providerDispute.amount) ||
    providerDispute.amount <= 0
  ) {
    throw new TypeError('Stripe dispute is missing canonical financial evidence');
  }
  const currency = String(providerDispute.currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('Stripe dispute currency is invalid');
  return { chargeId, paymentIntentId, amountMinor: providerDispute.amount, currency };
};

const recordProviderDisputeInTx = async ({
  tx,
  providerDispute,
  providerEventAt = new Date(),
  eventType,
  requestContext = {},
}) => {
  const normalized = validateProviderDispute(providerDispute);
  const payment = await tx.payment.findFirst({
    where: {
      OR: [
        { providerChargeId: normalized.chargeId },
        ...(normalized.paymentIntentId ? [{ transactionId: normalized.paymentIntentId }] : []),
      ],
    },
    include: { booking: true, payout: true },
  });
  if (!payment) throw errorWithStatus('Stripe dispute does not match a persisted payment', 409);
  if (decimalToMinor(payment.amount) < normalized.amountMinor) {
    throw errorWithStatus('Stripe dispute exceeds the captured payment', 409);
  }
  if (String(payment.currency).toUpperCase() !== normalized.currency) {
    throw errorWithStatus('Stripe dispute currency does not match the payment', 409);
  }
  if (payment.providerChargeId && payment.providerChargeId !== normalized.chargeId) {
    throw errorWithStatus('Stripe dispute charge does not match persisted payment evidence', 409);
  }

  await tx.payment.updateMany({
    where: { id: payment.id, providerChargeId: null },
    data: { providerChargeId: normalized.chargeId },
  });
  const existing = await tx.dispute.findUnique({ where: { providerDisputeId: providerDispute.id } });
  if (existing) {
    if (
      existing.paymentId !== payment.id ||
      existing.providerChargeId !== normalized.chargeId ||
      decimalToMinor(existing.amount) !== normalized.amountMinor ||
      existing.currency !== normalized.currency
    ) {
      throw errorWithStatus('Stripe dispute identity conflicts with persisted evidence', 409);
    }
    if (existing.lastProviderEventAt && providerEventAt < existing.lastProviderEventAt) {
      return { dispute: existing, payout: payment.payout, duplicate: true, stale: true };
    }
  }

  const status = mapDisputeStatus(providerDispute.status);
  const closedAt = ['WON', 'LOST', 'WARNING_CLOSED'].includes(status) ? providerEventAt : null;
  const evidenceDueBy = providerDispute.evidence_details?.due_by
    ? new Date(providerDispute.evidence_details.due_by * 1000)
    : null;
  const evidence = {
    hasEvidence: Boolean(providerDispute.evidence_details?.has_evidence),
    pastDue: Boolean(providerDispute.evidence_details?.past_due),
    submissionCount: providerDispute.evidence_details?.submission_count || 0,
  };
  const data = {
    bookingId: payment.bookingId,
    paymentId: payment.id,
    payoutId: payment.payout?.id || null,
    professionalId: payment.booking.professionalId,
    idempotencyKey: `stripe:dispute:${providerDispute.id}`,
    providerChargeId: normalized.chargeId,
    status,
    providerStatus: providerDispute.status,
    reason: providerDispute.reason || null,
    amount: moneyFromMinor(normalized.amountMinor),
    currency: normalized.currency,
    evidenceDueBy,
    evidence,
    openedAt: providerDispute.created ? new Date(providerDispute.created * 1000) : providerEventAt,
    lastProviderEventAt: providerEventAt,
    closedAt,
    failureReason: null,
  };
  const dispute = existing
    ? await tx.dispute.update({ where: { id: existing.id }, data })
    : await tx.dispute.create({ data: { ...data, providerDisputeId: providerDispute.id } });

  const changed = !existing || existing.status !== dispute.status || existing.providerStatus !== dispute.providerStatus;
  if (changed) {
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Dispute',
        aggregateId: dispute.id,
        eventType: `dispute.${dispute.status.toLowerCase()}`,
        payload: { disputeId: dispute.id, bookingId: dispute.bookingId, paymentId: dispute.paymentId },
        metadata: { providerDisputeId: dispute.providerDisputeId, providerStatus: dispute.providerStatus, source: eventType },
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'dispute.reconciled',
        resourceType: 'Dispute',
        resourceId: dispute.id,
        outcome: 'SUCCESS',
        before: existing ? { status: existing.status, providerStatus: existing.providerStatus } : undefined,
        after: { status: dispute.status, providerStatus: dispute.providerStatus },
        metadata: { providerDisputeId: dispute.providerDisputeId, source: eventType },
        requestId: requestContext.requestId,
        correlationId: requestContext.correlationId,
        traceId: requestContext.traceId,
      },
    });
  }
  return { dispute, payout: payment.payout, duplicate: !changed, stale: false };
};

const assertProviderReversal = ({ reversal, payout, dispute, amountMinor }) => {
  const transferId = providerId(reversal?.transfer);
  if (!reversal?.id || reversal.amount !== amountMinor || transferId !== payout.providerTransferId) {
    throw errorWithStatus('Stripe transfer reversal does not match the payout', 409);
  }
  if (reversal.metadata?.disputeId !== dispute.id || reversal.metadata?.payoutId !== payout.id) {
    throw errorWithStatus('Stripe transfer reversal metadata mismatch', 409);
  }
};

const finalizeTransferReversalInTx = async ({
  tx,
  disputeId,
  providerReversal,
  amountMinor,
  ledgerEnabled,
  requestContext = {},
}) => {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Dispute" WHERE "id" = ${disputeId} FOR UPDATE`);
  const dispute = await tx.dispute.findUnique({ where: { id: disputeId }, include: { payout: true } });
  if (!dispute?.payout) throw errorWithStatus('Dispute payout is unavailable for reversal', 409);
  if (dispute.providerTransferReversalId) {
    if (dispute.providerTransferReversalId !== providerReversal.id) {
      throw errorWithStatus('Dispute is linked to another transfer reversal', 409);
    }
    return { dispute, payout: dispute.payout, duplicate: true, ledgerTransaction: null };
  }
  assertProviderReversal({ reversal: providerReversal, payout: dispute.payout, dispute, amountMinor });

  const payoutAmountMinor = decimalToMinor(dispute.payout.amount);
  const previousReversedMinor = decimalToMinor(dispute.payout.reversedAmount);
  if (previousReversedMinor + amountMinor > payoutAmountMinor) {
    throw errorWithStatus('Transfer reversal exceeds the payout amount', 409);
  }
  const reversedAmountMinor = previousReversedMinor + amountMinor;
  const payoutStatus = reversedAmountMinor === payoutAmountMinor ? 'REVERSED' : 'COMPLETED';
  const processedAt = new Date();
  const payout = await tx.payout.update({
    where: { id: dispute.payout.id },
    data: {
      reversedAmount: moneyFromMinor(reversedAmountMinor),
      reversedAt: processedAt,
      status: payoutStatus,
    },
  });
  const updatedDispute = await tx.dispute.update({
    where: { id: dispute.id },
    data: {
      providerTransferReversalId: providerReversal.id,
      recoveredAmount: moneyFromMinor(amountMinor),
      failureReason: null,
    },
  });

  let ledgerTransaction = null;
  if (ledgerEnabled) {
    const accountIds = await ensureAccounts(tx, dispute.currency);
    ledgerTransaction = await postTransactionInTx({
      idempotencyKey: `dispute:${dispute.id}:transfer-reversal`,
      bookingId: dispute.bookingId,
      paymentId: dispute.paymentId,
      payoutId: payout.id,
      disputeId: dispute.id,
      description: 'Professional transfer reversed for Stripe dispute recovery',
      metadata: { providerTransferReversalId: providerReversal.id },
      entries: buildTransferReversalEntries({ amountMinor, currency: dispute.currency, accountIds }),
    }, tx);
  }
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Dispute',
      aggregateId: dispute.id,
      eventType: 'dispute.transfer_reversed',
      payload: { disputeId: dispute.id, payoutId: payout.id, bookingId: dispute.bookingId },
      metadata: { amountMinor, currency: dispute.currency, providerTransferReversalId: providerReversal.id },
    },
  });
  await tx.auditLog.create({
    data: {
      action: 'dispute.transfer_reversed',
      resourceType: 'Dispute',
      resourceId: dispute.id,
      outcome: 'SUCCESS',
      before: { recoveredAmountMinor: decimalToMinor(dispute.recoveredAmount), payoutStatus: dispute.payout.status },
      after: { recoveredAmountMinor: amountMinor, payoutStatus },
      metadata: { payoutId: payout.id, providerTransferReversalId: providerReversal.id },
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      traceId: requestContext.traceId,
    },
  });
  return { dispute: updatedDispute, payout, duplicate: false, ledgerTransaction };
};

const recoverDisputedTransfer = async ({
  dispute,
  payout,
  stripeClient,
  ledgerEnabled,
  requestContext = {},
  client = prisma,
}) => {
  if (!payout?.providerTransferId || !['COMPLETED', 'REVERSED'].includes(payout.status)) {
    return { dispute, payout, skipped: true };
  }
  if (dispute.providerTransferReversalId || !activeProviderStatuses.has(dispute.providerStatus)) {
    return { dispute, payout, skipped: true };
  }
  const remainingPayoutMinor = decimalToMinor(payout.amount) - decimalToMinor(payout.reversedAmount);
  const amountMinor = Math.min(decimalToMinor(dispute.amount), remainingPayoutMinor);
  if (amountMinor <= 0) return { dispute, payout, skipped: true };

  try {
    const reversal = await stripeClient.transfers.createReversal(payout.providerTransferId, {
      amount: amountMinor,
      metadata: { disputeId: dispute.id, payoutId: payout.id, bookingId: dispute.bookingId },
    }, { idempotencyKey: `dispute:${dispute.id}:transfer-reversal` });
    return client.$transaction((tx) => finalizeTransferReversalInTx({
      tx,
      disputeId: dispute.id,
      providerReversal: reversal,
      amountMinor,
      ledgerEnabled,
      requestContext,
    }));
  } catch (error) {
    await client.dispute.updateMany({
      where: { id: dispute.id, providerTransferReversalId: null },
      data: { failureReason: String(error.message || error).slice(0, 1000) },
    });
    throw error;
  }
};

const reconcileProviderDispute = async ({
  providerDispute,
  eventType,
  providerEventAt,
  recoveryEnabled,
  ledgerEnabled,
  stripeClient,
  requestContext = {},
  client = prisma,
}) => {
  const recorded = await client.$transaction((tx) => recordProviderDisputeInTx({
    tx,
    providerDispute,
    providerEventAt,
    eventType,
    requestContext,
  }));
  if (!recoveryEnabled || recorded.stale) return { ...recorded, recoverySkipped: true };
  const recovered = await recoverDisputedTransfer({
    dispute: recorded.dispute,
    payout: recorded.payout,
    stripeClient,
    ledgerEnabled,
    requestContext,
    client,
  });
  return { ...recorded, recovery: recovered };
};

module.exports = {
  activeProviderStatuses,
  mapDisputeStatus,
  validateProviderDispute,
  recordProviderDisputeInTx,
  assertProviderReversal,
  finalizeTransferReversalInTx,
  recoverDisputedTransfer,
  reconcileProviderDispute,
};
