const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { adminListResponse, dateTime } = require('./shared.responses');

const maskedUser = {
  id: z.string(), firstName: z.string(), lastName: z.string(),
  isActive: z.boolean(), countryCode: z.string(), emailMasked: z.string(),
};
const count = z.number().int().nonnegative();
const bookingSummary = outputObject({
  id: z.string(), status: z.string(), scheduledDate: dateTime,
  totalPrice: z.string(), currency: z.string(), createdAt: dateTime,
  clientName: z.string(), professionalName: z.string().nullable(),
});
const dashboardMetrics = {
  activeUsers: count, activeProfessionals: count, requests: count, bookings: count, completedServices: count,
  gmv: z.string(), grossPlatformRevenue: z.string(), netPlatformRevenue: z.string(),
  platformFees: z.string(), professionalCommissions: z.string(), refunds: z.string(), takeRate: z.string(),
};
const dashboardMetricDefinition = outputObject({
  label: z.string(), unit: z.enum(['count', 'money', 'percentage']), source: z.string(), description: z.string(),
});
// Offset normalization and default ranges can cross a four-digit year boundary.
const dashboardRangeDate = z.union([dateTime, z.string().regex(/^[+-]\d{6}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)]);

const adminDirectoryResponses = Object.freeze({
  roles: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/roles', operationId: 'adminDirectory.roles',
    responses: { 200: outputObject({
      roles: z.array(outputObject({
        id: z.string(), key: z.string(), name: z.string(), description: z.string().nullable(), isSystem: z.boolean(),
        permissions: z.array(outputObject({
          permission: outputObject({ id: z.string(), key: z.string(), description: z.string().nullable() }),
        })),
        _count: outputObject({ assignments: count }),
      })),
    }) },
  }),
  dashboard: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/dashboard', operationId: 'adminDirectory.dashboard',
    responses: { 200: serialized(outputObject({
      range: outputObject({ from: dashboardRangeDate, to: dashboardRangeDate, timezone: z.string(), currency: z.string() }),
      generatedAt: dateTime,
      freshness: outputObject({
        latestBookingUpdateAt: dateTime.nullable(), latestPaymentUpdateAt: dateTime.nullable(), partialData: z.boolean(),
      }),
      metrics: outputObject(dashboardMetrics),
      definitions: z.record(z.string(), dashboardMetricDefinition),
      bookingsByStatus: z.array(outputObject({ status: z.string(), count })),
      recentBookings: z.array(bookingSummary),
    })) },
  }),
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
    responses: { 200: serialized(adminListResponse(bookingSummary.extend({
      city: z.string(), updatedAt: dateTime,
      payment: outputObject({ status: z.string() }).nullable(),
    }))) },
  }),
});

module.exports = { adminDirectoryResponses };
