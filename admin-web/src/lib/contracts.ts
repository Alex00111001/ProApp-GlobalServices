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

const healthDependencySchema = z.object({ service: z.string(), status: z.string(), latencyMs: z.number(), message: z.string().optional() })
export const operationsOverviewSchema = z.object({
  generatedAt: z.string(),
  health: z.object({ status: z.string(), checkedAt: z.string(), service: z.string(), dependencies: z.record(z.string(), healthDependencySchema) }),
  errors: z.record(z.string(), z.number()), incidents: z.record(z.string(), z.number()), jobs: z.record(z.string(), z.number()), integrations: z.record(z.string(), z.number()), support: z.record(z.string(), z.number()),
  financialAttention: z.object({
    failedRefunds: z.number(), failedPayouts: z.number(), activeDisputes: z.number(),
    latestReconciliation: z.object({ id: z.string(), status: z.string(), scope: z.string(), startedAt: z.string(), completedAt: z.string().nullable(), matchedCount: z.number(), mismatchCount: z.number(), errorCount: z.number() }).nullable(),
  }),
  freshness: z.object({ latestErrorAt: z.string().nullable(), latestIncidentAt: z.string().nullable(), partialData: z.boolean() }),
})
export type OperationsOverview = z.infer<typeof operationsOverviewSchema>

export const errorGroupListSchema = z.object({
  items: z.array(z.object({
    id: z.string(), fingerprint: z.string(), severity: z.string(), environment: z.string(), service: z.string(), module: z.string().nullable(), operation: z.string().nullable(), errorCode: z.string().nullable(), normalizedMessage: z.string(), status: z.string(), firstSeenAt: z.string(), lastSeenAt: z.string(), occurrenceCount: z.number(), windowStartedAt: z.string(), windowOccurrenceCount: z.number(), _count: z.object({ events: z.number(), incidents: z.number() }),
  })), pagination: paginationSchema,
})
export type ErrorGroupList = z.infer<typeof errorGroupListSchema>
export const errorGroupDetailSchema = z.object({ errorGroup: z.object({
  id: z.string(), fingerprint: z.string(), severity: z.string(), environment: z.string(), service: z.string(), module: z.string().nullable(), operation: z.string().nullable(), errorCode: z.string().nullable(), normalizedMessage: z.string(), status: z.string(), firstSeenAt: z.string(), lastSeenAt: z.string(), occurrenceCount: z.number(), windowStartedAt: z.string(), windowOccurrenceCount: z.number(),
  events: z.array(z.object({ id: z.string(), severity: z.string(), httpStatus: z.number().nullable(), endpoint: z.string().nullable(), method: z.string().nullable(), requestId: z.string().nullable(), correlationId: z.string().nullable(), traceId: z.string().nullable(), appVersion: z.string().nullable(), occurredAt: z.string() })),
  incidents: z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), severity: z.string(), detectedAt: z.string(), resolvedAt: z.string().nullable() })),
}) })

export const incidentListSchema = z.object({
  items: z.array(z.object({
    id: z.string(), title: z.string(), description: z.string().nullable(), status: z.string(), severity: z.string(), service: z.string().nullable(), detectedAt: z.string(), acknowledgedAt: z.string().nullable(), resolvedAt: z.string().nullable(), closedAt: z.string().nullable(), updatedAt: z.string(),
    errorGroup: z.object({ id: z.string(), fingerprint: z.string(), errorCode: z.string().nullable(), occurrenceCount: z.number() }).nullable(), _count: z.object({ events: z.number(), comments: z.number() }),
  })), pagination: paginationSchema,
})
export type IncidentList = z.infer<typeof incidentListSchema>
export const incidentDetailSchema = z.object({ incident: z.object({
  id: z.string(), title: z.string(), description: z.string().nullable(), status: z.string(), severity: z.string(), service: z.string().nullable(), detectedAt: z.string(), acknowledgedAt: z.string().nullable(), resolvedAt: z.string().nullable(), closedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
  errorGroup: z.object({ id: z.string(), fingerprint: z.string(), severity: z.string(), status: z.string(), errorCode: z.string().nullable(), normalizedMessage: z.string(), occurrenceCount: z.number(), lastSeenAt: z.string() }).nullable(),
  events: z.array(z.object({ id: z.string(), eventType: z.string(), message: z.string().nullable(), createdAt: z.string(), errorEventId: z.string().nullable() })),
  comments: z.array(z.object({ id: z.string(), body: z.string(), createdAt: z.string(), updatedAt: z.string(), author: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable() })),
}) })

export const healthSchema = z.object({ status: z.string(), checkedAt: z.string(), service: z.string(), dependencies: z.record(z.string(), healthDependencySchema) })
export const healthSnapshotsSchema = z.object({ items: z.array(z.object({ id: z.string(), service: z.string(), status: z.string(), latencyMs: z.number().nullable(), message: z.string().nullable(), checkedAt: z.string() })), pagination: paginationSchema })
const operationalItemBase = { id: z.string(), status: z.string(), attempts: z.number(), createdAt: z.string(), hasError: z.boolean() }
export const jobsSchema = z.object({ items: z.array(z.object({ ...operationalItemBase, aggregateType: z.string(), eventType: z.string(), availableAt: z.string(), lockedAt: z.string().nullable(), processedAt: z.string().nullable() })), pagination: paginationSchema })
export const integrationsSchema = z.object({ items: z.array(z.object({ ...operationalItemBase, provider: z.string(), eventType: z.string(), correlationId: z.string().nullable(), receivedAt: z.string(), processingStartedAt: z.string().nullable(), processedAt: z.string().nullable(), updatedAt: z.string() })), pagination: paginationSchema })
export const alertsSchema = z.object({ items: z.array(z.object({ ...operationalItemBase, aggregateId: z.string(), eventType: z.string(), route: z.string().nullable(), severity: z.string().nullable(), availableAt: z.string(), processedAt: z.string().nullable() })), pagination: paginationSchema })
const financialGroupSchema = z.object({ status: z.string(), currency: z.string(), count: z.number(), amount: z.string() })
export const financialMonitoringSchema = z.object({
  generatedAt: z.string(), readOnly: z.literal(true), refunds: z.array(financialGroupSchema), payouts: z.array(financialGroupSchema),
  disputes: z.array(financialGroupSchema.extend({ recoveredAmount: z.string() })),
  reconciliationRuns: z.array(z.object({ id: z.string(), status: z.string(), scope: z.string(), startedAt: z.string(), completedAt: z.string().nullable(), matchedCount: z.number(), mismatchCount: z.number(), errorCount: z.number() })),
})

const supportPersonSchema = z.object({ id: z.string(), firstName: z.string(), lastName: z.string() })
export const supportCaseListSchema = z.object({
  items: z.array(z.object({ id: z.string(), caseKey: z.string(), subject: z.string(), category: z.string(), priority: z.string(), status: z.string(), requesterUserId: z.string().nullable(), bookingId: z.string().nullable(), assignedTo: supportPersonSchema.nullable(), createdAt: z.string(), updatedAt: z.string(), _count: z.object({ comments: z.number(), events: z.number() }) })),
  pagination: paginationSchema,
})
export const supportCaseDetailSchema = z.object({ supportCase: z.object({
  id: z.string(), caseKey: z.string(), subject: z.string(), description: z.string(), category: z.string(), priority: z.string(), status: z.string(), requesterUserId: z.string().nullable(), bookingId: z.string().nullable(), resolvedAt: z.string().nullable(), closedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), requester: supportPersonSchema.extend({ isActive: z.boolean() }).nullable(), assignedTo: supportPersonSchema.nullable(), createdBy: supportPersonSchema,
  comments: z.array(z.object({ id: z.string(), body: z.string(), createdAt: z.string(), updatedAt: z.string(), author: supportPersonSchema })),
  events: z.array(z.object({ id: z.string(), eventType: z.string(), fromStatus: z.string().nullable(), toStatus: z.string().nullable(), message: z.string().nullable(), createdAt: z.string(), actor: supportPersonSchema.nullable() })),
}) })
export const supportOperatorsSchema = z.object({ operators: z.array(supportPersonSchema) })

const growthRangeSchema = z.object({ from: z.string(), to: z.string(), timezone: z.string(), campaignId: z.string().nullable(), countryCode: z.string().nullable() })
const growthDefinitionSchema = z.object({ label: z.string(), unit: z.literal('count'), source: z.string(), description: z.string() })
export const growthOverviewSchema = z.object({
  range: growthRangeSchema, generatedAt: z.string(),
  freshness: z.object({ latestEventReceivedAt: z.string().nullable(), partialData: z.boolean() }),
  metrics: z.object({ events: z.number(), leads: z.number(), conversions: z.number(), activeCampaigns: z.number() }),
  conversions: z.record(z.string(), z.number()), definitions: z.record(z.string(), growthDefinitionSchema),
})
export type GrowthOverview = z.infer<typeof growthOverviewSchema>
export const growthFunnelSchema = z.object({
  range: growthRangeSchema, generatedAt: z.string(), definition: z.string(),
  stages: z.array(z.object({ eventName: z.string(), key: z.string(), label: z.string(), occurrences: z.number(), subjects: z.number(), rateFromFirst: z.string(), rateFromPrevious: z.string() })),
})
export const campaignSchema = z.object({
  id: z.string(), key: z.string(), name: z.string(), status: z.string(), source: z.string(), medium: z.string().nullable(), channel: z.string().nullable(), countryCode: z.string().nullable(), startsAt: z.string().nullable(), endsAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
  _count: z.object({ events: z.number(), leads: z.number(), conversions: z.number() }),
})
export const campaignListSchema = z.object({ items: z.array(campaignSchema), pagination: paginationSchema })
export const leadListSchema = z.object({
  items: z.array(z.object({ id: z.string(), subjectType: z.string(), status: z.string(), source: z.string().nullable(), channel: z.string().nullable(), countryCode: z.string().nullable(), firstSeenAt: z.string(), lastSeenAt: z.string(), convertedAt: z.string().nullable(), identified: z.boolean(), campaign: z.object({ id: z.string(), key: z.string(), name: z.string() }).nullable(), _count: z.object({ events: z.number(), conversions: z.number() }) })),
  pagination: paginationSchema,
})
export const conversionListSchema = z.object({
  items: z.array(z.object({ id: z.string(), type: z.string(), occurredAt: z.string(), createdAt: z.string(), campaign: z.object({ id: z.string(), key: z.string(), name: z.string() }).nullable(), event: z.object({ id: z.string(), eventName: z.string(), correlationId: z.string().nullable() }), lead: z.object({ subjectType: z.string() }).nullable() })),
  pagination: paginationSchema,
})
