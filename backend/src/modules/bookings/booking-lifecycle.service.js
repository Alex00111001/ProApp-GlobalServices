const BOOKING_TRANSITIONS = Object.freeze({
  CONFIRM: Object.freeze({ from: 'PENDING', to: 'CONFIRMED' }),
  REJECT: Object.freeze({ from: 'PENDING', to: 'CANCELLED' }),
  START: Object.freeze({ from: 'CONFIRMED', to: 'IN_PROGRESS' }),
  COMPLETE: Object.freeze({ from: 'IN_PROGRESS', to: 'COMPLETED' }),
});

const assertBookingPaymentSettled = (payment) => {
  if (!payment || payment.status !== 'COMPLETED') {
    throw Object.assign(new Error('Booking cannot be completed until its payment is settled.'), {
      code: 'BOOKING_PAYMENT_NOT_SETTLED',
      statusCode: 409,
    });
  }
  return payment;
};

const claimBookingTransition = async ({ tx, bookingId, transition, data = {}, include, isDuplicate }) => {
  const rule = BOOKING_TRANSITIONS[transition];
  if (!rule) throw new TypeError('Unknown booking transition');

  const claimed = await tx.booking.updateMany({
    where: { id: bookingId, status: rule.from },
    data: { ...data, status: rule.to },
  });
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, ...(include ? { include } : {}) });
  if (claimed.count === 1) return { booking, duplicate: false, from: rule.from, to: rule.to };
  if (booking?.status === rule.to && (!isDuplicate || isDuplicate(booking))) {
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

module.exports = { BOOKING_TRANSITIONS, assertBookingPaymentSettled, claimBookingTransition };
