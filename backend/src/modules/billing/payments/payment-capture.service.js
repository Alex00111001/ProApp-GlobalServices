const { decimalToMinor } = require('../pricing/pricing.service');
const { postTransactionInTx } = require('../ledger/ledger.service');
const { normalizeCaptureAmounts, buildCaptureEntries } = require('../ledger/payment-capture-journal');
const { telemetryMetadata } = require('../../observability/context');

const ACCOUNT_DEFINITIONS = Object.freeze({
  paymentClearing: { code: 'PAYMENT_CLEARING', type: 'ASSET', name: 'Payment clearing' },
  professionalPayable: { code: 'PROFESSIONAL_PAYABLE', type: 'LIABILITY', name: 'Professional payable' },
  platformFeeRevenue: { code: 'PLATFORM_FEE_REVENUE', type: 'REVENUE', name: 'Customer platform fee revenue' },
  commissionRevenue: { code: 'PROFESSIONAL_COMMISSION_REVENUE', type: 'REVENUE', name: 'Professional commission revenue' },
});

const ensureAccounts = async (tx, currency) => {
  const accountIds = {};
  for (const [key, definition] of Object.entries(ACCOUNT_DEFINITIONS)) {
    const account = await tx.ledgerAccount.upsert({
      where: { code_currency: { code: definition.code, currency } },
      update: {},
      create: { ...definition, currency },
    });
    accountIds[key] = account.id;
  }
  return accountIds;
};

const assertProviderAmount = ({ payment, providerAmountMinor, providerCurrency }) => {
  if (!Number.isSafeInteger(providerAmountMinor) || providerAmountMinor <= 0) {
    throw new Error('Provider payment amount must be positive minor units');
  }
  if (decimalToMinor(payment.amount) !== providerAmountMinor) {
    throw new Error('Provider payment amount does not match the persisted payment');
  }
  if (String(payment.currency).toUpperCase() !== String(providerCurrency).toUpperCase()) {
    throw new Error('Provider payment currency does not match the persisted payment');
  }
};

const applySuccessfulPayment = async ({
  tx,
  bookingId,
  providerTransactionId,
  providerChargeId,
  providerAmountMinor,
  providerCurrency,
  processedAt = new Date(),
  source,
  ledgerEnabled,
  requestContext = {},
}) => {
  const bookingRecord = await tx.booking.findUnique({ where: { id: bookingId } });
  const payment = bookingRecord
    ? await tx.payment.findUnique({ where: { bookingId } })
    : null;
  const professional = bookingRecord?.professionalId
    ? await tx.professionalProfile.findUnique({
      where: { id: bookingRecord.professionalId },
      select: { userId: true },
    })
    : null;
  const booking = bookingRecord ? { ...bookingRecord, payment, professional } : null;
  if (!booking || !booking.payment || booking.payment.transactionId !== providerTransactionId) {
    throw new Error('Payment event does not match a persisted booking payment');
  }
  assertProviderAmount({ payment: booking.payment, providerAmountMinor, providerCurrency });
  if (providerChargeId && booking.payment.providerChargeId && booking.payment.providerChargeId !== providerChargeId) {
    throw new Error('Provider charge does not match the persisted payment');
  }
  if (providerChargeId && !booking.payment.providerChargeId) {
    await tx.payment.updateMany({
      where: { id: booking.payment.id, providerChargeId: null },
      data: { providerChargeId },
    });
  }

  const claimed = await tx.payment.updateMany({
    where: { id: booking.payment.id, status: { not: 'COMPLETED' } },
    data: { status: 'COMPLETED', processedAt, failedReason: null, ...(providerChargeId ? { providerChargeId } : {}) },
  });
  if (claimed.count === 0) {
    const currentBookingRecord = await tx.booking.findUnique({ where: { id: booking.id } });
    const currentPayment = await tx.payment.findUnique({ where: { bookingId: booking.id } });
    const currentBooking = { ...currentBookingRecord, payment: currentPayment };
    return { duplicate: true, payment: currentBooking.payment, booking: currentBooking, ledgerTransaction: null };
  }

  const updatedBookingRecord = await tx.booking.update({
    where: { id: booking.id },
    data: { status: 'CONFIRMED' },
  });
  const updatedPayment = await tx.payment.findUnique({ where: { bookingId: booking.id } });
  const updatedBooking = { ...updatedBookingRecord, payment: updatedPayment };

  let ledgerTransaction = null;
  if (ledgerEnabled) {
    const amounts = normalizeCaptureAmounts({ booking, payment: booking.payment });
    const accountIds = await ensureAccounts(tx, amounts.currency);
    ledgerTransaction = await postTransactionInTx({
      idempotencyKey: `payment:${booking.payment.id}:capture`,
      bookingId: booking.id,
      paymentId: booking.payment.id,
      description: `Payment captured via ${source}`,
      metadata: { source, providerTransactionId, providerChargeId, pricingMode: amounts.pricingMode },
      entries: buildCaptureEntries(amounts, accountIds),
    }, tx);
  }

  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Payment',
      aggregateId: booking.payment.id,
      eventType: 'payment.completed',
      payload: { bookingId: booking.id, paymentId: booking.payment.id, source },
      metadata: telemetryMetadata(requestContext, { providerTransactionId, providerChargeId }),
    },
  });
  await tx.auditLog.create({
    data: {
      action: 'payment.completed',
      resourceType: 'Payment',
      resourceId: booking.payment.id,
      outcome: 'SUCCESS',
      before: { status: booking.payment.status },
      after: { status: 'COMPLETED' },
      metadata: { source, providerTransactionId, providerChargeId, ledgerDualWrite: ledgerEnabled },
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      traceId: requestContext.traceId,
    },
  });
  if (booking.professional?.userId) {
    await tx.notification.create({
      data: {
        userId: booking.professional.userId,
        bookingId: booking.id,
        type: 'PAYMENT_RECEIVED',
        title: 'Pago recibido',
        message: `Se ha recibido el pago de la reserva ${booking.id}.`,
      },
    });
  }

  return { duplicate: false, payment: updatedBooking.payment, booking: updatedBooking, ledgerTransaction };
};

module.exports = { ACCOUNT_DEFINITIONS, ensureAccounts, assertProviderAmount, applySuccessfulPayment };
