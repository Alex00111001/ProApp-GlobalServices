const PUBLIC_USER_SELECT = Object.freeze({
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
});

const BOOKING_CONTACT_USER_SELECT = Object.freeze({
  ...PUBLIC_USER_SELECT,
  phone: true,
});

const BOOKING_PARTY_SELECT = Object.freeze({
  id: true,
  userId: true,
  user: { select: BOOKING_CONTACT_USER_SELECT },
});

const BOOKING_PROFESSIONAL_SELECT = Object.freeze({
  id: true,
  userId: true,
  status: true,
  averageRating: true,
  user: { select: BOOKING_CONTACT_USER_SELECT },
});

const BOOKING_PAYMENT_SELECT = Object.freeze({
  id: true,
  bookingId: true,
  amount: true,
  currency: true,
  status: true,
  method: true,
  processedAt: true,
  refundedAt: true,
  refundAmount: true,
  createdAt: true,
  updatedAt: true,
});

const BOOKING_REVIEW_SELECT = Object.freeze({
  id: true,
  bookingId: true,
  clientId: true,
  professionalId: true,
  rating: true,
  comment: true,
  response: true,
  responseAt: true,
  isVisible: true,
  createdAt: true,
  updatedAt: true,
});

const BOOKING_READ_INCLUDE = Object.freeze({
  client: { select: BOOKING_PARTY_SELECT },
  professional: { select: BOOKING_PROFESSIONAL_SELECT },
  bookingServices: {
    include: { service: { include: { category: true, subcategory: true } } },
  },
  payment: { select: BOOKING_PAYMENT_SELECT },
  review: { select: BOOKING_REVIEW_SELECT },
});

const PAYMENT_HISTORY_SELECT = Object.freeze({
  ...BOOKING_PAYMENT_SELECT,
  booking: {
    select: {
      id: true,
      status: true,
      scheduledDate: true,
      endDate: true,
      totalPrice: true,
      serviceAmount: true,
      platformFee: true,
      professionalEarnings: true,
      currency: true,
      professional: { select: BOOKING_PROFESSIONAL_SELECT },
      bookingServices: { include: { service: true } },
    },
  },
});

module.exports = {
  BOOKING_CONTACT_USER_SELECT,
  BOOKING_PAYMENT_SELECT,
  BOOKING_READ_INCLUDE,
  PAYMENT_HISTORY_SELECT,
  PUBLIC_USER_SELECT,
};
