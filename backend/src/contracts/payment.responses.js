const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { dateTime, pagination } = require('./shared.responses');

// Customer payment contracts intentionally use a narrow booking view.  They do
// not inherit the Prisma Booking shape, pricing-policy metadata, provider IDs,
// contact details, precise coordinates, or ledger/audit relations.
const uuid = z.string().uuid();
const money = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/);
const bookingStatus = z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
const paymentStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED']);
const paymentMethod = z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'STRIPE']);

const professionalSummary = outputObject({
  id: uuid,
  user: outputObject({ id: uuid, firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable() }),
});
const serviceSummary = outputObject({ id: uuid, name: z.string() });
const bookingServiceSummary = outputObject({
  id: uuid, serviceId: uuid, quantity: z.number().int().positive(), price: money, subtotal: money,
  service: serviceSummary,
});
const paymentSummary = outputObject({
  id: uuid, bookingId: uuid, amount: money, currency: z.string().min(3).max(3), status: paymentStatus,
  method: paymentMethod, processedAt: dateTime.nullable(), refundedAt: dateTime.nullable(), refundAmount: money.nullable(),
  createdAt: dateTime, updatedAt: dateTime,
});
const customerBookingSummary = outputObject({
  id: uuid, professionalId: uuid.nullable(), status: bookingStatus, scheduledDate: dateTime, endDate: dateTime,
  address: z.string(), city: z.string(), state: z.string(), postalCode: z.string(), notes: z.string().nullable(),
  totalPrice: money, serviceAmount: money, platformFee: money, professionalEarnings: money, currency: z.string().min(3).max(3),
  cancelledBy: z.string().nullable(), cancellationReason: z.string().nullable(), cancelledAt: dateTime.nullable(), completedAt: dateTime.nullable(),
  createdAt: dateTime, updatedAt: dateTime,
  professional: professionalSummary.nullable(), bookingServices: z.array(bookingServiceSummary), payment: paymentSummary.nullable(),
});

const json = (value) => JSON.parse(JSON.stringify(value));
const pickPayment = (value) => json({
  id: value.id, bookingId: value.bookingId, amount: value.amount, currency: value.currency, status: value.status,
  method: value.method, processedAt: value.processedAt, refundedAt: value.refundedAt, refundAmount: value.refundAmount,
  createdAt: value.createdAt, updatedAt: value.updatedAt,
});
const pickBookingService = (value) => ({
  id: value.id, serviceId: value.serviceId, quantity: value.quantity, price: value.price, subtotal: value.subtotal,
  service: { id: value.service?.id, name: value.service?.name },
});
const pickCustomerBooking = (value) => json({
  id: value.id, professionalId: value.professionalId, status: value.status, scheduledDate: value.scheduledDate, endDate: value.endDate,
  address: value.address, city: value.city, state: value.state, postalCode: value.postalCode, notes: value.notes,
  totalPrice: value.totalPrice, serviceAmount: value.serviceAmount, platformFee: value.platformFee,
  professionalEarnings: value.professionalEarnings, currency: value.currency, cancelledBy: value.cancelledBy,
  cancellationReason: value.cancellationReason, cancelledAt: value.cancelledAt, completedAt: value.completedAt,
  createdAt: value.createdAt, updatedAt: value.updatedAt,
  professional: value.professional ? { id: value.professional.id, user: {
    id: value.professional.user?.id, firstName: value.professional.user?.firstName,
    lastName: value.professional.user?.lastName, avatarUrl: value.professional.user?.avatarUrl,
  } } : null,
  bookingServices: (value.bookingServices || []).map(pickBookingService),
  payment: value.payment ? pickPayment(value.payment) : null,
});

const paymentResponses = Object.freeze({
  createIntent: defineResponseContract({
    method: 'POST', path: '/api/payments/create-intent', operationId: 'payments.createIntent',
    responses: { 200: serialized(outputObject({
      success: z.literal(true), clientSecret: z.string().min(1), paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]+$/),
      amount: z.number().int().positive(), currency: z.string().min(3).max(3),
    }), (value) => ({ success: value.success, clientSecret: value.clientSecret, paymentIntentId: value.paymentIntentId, amount: value.amount, currency: value.currency })) },
  }),
  confirm: defineResponseContract({
    method: 'POST', path: '/api/payments/confirm', operationId: 'payments.confirm',
    responses: { 200: serialized(outputObject({
      success: z.literal(true), payment: paymentSummary, booking: customerBookingSummary, duplicate: z.boolean(), message: z.string(),
    }), (value) => ({ success: value.success, payment: pickPayment(value.payment), booking: pickCustomerBooking(value.booking), duplicate: value.duplicate, message: value.message })) },
  }),
  history: defineResponseContract({
    method: 'GET', path: '/api/payments/history', operationId: 'payments.history',
    responses: { 200: serialized(outputObject({
      success: z.literal(true), payments: z.array(paymentSummary.extend({ booking: customerBookingSummary.omit({ payment: true }) })), pagination,
    }), (value) => ({
      success: value.success,
      payments: (value.payments || []).map((payment) => ({ ...pickPayment(payment), booking: pickCustomerBooking(payment.booking) })),
      pagination: value.pagination,
    })) },
  }),
});

module.exports = { paymentResponses, paymentSchemas: { customerBookingSummary, paymentSummary } };
