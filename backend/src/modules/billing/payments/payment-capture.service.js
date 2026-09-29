const { decimalToMinor } = require('../pricing/pricing.service');
const { Prisma } = require('@prisma/client');
const { postTransactionInTx } = require('../ledger/ledger.service');
const { normalizeCaptureAmounts, buildCaptureEntries } = require('../ledger/payment-capture-journal');
const { reconcileCancelledBookingPaymentInTx } = require('./booking-payment-cancellation.service');
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
  // Payment before Booking is the shared lock order for capture, refund and
  // booking/financial transitions. Provider I/O is never performed under it.
  const identity = await tx.payment.findUnique({ where: { bookingId }, select: { id: true } });
  if (identity && typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${identity.id} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`);
  }
  const bookingRecord = await tx.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: { select: { country: true } },
      market: { select: { country: { select: { isoAlpha2: true } } } },
    },
  });
  const payment = bookingRecord ? await tx.payment.findUnique({ where: { bookingId } }) : null;
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
  if (!['COMPLETED', 'REFUNDED'].includes(booking.payment.status) && booking.payment.method !== 'STRIPE') {
    throw Object.assign(new Error('Only a persisted Stripe payment can accept Stripe capture.'), {
      code: 'PAYMENT_METHOD_CONFLICT', statusCode: 409,
    });
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
    where: { id: booking.payment.id, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
    data: { status: 'COMPLETED', processedAt, failedReason: null, ...(providerChargeId ? { providerChargeId } : {}) },
  });
  if (claimed.count === 0) {
    const currentBookingRecord = await tx.booking.findUnique({ where: { id: booking.id } });
    const currentPayment = await tx.payment.findUnique({ where: { bookingId: booking.id } });
    const currentBooking = { ...currentBookingRecord, payment: currentPayment };
    if (!['COMPLETED', 'REFUNDED'].includes(currentPayment?.status)) {
      throw Object.assign(new Error('Payment is not capturable from its current state.'), {
        code: 'PAYMENT_CAPTURE_CONFLICT', statusCode: 409,
      });
    }
    return { duplicate: true, payment: currentBooking.payment, booking: currentBooking, ledgerTransaction: null };
  }

  // Only the assigned professional may confirm a Booking. Stripe capture is
  // financial evidence, never a Booking lifecycle command.
  const updatedBookingRecord = await tx.booking.findUnique({ where: { id: booking.id } });
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
  if (updatedBooking.status === 'CANCELLED') {
    const refundRequest = await reconcileCancelledBookingPaymentInTx({
      tx,
      booking: { ...bookingRecord, status: 'CANCELLED', payment: updatedPayment, cancelledAt: bookingRecord.cancelledAt || processedAt },
      requestContext,
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Payment', aggregateId: booking.payment.id,
        eventType: 'payment.captured_after_cancellation',
        payload: { bookingId: booking.id, paymentId: booking.payment.id, refundOutcome: refundRequest?.outcome || 'MANUAL_REVIEW' },
        metadata: telemetryMetadata(requestContext),
      },
    });
  }
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
