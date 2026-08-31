const { Prisma } = require('@prisma/client');
const prisma = require('../../../config/prisma');
const { decimalToMinor } = require('../pricing/pricing.service');
const { postTransactionInTx } = require('../ledger/ledger.service');
const { ensureAccounts } = require('../payments/payment-capture.service');
const { buildPayoutEntries } = require('./payout-journal');

const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const errorWithStatus = (message, status) => Object.assign(new Error(message), { status });

const loadPayoutEvidenceInTx = async ({ tx, payoutId }) => {
  const payout = await tx.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return null;
  const booking = await tx.booking.findUnique({ where: { id: payout.bookingId } });
  const payment = await tx.payment.findUnique({ where: { id: payout.paymentId } });
  const earning = await tx.earning.findUnique({ where: { id: payout.earningId } });
  const professional = await tx.professionalProfile.findUnique({
    where: { id: payout.professionalId },
    include: { user: true },
  });
  return { ...payout, booking, payment, earning, professional };
};

const assertPayoutExecutable = ({ payout, executorId, now = new Date() }) => {
  if (!payout) throw errorWithStatus('Payout not found', 404);
  if (payout.status === 'COMPLETED') return { duplicate: true };
  if (!payout.approvedBy || !payout.approvedAt) throw errorWithStatus('Payout requires prior approval', 409);
  if (payout.requestedBy && payout.requestedBy === payout.approvedBy) {
    throw errorWithStatus('Payout violates requester/approver separation', 409);
  }
  if (payout.requestedBy && payout.requestedBy === executorId) {
    throw errorWithStatus('Payout requester cannot execute the same payout', 409);
  }
  if (payout.approvedBy === executorId) {
    throw errorWithStatus('Payout approver cannot execute the same payout', 409);
  }
  if (payout.booking?.status !== 'COMPLETED' || payout.payment?.status !== 'COMPLETED') {
    throw errorWithStatus('Payout requires a completed booking and captured payment', 409);
  }
  if (payout.earning?.status !== 'PENDING') throw errorWithStatus('Professional earning is not payable', 409);
  if (!payout.connectedAccountId || payout.connectedAccountId !== payout.professional?.stripeAccountId) {
    throw errorWithStatus('Payout connected account does not match the professional', 409);
  }
  const amountMinor = decimalToMinor(payout.amount);
  if (amountMinor <= 0 || amountMinor !== decimalToMinor(payout.earning.netAmount)) {
    throw errorWithStatus('Payout amount does not match professional earnings', 409);
  }
  return { duplicate: false, amountMinor, currency: String(payout.currency).toUpperCase(), now };
};

const assertRecipientTransfersActive = (account, expectedAccountId) => {
  if (!account || account.id !== expectedAccountId) {
    throw errorWithStatus('Stripe connected account identity mismatch', 409);
  }
  const status = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  if (status !== 'active') {
    throw errorWithStatus('Stripe transfer capability is not active for the professional', 409);
  }
  return status;
};

const claimPayoutForExecution = async ({ client = prisma, payoutId, executorId, now = new Date() }) => client.$transaction(async (tx) => {
  const identity = await tx.payout.findUnique({ where: { id: payoutId }, select: { paymentId: true } });
  if (!identity) throw errorWithStatus('Payout not found', 404);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${identity.paymentId} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payout" WHERE "id" = ${payoutId} FOR UPDATE`);
  const payout = await loadPayoutEvidenceInTx({ tx, payoutId });
  if (payout.status === 'COMPLETED') return { payout, duplicate: true, executable: null };

  const activeDispute = await tx.dispute.findFirst({
    where: { paymentId: payout.paymentId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    select: { id: true },
  });
  if (activeDispute) throw errorWithStatus('Payout is blocked by an active dispute', 409);
  const completedRefunds = await tx.refund.count({ where: { paymentId: payout.paymentId, status: 'COMPLETED' } });
  if (completedRefunds > 0) throw errorWithStatus('Payout requires refund-adjusted earnings review', 409);

  const executable = assertPayoutExecutable({ payout, executorId, now });
  const leaseExpiredBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const claimed = await tx.payout.updateMany({
    where: {
      id: payout.id,
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
  if (claimed.count === 0) throw errorWithStatus('Payout is already being processed', 409);
  return { payout: { ...payout, status: 'PROCESSING', processingStartedAt: now }, duplicate: false, executable };
});

const assertProviderPayment = ({ paymentIntent, payout }) => {
  if (!paymentIntent || paymentIntent.id !== payout.payment.transactionId || paymentIntent.status !== 'succeeded') {
    throw errorWithStatus('Stripe payment is not a successful captured PaymentIntent', 409);
  }
  if (paymentIntent.metadata?.bookingId !== payout.bookingId) {
    throw errorWithStatus('Stripe payment metadata does not match payout booking', 409);
  }
  const chargeId = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id;
  if (!chargeId) throw errorWithStatus('Stripe payment does not expose a source charge', 409);
  if (payout.payment.providerChargeId && payout.payment.providerChargeId !== chargeId) {
    throw errorWithStatus('Stripe source charge does not match persisted payment evidence', 409);
  }
  return chargeId;
};

const assertProviderTransfer = ({ transfer, payout, chargeId, amountMinor }) => {
  const destination = typeof transfer?.destination === 'string' ? transfer.destination : transfer?.destination?.id;
  const sourceTransaction = typeof transfer?.source_transaction === 'string'
    ? transfer.source_transaction
    : transfer?.source_transaction?.id;
  if (!transfer?.id || transfer.amount !== amountMinor || String(transfer.currency).toUpperCase() !== payout.currency) {
    throw errorWithStatus('Stripe transfer amount or currency mismatch', 409);
  }
  if (destination !== payout.connectedAccountId || sourceTransaction !== chargeId) {
    throw errorWithStatus('Stripe transfer destination or source mismatch', 409);
  }
  if (transfer.metadata?.payoutId !== payout.id || transfer.metadata?.bookingId !== payout.bookingId) {
    throw errorWithStatus('Stripe transfer metadata mismatch', 409);
  }
};

const finalizePayoutInTx = async ({
  tx,
  payoutId,
  providerTransfer,
  providerChargeId,
  ledgerEnabled,
  processedAt = new Date(),
  requestContext = {},
}) => {
  const payout = await loadPayoutEvidenceInTx({ tx, payoutId });
  if (!payout) throw errorWithStatus('Payout not found', 404);
  if (payout.status === 'COMPLETED') {
    if (payout.providerTransferId !== providerTransfer.id) throw errorWithStatus('Payout is linked to another Stripe transfer', 409);
    return { payout, duplicate: true, ledgerTransaction: null };
  }
  if (payout.status !== 'PROCESSING') throw errorWithStatus('Payout was not claimed for execution', 409);
  const amountMinor = decimalToMinor(payout.amount);
  assertProviderTransfer({ transfer: providerTransfer, payout, chargeId: providerChargeId, amountMinor });

  await tx.payment.updateMany({
    where: { id: payout.paymentId, providerChargeId: null },
    data: { providerChargeId },
  });
  const completed = await tx.payout.update({
    where: { id: payout.id },
    data: {
      status: 'COMPLETED',
      providerTransferId: providerTransfer.id,
      processedAt,
      failureReason: null,
    },
  });
  await tx.earning.update({
    where: { id: payout.earningId },
    data: { status: 'PAID', payoutDate: processedAt },
  });

  let ledgerTransaction = null;
  if (ledgerEnabled) {
    const accountIds = await ensureAccounts(tx, payout.currency);
    ledgerTransaction = await postTransactionInTx({
      idempotencyKey: `payout:${payout.id}:transfer`,
      bookingId: payout.bookingId,
      paymentId: payout.paymentId,
      payoutId: payout.id,
      description: 'Professional payout transferred through Stripe Connect',
      metadata: { providerTransferId: providerTransfer.id, providerChargeId },
      entries: buildPayoutEntries({ amountMinor, currency: payout.currency, accountIds }),
    }, tx);
  }
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Payout',
      aggregateId: payout.id,
      eventType: 'payout.completed',
      payload: { payoutId: payout.id, bookingId: payout.bookingId, professionalId: payout.professionalId },
      metadata: { providerTransferId: providerTransfer.id, providerChargeId, ledgerDualWrite: ledgerEnabled },
    },
  });
  await tx.auditLog.create({
    data: {
      action: 'payout.completed',
      resourceType: 'Payout',
      resourceId: payout.id,
      outcome: 'SUCCESS',
      before: { status: payout.status },
      after: { status: 'COMPLETED', providerTransferId: providerTransfer.id },
      metadata: { providerChargeId, ledgerDualWrite: ledgerEnabled },
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      traceId: requestContext.traceId,
    },
  });
  if (payout.professional?.user?.id) {
    await tx.notification.create({
      data: {
        userId: payout.professional.user.id,
        bookingId: payout.bookingId,
        type: 'PAYMENT_RECEIVED',
        title: 'Pago enviado',
        message: `Tu pago de la reserva ${payout.bookingId} fue transferido.`,
      },
    });
  }
  return { payout: completed, duplicate: false, ledgerTransaction };
};

const executeApprovedPayout = async ({
  payoutId,
  executorId,
  stripeClient,
  ledgerEnabled,
  requestContext = {},
  client = prisma,
  now = new Date(),
}) => {
  const existing = await client.payout.findUnique({ where: { id: payoutId } });
  if (existing?.status === 'COMPLETED') return { payout: existing, duplicate: true };
  const claim = await claimPayoutForExecution({ client, payoutId, executorId, now });
  if (claim.duplicate) return { payout: claim.payout, duplicate: true };
  const payout = claim.payout;

  try {
    const account = await stripeClient.v2.core.accounts.retrieve(payout.connectedAccountId, {
      include: ['configuration.recipient'],
    });
    assertRecipientTransfersActive(account, payout.connectedAccountId);
    const paymentIntent = await stripeClient.paymentIntents.retrieve(payout.payment.transactionId);
    const providerChargeId = assertProviderPayment({ paymentIntent, payout });
    const transfer = await stripeClient.transfers.create({
      amount: claim.executable.amountMinor,
      currency: payout.currency.toLowerCase(),
      destination: payout.connectedAccountId,
      source_transaction: providerChargeId,
      transfer_group: `booking_${payout.bookingId}`,
      metadata: {
        payoutId: payout.id,
        bookingId: payout.bookingId,
        paymentId: payout.paymentId,
        professionalId: payout.professionalId,
      },
    }, { idempotencyKey: payout.idempotencyKey });

    return client.$transaction((tx) => finalizePayoutInTx({
      tx,
      payoutId: payout.id,
      providerTransfer: transfer,
      providerChargeId,
      ledgerEnabled,
      processedAt: now,
      requestContext,
    }));
  } catch (error) {
    await client.payout.updateMany({
      where: { id: payout.id, status: 'PROCESSING' },
      data: { status: 'FAILED', failureReason: String(error.message || error).slice(0, 1000) },
    });
    throw error;
  }
};

module.exports = {
  PROCESSING_LEASE_MS,
  loadPayoutEvidenceInTx,
  assertPayoutExecutable,
  assertRecipientTransfersActive,
  claimPayoutForExecution,
  assertProviderPayment,
  assertProviderTransfer,
  finalizePayoutInTx,
  executeApprovedPayout,
};
