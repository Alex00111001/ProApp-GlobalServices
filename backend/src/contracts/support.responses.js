const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { adminListResponse, dateTime } = require('./shared.responses');

const personFields = { id: z.string(), firstName: z.string(), lastName: z.string() };
const person = outputObject(personFields);
const status = z.enum(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']);
const count = z.number().int().nonnegative();
const caseFields = {
  id: z.string(),
  caseKey: z.string(),
  subject: z.string(),
  category: z.enum(['ACCOUNT', 'BOOKING', 'PAYMENT', 'PROFESSIONAL', 'SAFETY', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  status,
  requesterUserId: z.string().nullable(),
  bookingId: z.string().nullable(),
  assignedTo: person.nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
};
const caseList = adminListResponse(outputObject({
  ...caseFields,
  _count: outputObject({ comments: count, events: count }),
}));
const caseDetail = outputObject({
  supportCase: outputObject({
    ...caseFields,
    description: z.string(),
    resolvedAt: dateTime.nullable(),
    closedAt: dateTime.nullable(),
    requester: outputObject({ ...personFields, isActive: z.boolean() }).nullable(),
    createdBy: person,
    comments: z.array(outputObject({
      id: z.string(), body: z.string(), createdAt: dateTime, updatedAt: dateTime, author: person,
    })),
    events: z.array(outputObject({
      id: z.string(), eventType: z.string(), fromStatus: status.nullable(), toStatus: status.nullable(),
      message: z.string().nullable(), createdAt: dateTime, actor: person.nullable(),
    })),
  }),
});
const { assignedTo, ...caseRecordFields } = caseFields;
const caseRecord = outputObject({
  ...caseRecordFields, description: z.string(), assignedToId: z.string().nullable(), createdById: z.string(),
  resolvedAt: dateTime.nullable(), closedAt: dateTime.nullable(),
});
const assignmentRecord = outputObject({ id: z.string(), assignedToId: z.string().nullable(), status });
const commentRecord = outputObject({
  id: z.string(), caseId: z.string(), authorId: z.string(), body: z.string(), createdAt: dateTime, updatedAt: dateTime,
});

const supportResponses = Object.freeze({
  operators: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/support/operators', operationId: 'adminSupport.operators',
    responses: { 200: outputObject({ operators: z.array(person) }) },
  }),
  cases: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/support/cases', operationId: 'adminSupport.cases',
    responses: { 200: serialized(caseList) },
  }),
  detail: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/operations/support/cases/{id}', operationId: 'adminSupport.caseDetail',
    responses: { 200: serialized(caseDetail) },
  }),
  create: defineResponseContract({
    method: 'POST', path: '/api/v1/admin/operations/support/cases', operationId: 'adminSupport.createCase',
    responses: { 201: serialized(outputObject({ supportCase: caseRecord })) },
  }),
  status: defineResponseContract({
    method: 'PATCH', path: '/api/v1/admin/operations/support/cases/{id}/status', operationId: 'adminSupport.setStatus',
    responses: { 200: serialized(outputObject({ supportCase: caseRecord, duplicate: z.boolean() })) },
  }),
  assignment: defineResponseContract({
    method: 'PATCH', path: '/api/v1/admin/operations/support/cases/{id}/assignment', operationId: 'adminSupport.assignCase',
    responses: { 200: outputObject({ supportCase: assignmentRecord, duplicate: z.boolean() }) },
  }),
  comment: defineResponseContract({
    method: 'POST', path: '/api/v1/admin/operations/support/cases/{id}/comments', operationId: 'adminSupport.addComment',
    responses: { 201: serialized(outputObject({ comment: commentRecord })) },
  }),
});

module.exports = { supportResponses };
