const { Prisma } = require('@prisma/client');

const PAYABLE_BOOKING_STATUSES = Object.freeze(['PENDING', 'CONFIRMED', 'IN_PROGRESS']);
const PREPARABLE_PAYMENT_STATUSES = Object.freeze(['PENDING', 'PROCESSING', 'FAILED']);

const isBookingPayable = (booking) => Boolean(booking && PAYABLE_BOOKING_STATUSES.includes(booking.status));

const intentPaymentData = ({ amountMinor, currency, paymentIntentId }) => ({
  amount: (amountMinor / 100).toFixed(2),
  currency: String(currency).toUpperCase(),
  status: 'PROCESSING',
  method: 'STRIPE',
  transactionId: paymentIntentId,
  failedReason: null,
});

const persistPreparedPaymentIntent = async ({
  db,
  bookingId,
  amountMinor,
  currency,
  paymentIntentId,
  expectedTransactionId = null,
}) => {
  const data = intentPaymentData({ amountMinor, currency, paymentIntentId });
  const persist = async (tx) => {
    // A provider call may race a cancellation or a capture. Revalidate under
    // the same Payment -> Booking lock order used by capture/refund flows.
    const identity = await tx.payment.findUnique({ where: { bookingId }, select: { id: true } });
    if (typeof tx.$queryRaw === 'function') {
      if (identity) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${identity.id} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`);
    }
    const current = await tx.payment.findUnique({ where: { bookingId } });
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
    if (!isBookingPayable(booking)) return { blocked: true, reason: 'BOOKING_NOT_PAYABLE', payment: current };
    if (current?.status === 'COMPLETED') return { completed: true, payment: current };
    if (current && !PREPARABLE_PAYMENT_STATUSES.includes(current.status)) {
      return { blocked: true, reason: 'PAYMENT_NOT_PREPARABLE', payment: current };
    }
    if (current?.transactionId === paymentIntentId) return { completed: false, payment: current };
    if (current && (current.transactionId || null) !== expectedTransactionId) {
      return { blocked: true, reason: 'PAYMENT_INTENT_CHANGED', payment: current };
    }
    if (!current && expectedTransactionId) {
      return { blocked: true, reason: 'PAYMENT_RECORD_CHANGED', payment: null };
    }
    if (current) {
      const updated = await tx.payment.updateMany({
        where: { bookingId, transactionId: expectedTransactionId, status: { in: PREPARABLE_PAYMENT_STATUSES } }, data,
      });
      if (updated.count === 1) return { completed: false };
      const winner = await tx.payment.findUnique({ where: { bookingId } });
      if (winner?.status === 'COMPLETED') return { completed: true, payment: winner };
      if (winner?.transactionId === paymentIntentId && PREPARABLE_PAYMENT_STATUSES.includes(winner.status)) {
        return { completed: false, payment: winner };
      }
      return { blocked: true, reason: 'PAYMENT_INTENT_CHANGED', payment: winner };
    }

    // createMany(skipDuplicates) avoids leaving an interactive PostgreSQL
    // transaction aborted if a legacy writer wins the unique bookingId race.
    const created = await tx.payment.createMany({ data: [{ bookingId, ...data }], skipDuplicates: true });
    if (created.count === 1) return { completed: false };
    const winner = await tx.payment.findUnique({ where: { bookingId } });
    if (winner?.status === 'COMPLETED') return { completed: true, payment: winner };
    if (!winner || !PREPARABLE_PAYMENT_STATUSES.includes(winner.status)) {
      return { blocked: true, reason: 'PAYMENT_NOT_PREPARABLE', payment: winner };
    }
    if (winner.transactionId === paymentIntentId) return { completed: false, payment: winner };
    if ((winner.transactionId || null) !== expectedTransactionId) {
      return { blocked: true, reason: 'PAYMENT_INTENT_CHANGED', payment: winner };
    }
    const retry = await tx.payment.updateMany({
      where: { bookingId, transactionId: expectedTransactionId, status: { in: PREPARABLE_PAYMENT_STATUSES } }, data,
    });
    if (retry.count === 1) return { completed: false };
    throw Object.assign(new Error('Payment intent preparation lost a concurrent state transition.'), {
      code: 'PAYMENT_INTENT_CONFLICT', statusCode: 409,
    });
  };
  return typeof db.$transaction === 'function' ? db.$transaction(persist) : persist(db);
};

module.exports = { intentPaymentData, isBookingPayable, persistPreparedPaymentIntent };
