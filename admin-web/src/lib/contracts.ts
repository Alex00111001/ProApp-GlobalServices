import { z } from 'zod'

export const adminUserSchema = z.object({
  id: z.string(), email: z.string().email(), firstName: z.string(), lastName: z.string(),
  avatarUrl: z.string().nullable().optional(), role: z.string(), isActive: z.boolean(), countryCode: z.string(),
})
export const roleSchema = z.object({ id: z.string(), key: z.string(), name: z.string() })
export const sessionResponseSchema = z.object({
  accessToken: z.string().min(20), csrfToken: z.string().min(20), accessTokenExpiresInSeconds: z.number().int().positive(),
  session: z.object({ id: z.string(), expiresAt: z.coerce.date() }), user: adminUserSchema,
  roles: z.array(roleSchema), permissions: z.array(z.string()),
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>

export const paginationSchema = z.object({ page: z.number(), limit: z.number(), totalItems: z.number(), totalPages: z.number() })
export type Pagination = z.infer<typeof paginationSchema>
const metricDefinitionSchema = z.object({ label: z.string(), unit: z.enum(['count', 'money', 'percentage']), source: z.string(), description: z.string() })
export const dashboardSchema = z.object({
  range: z.object({ from: z.string(), to: z.string(), timezone: z.string(), currency: z.string() }), generatedAt: z.string(),
  freshness: z.object({ latestBookingUpdateAt: z.string().nullable(), latestPaymentUpdateAt: z.string().nullable(), partialData: z.boolean() }),
  metrics: z.record(z.string(), z.union([z.number(), z.string()])), definitions: z.record(z.string(), metricDefinitionSchema),
  bookingsByStatus: z.array(z.object({ status: z.string(), count: z.number() })),
  recentBookings: z.array(z.object({ id: z.string(), status: z.string(), scheduledDate: z.string(), totalPrice: z.string(), currency: z.string(), clientName: z.string(), professionalName: z.string().nullable(), createdAt: z.string() }).passthrough()),
})
export type Dashboard = z.infer<typeof dashboardSchema>

export const userListSchema = z.object({
  items: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), role: z.string(), isActive: z.boolean(), countryCode: z.string(), emailMasked: z.string(), phoneMasked: z.string().nullable(), createdAt: z.string(), lastLoginAt: z.string().nullable(), professionalProfile: z.object({ status: z.string() }).nullable() })),
  pagination: paginationSchema,
})
export type UserList = z.infer<typeof userListSchema>
export const professionalListSchema = z.object({
  items: z.array(z.object({ id: z.string(), status: z.string(), yearsOfExperience: z.number().nullable(), totalBookings: z.number(), averageRating: z.number(), totalReviews: z.number(), createdAt: z.string(), verifiedAt: z.string().nullable(), user: z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), isActive: z.boolean(), countryCode: z.string(), emailMasked: z.string() }), _count: z.object({ documents: z.number(), categories: z.number(), services: z.number() }) })),
  pagination: paginationSchema,
})
export type ProfessionalList = z.infer<typeof professionalListSchema>
export const bookingListSchema = z.object({
  items: z.array(z.object({ id: z.string(), status: z.string(), scheduledDate: z.string(), city: z.string(), totalPrice: z.string(), currency: z.string(), createdAt: z.string(), updatedAt: z.string(), clientName: z.string(), professionalName: z.string().nullable(), payment: z.object({ status: z.string() }).nullable() })),
  pagination: paginationSchema,
})
export type BookingList = z.infer<typeof bookingListSchema>
export const auditListSchema = z.object({
  items: z.array(z.object({ id: z.string(), action: z.string(), resourceType: z.string(), resourceId: z.string().nullable(), outcome: z.string(), reason: z.string().nullable(), requestId: z.string().nullable(), correlationId: z.string().nullable(), traceId: z.string().nullable(), metadata: z.unknown().nullable(), createdAt: z.string(), actor: z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), emailMasked: z.string() }).nullable() })),
  pagination: paginationSchema,
})
export type AuditList = z.infer<typeof auditListSchema>
export const sessionsSchema = z.object({ sessions: z.array(z.object({ id: z.string(), status: z.string(), expiresAt: z.string(), lastSeenAt: z.string(), revokedAt: z.string().nullable(), revocationReason: z.string().nullable(), createdAt: z.string(), current: z.boolean() })) })
export const rolesSchema = z.object({ roles: z.array(z.object({ id: z.string(), key: z.string(), name: z.string(), description: z.string().nullable(), isSystem: z.boolean(), permissions: z.array(z.object({ permission: z.object({ id: z.string(), key: z.string(), description: z.string().nullable() }) })), _count: z.object({ assignments: z.number() }) })) })
export const roleChangeRequestsSchema = z.object({ requests: z.array(z.object({
  id: z.string(), targetUserId: z.string(), roleId: z.string(), action: z.string(), status: z.string(), reason: z.string(), requestedAt: z.string(),
  role: roleSchema, targetUser: z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), emailMasked: z.string() }),
  requestedBy: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }),
  reviewedBy: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
})) })
