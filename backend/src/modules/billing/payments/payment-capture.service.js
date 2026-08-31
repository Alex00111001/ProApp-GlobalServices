const { decimalToMinor } = require('../pricing/pricing.service');
const { postTransactionInTx } = require('../ledger/ledger.service');
const { normalizeCaptureAmounts, buildCaptureEntries } = require('../ledger/payment-capture-journal');

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
  providerAmountMinor,
  providerCurrency,
  processedAt = new Date(),
  source,
  ledgerEnabled,
}) => {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true, professional: { select: { userId: true } } },
  });
  if (!booking || !booking.payment || booking.payment.transactionId !== providerTransactionId) {
    throw new Error('Payment event does not match a persisted booking payment');
  }
  assertProviderAmount({ payment: booking.payment, providerAmountMinor, providerCurrency });

  const claimed = await tx.payment.updateMany({
    where: { id: booking.payment.id, status: { not: 'COMPLETED' } },
    data: { status: 'COMPLETED', processedAt, failedReason: null },
  });
  if (claimed.count === 0) {
    const currentBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      include: { payment: true },
    });
    return { duplicate: true, payment: currentBooking.payment, booking: currentBooking, ledgerTransaction: null };
  }

  const updatedBooking = await tx.booking.update({
    where: { id: booking.id },
    data: { status: 'CONFIRMED' },
    include: { payment: true },
  });

  let ledgerTransaction = null;
  if (ledgerEnabled) {
    const amounts = normalizeCaptureAmounts({ booking, payment: booking.payment });
    const accountIds = await ensureAccounts(tx, amounts.currency);
    ledgerTransaction = await postTransactionInTx({
      idempotencyKey: `payment:${booking.payment.id}:capture`,
      bookingId: booking.id,
      paymentId: booking.payment.id,
      description: `Payment captured via ${source}`,
      metadata: { source, providerTransactionId, pricingMode: amounts.pricingMode },
      entries: buildCaptureEntries(amounts, accountIds),
    }, tx);
  }

  await tx.outboxEvent.create({
    data: {
      aggregateType: 'Payment',
      aggregateId: booking.payment.id,
      eventType: 'payment.completed',
      payload: { bookingId: booking.id, paymentId: booking.payment.id, source },
      metadata: { providerTransactionId },
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
      metadata: { source, providerTransactionId, ledgerDualWrite: ledgerEnabled },
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
