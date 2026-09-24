const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { dateTime } = require('./shared.responses');

const uuid = z.string().uuid();
const money = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/);
const status = z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
const paymentStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED']);
// CASH remains readable only as historical evidence; the retired payment route cannot create it.
const paymentMethod = z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'STRIPE', 'CASH']);

const userSummary = outputObject({
  id: uuid, firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable(),
});
const serviceSummary = outputObject({ id: uuid, name: z.string(), description: z.string().nullable() });
const bookingService = outputObject({
  id: uuid, serviceId: uuid, quantity: z.number().int().positive(), price: money, subtotal: money,
  service: serviceSummary,
});
const bookingBase = outputObject({
  id: uuid, status, scheduledDate: dateTime, endDate: dateTime,
  address: z.string(), city: z.string(), state: z.string(), postalCode: z.string(), notes: z.string().nullable(),
  totalPrice: money, currency: z.string().length(3), createdAt: dateTime, updatedAt: dateTime,
  bookingServices: z.array(bookingService),
});
const customerBooking = bookingBase.extend({
  professional: outputObject({ id: uuid, averageRating: z.number(), user: userSummary }).nullable(),
  platformFee: money,
  payment: outputObject({ id: uuid, amount: money, currency: z.string().length(3), status: paymentStatus, method: paymentMethod }).nullable(),
  review: outputObject({ id: uuid }).nullable(),
});
const professionalBooking = bookingBase.extend({
  professionalEarnings: money,
  client: outputObject({ id: uuid, user: userSummary }),
});
const pagination = outputObject({
  currentPage: z.number().int().min(1), totalPages: z.number().int().min(0), totalItems: z.number().int().min(0),
});

const pickBase = (booking) => ({
  id: booking.id, status: booking.status, scheduledDate: booking.scheduledDate, endDate: booking.endDate,
  address: booking.address, city: booking.city, state: booking.state, postalCode: booking.postalCode,
  notes: booking.notes, totalPrice: booking.totalPrice, currency: booking.currency,
  createdAt: booking.createdAt, updatedAt: booking.updatedAt,
  bookingServices: (booking.bookingServices || []).map((entry) => ({
    id: entry.id, serviceId: entry.serviceId, quantity: entry.quantity, price: entry.price, subtotal: entry.subtotal,
    service: { id: entry.service?.id, name: entry.service?.name, description: entry.service?.description },
  })),
});
const pickUser = (user) => ({
  id: user?.id, firstName: user?.firstName, lastName: user?.lastName, avatarUrl: user?.avatarUrl,
});
const toWire = (value) => JSON.parse(JSON.stringify(value));
const pickCustomerBooking = (booking) => toWire({
  ...pickBase(booking), platformFee: booking.platformFee,
  professional: booking.professional ? {
    id: booking.professional.id, averageRating: booking.professional.averageRating,
    user: pickUser(booking.professional.user),
  } : null,
  payment: booking.payment ? {
    id: booking.payment.id, amount: booking.payment.amount, currency: booking.payment.currency,
    status: booking.payment.status, method: booking.payment.method,
  } : null,
  review: booking.review ? { id: booking.review.id } : null,
});
const pickProfessionalBooking = (booking) => toWire({
  ...pickBase(booking), professionalEarnings: booking.professionalEarnings,
  client: { id: booking.client?.id, user: pickUser(booking.client?.user) },
});

const bookingResponses = Object.freeze({
  detail: defineResponseContract({
    method: 'GET', path: '/api/bookings/{id}', operationId: 'bookings.detail',
    responses: { 200: serialized(outputObject({ booking: z.union([customerBooking, professionalBooking]) }), (body, req) => ({
      booking: req.user?.role === 'CLIENT' ? pickCustomerBooking(body.booking)
        : req.user?.role === 'PROFESSIONAL' ? pickProfessionalBooking(body.booking) : undefined,
    })) },
  }),
  customerList: defineResponseContract({
    method: 'GET', path: '/api/bookings/client/my-bookings', operationId: 'bookings.customerList',
    responses: { 200: serialized(outputObject({ bookings: z.array(customerBooking), pagination }), (body) => ({
      bookings: body.bookings.map(pickCustomerBooking), pagination: body.pagination,
    })) },
  }),
  professionalList: defineResponseContract({
    method: 'GET', path: '/api/bookings/professional/my-bookings', operationId: 'bookings.professionalList',
    responses: { 200: serialized(outputObject({ bookings: z.array(professionalBooking), pagination }), (body) => ({
      bookings: body.bookings.map(pickProfessionalBooking), pagination: body.pagination,
    })) },
  }),
});

module.exports = { bookingResponses, bookingSchemas: { customerBooking, professionalBooking } };
