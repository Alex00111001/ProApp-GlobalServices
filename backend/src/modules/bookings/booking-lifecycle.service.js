const BOOKING_TRANSITIONS = Object.freeze({
  CONFIRM: Object.freeze({ from: 'PENDING', to: 'CONFIRMED' }),
  REJECT: Object.freeze({ from: 'PENDING', to: 'CANCELLED' }),
  START: Object.freeze({ from: 'CONFIRMED', to: 'IN_PROGRESS' }),
  COMPLETE: Object.freeze({ from: 'IN_PROGRESS', to: 'COMPLETED' }),
  // Preserve the supported runtime rule, including historical NO_SHOW data.
  CANCEL: Object.freeze({ from: Object.freeze(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'NO_SHOW']), to: 'CANCELLED' }),
});

const assertBookingPaymentSettled = (payment) => {
  if (payment?.method === 'CASH') {
    throw Object.assign(new Error('Historical cash payments cannot authorize booking completion.'), {
      code: 'CASH_PAYMENT_DISABLED', statusCode: 409,
    });
  }
  if (!payment || payment.status !== 'COMPLETED') {
    throw Object.assign(new Error('Booking cannot be completed until its payment is settled.'), {
      code: 'BOOKING_PAYMENT_NOT_SETTLED',
      statusCode: 409,
    });
  }
  return payment;
};

const assertBookingCompletionFinanciallyReady = ({ payment, activeRefund }) => {
  assertBookingPaymentSettled(payment);
  if (activeRefund) {
    throw Object.assign(new Error('Booking cannot be completed while a refund is pending.'), {
      code: 'BOOKING_REFUND_IN_PROGRESS', statusCode: 409,
    });
  }
  return payment;
};

const claimBookingTransition = async ({ tx, bookingId, transition, data = {}, include, isDuplicate }) => {
  const rule = BOOKING_TRANSITIONS[transition];
  if (!rule) throw new TypeError('Unknown booking transition');

  const claimed = await tx.booking.updateMany({
    where: { id: bookingId, status: Array.isArray(rule.from) ? { in: rule.from } : rule.from },
    data: { ...data, status: rule.to },
  });
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, ...(include ? { include } : {}) });
  if (claimed.count === 1) return { booking, duplicate: false, from: rule.from, to: rule.to };
  if (booking?.status === rule.to && (!isDuplicate || await isDuplicate(booking))) {
    return { booking, duplicate: true, from: rule.from, to: rule.to };
  }

  throw Object.assign(new Error(`Booking cannot transition from ${booking?.status || 'UNKNOWN'} to ${rule.to}.`), {
    code: 'BOOKING_TRANSITION_CONFLICT',
    statusCode: 409,
    currentStatus: booking?.status || null,
    expectedStatus: rule.from,
    targetStatus: rule.to,
  });
};

module.exports = { BOOKING_TRANSITIONS, assertBookingPaymentSettled, assertBookingCompletionFinanciallyReady, claimBookingTransition };
