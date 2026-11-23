const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { adminListResponse, dateTime } = require('./shared.responses');

const count = z.number().int().nonnegative();
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

const operationsResponses = Object.freeze({
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
});

module.exports = { operationsResponses };
