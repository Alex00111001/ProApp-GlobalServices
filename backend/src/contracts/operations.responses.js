const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { adminListResponse, dateTime } = require('./shared.responses');

const count = z.number().int().nonnegative();
const countsByStatus = z.record(z.string(), count);
const healthStatus = z.enum(['HEALTHY', 'DEGRADED', 'OUTAGE']);
const dependencyHealth = outputObject({
  service: z.string(), status: healthStatus, latencyMs: z.number().int(), message: z.string().optional(),
});
const healthReportFields = {
  checkedAt: dateTime, service: z.string(),
  dependencies: outputObject({ database: dependencyHealth, outbox: dependencyHealth }),
};
const reconciliationSummary = outputObject({
  id: z.string(), status: z.string(), scope: z.string(),
  startedAt: dateTime, completedAt: dateTime.nullable(),
  matchedCount: count, mismatchCount: count, errorCount: count,
});
const financialGroup = outputObject({
  status: z.string(), currency: z.string(), count, amount: z.string(),
});
const overview = outputObject({
  generatedAt: dateTime,
  health: outputObject({
    ...healthReportFields, status: healthStatus,
  }),
  errors: countsByStatus,
  incidents: countsByStatus,
  jobs: countsByStatus,
  automation: outputObject({
    deliveries: countsByStatus, executions: countsByStatus, manualReplayEnabled: z.boolean(),
  }),
  aiOperations: outputObject({
    executions: countsByStatus, providerExecutionEnabled: z.boolean(), autonomousSensitiveActions: z.boolean(),
  }),
  integrations: countsByStatus,
  support: countsByStatus,
  financialAttention: outputObject({
    failedRefunds: count, failedPayouts: count, activeDisputes: count,
    latestReconciliation: reconciliationSummary.nullable(),
  }),
  freshness: outputObject({
    latestErrorAt: dateTime.nullable(), latestIncidentAt: dateTime.nullable(), partialData: z.boolean(),
  }),
});
const errorGroupSummary = {
  id: z.string(),
  fingerprint: z.string(),
  errorCode: z.string().nullable(),
  occurrenceCount: count,
};
const errorGroup = outputObject({
  ...errorGroupSummary,
  severity: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']),
  environment: z.string(),
  service: z.string(),
  module: z.string().nullable(),
  operation: z.string().nullable(),
  normalizedMessage: z.string(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED']),
  firstSeenAt: dateTime,
  lastSeenAt: dateTime,
  windowStartedAt: dateTime,
  windowOccurrenceCount: count,
  _count: outputObject({ events: count, incidents: count }),
});
const incident = outputObject({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED']),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  service: z.string().nullable(),
  detectedAt: dateTime,
  acknowledgedAt: dateTime.nullable(),
  resolvedAt: dateTime.nullable(),
  closedAt: dateTime.nullable(),
  updatedAt: dateTime,
  errorGroup: outputObject(errorGroupSummary).nullable(),
  _count: outputObject({ events: count, comments: count }),
});
const snapshot = outputObject({
  id: z.string(), service: z.string(),
  status: z.enum(['HEALTHY', 'DEGRADED', 'OUTAGE', 'UNKNOWN']),
  latencyMs: z.number().int().nullable(), message: z.string().nullable(), checkedAt: dateTime,
});
const errorDetail = errorGroup.omit({ _count: true }).extend({
  events: z.array(outputObject({
    id: z.string(), severity: errorGroup.shape.severity, httpStatus: z.number().int().nullable(),
    endpoint: z.string().nullable(), method: z.string().nullable(), requestId: z.string().nullable(),
    correlationId: z.string().nullable(), traceId: z.string().nullable(), appVersion: z.string().nullable(),
    occurredAt: dateTime,
  })),
  incidents: z.array(incident.pick({
    id: true, title: true, status: true, severity: true, detectedAt: true, resolvedAt: true,
  })),
});
const incidentDetail = incident.omit({ _count: true }).extend({
  createdAt: dateTime,
  errorGroup: errorGroup.pick({
    id: true, fingerprint: true, severity: true, status: true, errorCode: true,
    normalizedMessage: true, occurrenceCount: true, lastSeenAt: true,
  }).nullable(),
  events: z.array(outputObject({
    id: z.string(), eventType: z.string(), message: z.string().nullable(),
    createdAt: dateTime, errorEventId: z.string().nullable(),
  })),
  comments: z.array(outputObject({
    id: z.string(), body: z.string(), createdAt: dateTime, updatedAt: dateTime,
    author: outputObject({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  })),
});
const errorGroupRecord = errorGroup.omit({ _count: true });
const incidentRecord = incident.omit({ _count: true, errorGroup: true }).extend({
  errorGroupId: z.string().nullable(),
  assigneeId: z.string().nullable(), createdAt: dateTime,
});
const incidentCommentRecord = outputObject({
  id: z.string(), incidentId: z.string(), authorId: z.string(), body: z.string(),
  createdAt: dateTime, updatedAt: dateTime,
});
const processingFields = {
  id: z.string(), eventType: z.string(), attempts: count,
  processedAt: dateTime.nullable(), hasError: z.boolean(),
};
const job = outputObject({
  ...processingFields,
  aggregateType: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER']),
  availableAt: dateTime, lockedAt: dateTime.nullable(), createdAt: dateTime,
});
const integration = outputObject({
  ...processingFields,
  provider: z.string(),
  status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER']),
  correlationId: z.string().nullable(), receivedAt: dateTime,
  processingStartedAt: dateTime.nullable(), updatedAt: dateTime,
});
const alert = outputObject({
  ...processingFields,
  aggregateId: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER']),
  availableAt: dateTime, createdAt: dateTime,
  route: z.string().nullable(), severity: z.string().nullable(),
});

const operationsResponses = Object.freeze({
  metrics: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/metrics', operationId: 'adminOperations.metrics',
    responses: { 200: { schema: z.string(), serialize: (body) => body, mediaType: 'text/plain' } },
  }),
  health: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/health', operationId: 'adminOperations.health',
    responses: { 200: outputObject({ ...healthReportFields, status: z.enum(['HEALTHY', 'DEGRADED']) }) },
  }),
  financialMonitoring: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/financial-monitoring', operationId: 'adminOperations.financialMonitoring',
    responses: { 200: serialized(outputObject({
      generatedAt: dateTime, readOnly: z.literal(true),
      refunds: z.array(financialGroup), payouts: z.array(financialGroup),
      disputes: z.array(financialGroup.extend({ recoveredAmount: z.string() })),
      reconciliationRuns: z.array(reconciliationSummary),
    })) },
  }),
  overview: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/overview', operationId: 'adminOperations.overview',
    responses: { 200: serialized(overview) },
  }),
  errorDetail: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/errors/{id}', operationId: 'adminOperations.errorDetail',
    responses: { 200: serialized(outputObject({ errorGroup: errorDetail })) },
  }),
  incidentDetail: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/incidents/{id}', operationId: 'adminOperations.incidentDetail',
    responses: { 200: serialized(outputObject({ incident: incidentDetail })) },
  }),
  errorStatus: defineResponseContract({
    method: 'PATCH', path: '/api/v1/admin/operations/errors/{id}/status', operationId: 'adminOperations.errorStatus',
    responses: { 200: serialized(outputObject({ errorGroup: errorGroupRecord, duplicate: z.boolean() })) },
  }),
  incidentStatus: defineResponseContract({
    method: 'PATCH', path: '/api/v1/admin/operations/incidents/{id}/status', operationId: 'adminOperations.incidentStatus',
    responses: { 200: serialized(outputObject({ incident: incidentRecord, duplicate: z.boolean() })) },
  }),
  incidentComment: defineResponseContract({
    method: 'POST', path: '/api/v1/admin/operations/incidents/{id}/comments', operationId: 'adminOperations.incidentComment',
    responses: { 201: serialized(outputObject({ comment: incidentCommentRecord })) },
  }),
  errors: defineResponseContract({
    method: 'GET',
    path: '/api/v1/admin/operations/errors',
    operationId: 'adminOperations.errors',
    responses: { 200: serialized(adminListResponse(errorGroup)) },
  }),
  incidents: defineResponseContract({
    method: 'GET',
    path: '/api/v1/admin/operations/incidents',
    operationId: 'adminOperations.incidents',
    responses: { 200: serialized(adminListResponse(incident)) },
  }),
  healthSnapshots: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/health/snapshots', operationId: 'adminOperations.healthSnapshots',
    responses: { 200: serialized(adminListResponse(snapshot)) },
  }),
  jobs: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/jobs', operationId: 'adminOperations.jobs',
    responses: { 200: serialized(adminListResponse(job)) },
  }),
  integrations: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/integrations', operationId: 'adminOperations.integrations',
    responses: { 200: serialized(adminListResponse(integration)) },
  }),
  alerts: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/alerts', operationId: 'adminOperations.alerts',
    responses: { 200: serialized(adminListResponse(alert)) },
  }),
});

module.exports = { operationsResponses };
