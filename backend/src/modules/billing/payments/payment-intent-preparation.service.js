const isUniqueConflict = (error) => error?.code === 'P2002';

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
}) => {
  const data = intentPaymentData({ amountMinor, currency, paymentIntentId });
  const updated = await db.payment.updateMany({
    where: { bookingId, status: { not: 'COMPLETED' } },
    data,
  });
  if (updated.count === 1) return { completed: false };

  const current = await db.payment.findUnique({ where: { bookingId } });
  if (current) return { completed: current.status === 'COMPLETED', payment: current };

  try {
    const payment = await db.payment.create({ data: { bookingId, ...data } });
    return { completed: false, payment };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const retry = await db.payment.updateMany({
      where: { bookingId, status: { not: 'COMPLETED' } },
      data,
    });
    if (retry.count === 1) return { completed: false };
    const winner = await db.payment.findUnique({ where: { bookingId } });
    if (winner?.status === 'COMPLETED') return { completed: true, payment: winner };
    throw error;
  }
};

module.exports = { intentPaymentData, persistPreparedPaymentIntent };
