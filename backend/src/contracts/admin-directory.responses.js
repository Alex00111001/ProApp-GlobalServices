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
const extendedDateTime = z.union([dateTime, z.string().regex(/^[+-]\d{6}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)]);
const roleChangePerson = { id: z.string(), firstName: z.string(), lastName: z.string() };
const roleChange = outputObject({
  id: z.string(), targetUserId: z.string(), roleId: z.string(),
  action: z.enum(['GRANT', 'REVOKE']), status: z.enum(['REQUESTED', 'EXECUTED', 'REJECTED', 'CANCELLED']),
  reason: z.string(),
  requestedById: z.string(), requestedAt: dateTime,
  reviewedById: z.string().nullable(), reviewedAt: dateTime.nullable(), decisionReason: z.string().nullable(),
  executedAt: dateTime.nullable(), createdAt: dateTime, updatedAt: dateTime,
  role: outputObject({ id: z.string(), key: z.string(), name: z.string() }),
  targetUser: outputObject({ ...roleChangePerson, emailMasked: z.string() }),
  requestedBy: outputObject(roleChangePerson), reviewedBy: outputObject(roleChangePerson).nullable(),
});
const roleChangeResult = serialized(outputObject({ request: roleChange }));
const bookingContact = outputObject({ ...roleChangePerson, email: z.string(), phone: z.string() });
const bookingFinancialStatus = { id: z.string(), status: z.string(), currency: z.string(), processedAt: dateTime.nullable() };
const bookingDetail = outputObject({
  id: z.string(), clientId: z.string(), professionalId: z.string().nullable(), status: z.string(),
  scheduledDate: extendedDateTime, endDate: extendedDateTime.nullable(),
  address: z.string(), city: z.string(), state: z.string(), postalCode: z.string(),
  latitude: z.number().nullable(), longitude: z.number().nullable(), notes: z.string().nullable(),
  totalPrice: z.string(), serviceAmount: z.string(), platformFee: z.string(), platformFeeState: z.string(),
  professionalCommission: z.string(), professionalEarnings: z.string(), currency: z.string(),
  pricingSnapshot: z.json().nullable(), pricingPolicyId: z.string().nullable(), marketId: z.string().nullable(), addressId: z.string().nullable(),
  cancelledBy: z.string().nullable(), cancellationReason: z.string().nullable(), cancelledAt: dateTime.nullable(), completedAt: dateTime.nullable(),
  createdAt: dateTime, updatedAt: dateTime,
  client: outputObject({ user: bookingContact }),
  professional: outputObject({ id: z.string(), status: z.string(), user: bookingContact }).nullable(),
  bookingServices: z.array(outputObject({
    id: z.string(), bookingId: z.string(), serviceId: z.string(), quantity: z.number().int(),
    price: z.string(), subtotal: z.string(), createdAt: dateTime,
    service: outputObject({ id: z.string(), name: z.string() }),
  })),
  payment: outputObject({ ...bookingFinancialStatus, method: z.string(), amount: z.string() }).nullable(),
  refunds: z.array(outputObject({ ...bookingFinancialStatus, totalAmount: z.string(), requestedAt: dateTime })),
  payout: outputObject({ ...bookingFinancialStatus, amount: z.string(), requestedAt: dateTime }).nullable(),
});

const adminDirectoryResponses = Object.freeze({
  bookingDetail: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/bookings/{id}', operationId: 'adminDirectory.bookingDetail',
    responses: { 200: {
      ...serialized(outputObject({ booking: bookingDetail })),
      finalizeJson: (parsed, source) => ({
        booking: {
          ...parsed.booking,
          // Zod drops own __proto__ members from arbitrary JSON objects.
          pricingSnapshot: source.booking.pricingSnapshot,
        },
      }),
    } },
  }),
  professionalDetail: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/professionals/{id}', operationId: 'adminDirectory.professionalDetail',
    responses: { 200: serialized(outputObject({
      professional: outputObject({
        id: z.string(), status: z.string(), bio: z.string().nullable(), yearsOfExperience: z.number().int().nullable(),
        hourlyRate: z.string().nullable(), serviceRadius: z.number().int().nullable(),
        totalBookings: z.number().int(), totalEarnings: z.string(), averageRating: z.number(), totalReviews: z.number().int(),
        verifiedAt: dateTime.nullable(), rejectedReason: z.string().nullable(), createdAt: dateTime, updatedAt: dateTime,
        stripeTransfersStatus: z.string().nullable(),
        user: outputObject({
          ...roleChangePerson, email: z.string(), phone: z.string(), isActive: z.boolean(), countryCode: z.string(),
        }),
        documents: z.array(outputObject({
          id: z.string(), type: z.string(), status: z.string(), reviewedAt: dateTime.nullable(),
          rejectionReason: z.string().nullable(), expiresAt: dateTime.nullable(), createdAt: dateTime,
        })),
        categories: z.array(outputObject({
          verified: z.boolean(), yearsInCategory: z.number().int().nullable(),
          category: outputObject({ id: z.string(), name: z.string() }),
        })),
      }),
    })) },
  }),
  userDetail: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/users/{id}', operationId: 'adminDirectory.userDetail',
    responses: { 200: serialized(outputObject({
      user: outputObject({
        ...roleChangePerson, email: z.string(), phone: z.string(), avatarUrl: z.string().nullable(),
        role: z.string(), isActive: z.boolean(), countryCode: z.string(),
        createdAt: dateTime, updatedAt: dateTime, lastLoginAt: dateTime.nullable(),
        clientProfile: outputObject({
          city: z.string().nullable(), state: z.string().nullable(), country: z.string(), postalCode: z.string().nullable(),
          totalBookings: z.number().int(), totalSpent: z.string(),
        }).nullable(),
        professionalProfile: outputObject({
          id: z.string(), status: z.string(), totalBookings: z.number().int(),
          averageRating: z.number(), totalReviews: z.number().int(), createdAt: dateTime,
        }).nullable(),
        roles: z.array(outputObject({ id: z.string(), key: z.string(), name: z.string() })),
      }),
    })) },
  }),
  userStatus: defineResponseContract({
    method: 'PATCH', path: '/api/v1/admin/users/{id}/status', operationId: 'adminDirectory.userStatus',
    responses: { 200: serialized(outputObject({
      user: outputObject({ id: z.string(), isActive: z.boolean(), updatedAt: dateTime }),
    })) },
  }),
  professionalStatus: defineResponseContract({
    method: 'PATCH', path: '/api/v1/admin/professionals/{id}/status', operationId: 'adminDirectory.professionalStatus',
    responses: { 200: serialized(outputObject({
      professional: outputObject({
        id: z.string(), status: z.string(), verifiedAt: dateTime.nullable(),
        rejectedReason: z.string().nullable(), updatedAt: dateTime.optional(),
      }),
    })) },
  }),
  roleChangeRequests: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/role-change-requests', operationId: 'adminDirectory.roleChangeRequests',
    responses: { 200: serialized(outputObject({ requests: z.array(roleChange) })) },
  }),
  requestRoleChange: defineResponseContract({
    method: 'POST', path: '/api/v1/admin/role-change-requests', operationId: 'adminDirectory.requestRoleChange',
    responses: { 201: roleChangeResult },
  }),
  approveRoleChange: defineResponseContract({
    method: 'POST', path: '/api/v1/admin/role-change-requests/{id}/approve', operationId: 'adminDirectory.approveRoleChange',
    responses: { 200: roleChangeResult },
  }),
  rejectRoleChange: defineResponseContract({
    method: 'POST', path: '/api/v1/admin/role-change-requests/{id}/reject', operationId: 'adminDirectory.rejectRoleChange',
    responses: { 200: roleChangeResult },
  }),
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
      range: outputObject({ from: extendedDateTime, to: extendedDateTime, timezone: z.string(), currency: z.string() }),
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
