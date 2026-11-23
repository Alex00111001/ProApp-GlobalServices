const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { adminListResponse, dateTime } = require('./shared.responses');

const maskedUser = {
  id: z.string(), firstName: z.string(), lastName: z.string(),
  isActive: z.boolean(), countryCode: z.string(), emailMasked: z.string(),
};
const count = z.number().int().nonnegative();

const adminDirectoryResponses = Object.freeze({
  users: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/users', operationId: 'adminDirectory.users',
    responses: { 200: serialized(adminListResponse(outputObject({
      ...maskedUser, role: z.string(), phoneMasked: z.string().nullable(), createdAt: dateTime,
      lastLoginAt: dateTime.nullable(), professionalProfile: outputObject({ status: z.string() }).nullable(),
    }))) },
  }),
  professionals: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/professionals', operationId: 'adminDirectory.professionals',
    responses: { 200: serialized(adminListResponse(outputObject({
      id: z.string(), status: z.string(), yearsOfExperience: z.number().int().nullable(),
      totalBookings: z.number().int(), averageRating: z.number(), totalReviews: z.number().int(),
      createdAt: dateTime, verifiedAt: dateTime.nullable(),
      user: outputObject(maskedUser), _count: outputObject({ documents: count, categories: count, services: count }),
    }))) },
  }),
  bookings: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/bookings', operationId: 'adminDirectory.bookings',
    responses: { 200: serialized(adminListResponse(outputObject({
      id: z.string(), status: z.string(), scheduledDate: dateTime, city: z.string(),
      totalPrice: z.string(), currency: z.string(), createdAt: dateTime, updatedAt: dateTime,
      clientName: z.string(), professionalName: z.string().nullable(),
      payment: outputObject({ status: z.string() }).nullable(),
    }))) },
  }),
});

module.exports = { adminDirectoryResponses };
