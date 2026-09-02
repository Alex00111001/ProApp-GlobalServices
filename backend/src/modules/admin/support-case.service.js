const { randomUUID } = require('node:crypto');
const prisma = require('../../config/prisma');
const { hasPermission } = require('../identity/authorization.service');
const { redactText, sanitizeTelemetry } = require('../observability/redaction');
const { telemetryMetadata } = require('../observability/context');

const SUPPORT_TRANSITIONS = Object.freeze({
  OPEN: ['TRIAGED'],
  TRIAGED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'RESOLVED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
});
const operationalError = (message, code, statusCode) => Object.assign(new Error(message), { code, statusCode });
const pagination = (page, limit, totalItems) => ({ page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) });
const contextFields = (context = {}) => ({ requestId: context.requestId, correlationId: context.correlationId, traceId: context.traceId });

const listSupportCases = async ({ page, limit, status, priority, assignedToId, search }, client = prisma) => {
  const where = {
    ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(assignedToId ? { assignedToId } : {}),
    ...(search ? { OR: [{ caseKey: { contains: search, mode: 'insensitive' } }, { subject: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [items, totalItems] = await Promise.all([
    client.supportCase.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }], select: { id: true, caseKey: true, subject: true, category: true, priority: true, status: true, requesterUserId: true, bookingId: true, assignedTo: { select: { id: true, firstName: true, lastName: true } }, createdAt: true, updatedAt: true, _count: { select: { comments: true, events: true } } } }),
    client.supportCase.count({ where }),
  ]);
  return { items, pagination: pagination(page, limit, totalItems) };
};

const getSupportCase = (id, client = prisma) => client.supportCase.findUnique({ where: { id }, select: {
  id: true, caseKey: true, subject: true, description: true, category: true, priority: true, status: true, requesterUserId: true, bookingId: true, resolvedAt: true, closedAt: true, createdAt: true, updatedAt: true,
  requester: { select: { id: true, firstName: true, lastName: true, isActive: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  comments: { orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, body: true, createdAt: true, updatedAt: true, author: { select: { id: true, firstName: true, lastName: true } } } },
  events: { orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, eventType: true, fromStatus: true, toStatus: true, message: true, createdAt: true, actor: { select: { id: true, firstName: true, lastName: true } } } },
} });

const createSupportCase = async ({ actorId, context, ...input }, client = prisma) => client.$transaction(async (tx) => {
  if (input.bookingId) {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, select: { id: true, client: { select: { userId: true } } } });
    if (!booking) throw operationalError('Booking was not found.', 'BOOKING_NOT_FOUND', 404);
    if (input.requesterUserId && booking.client.userId !== input.requesterUserId) throw operationalError('Booking does not belong to the requester.', 'SUPPORT_REQUESTER_MISMATCH', 422);
  }
  if (input.requesterUserId && !await tx.user.findUnique({ where: { id: input.requesterUserId }, select: { id: true } })) throw operationalError('Requester was not found.', 'USER_NOT_FOUND', 404);
  const created = await tx.supportCase.create({ data: { ...input, caseKey: `SUP-${randomUUID().slice(0, 8).toUpperCase()}`, createdById: actorId } });
  await tx.supportCaseEvent.create({ data: { caseId: created.id, actorId, eventType: 'CREATED', toStatus: 'OPEN' } });
  await tx.outboxEvent.create({ data: { aggregateType: 'SupportCase', aggregateId: created.id, eventType: 'support.case.created', payload: { caseId: created.id, caseKey: created.caseKey, status: created.status, priority: created.priority, category: created.category }, metadata: telemetryMetadata(context) } });
  await tx.auditLog.create({ data: { actorId, action: 'support.case_created', resourceType: 'SupportCase', resourceId: created.id, outcome: 'SUCCESS', after: sanitizeTelemetry({ caseKey: created.caseKey, status: created.status, priority: created.priority, category: created.category }), ...contextFields(context) } });
  return created;
});

const transitionSupportCase = async ({ id, toStatus, actorId, reason, context }, client = prisma) => client.$transaction(async (tx) => {
  const current = await tx.supportCase.findUnique({ where: { id } });
  if (!current) throw operationalError('Support case was not found.', 'SUPPORT_CASE_NOT_FOUND', 404);
  if (current.status === toStatus) return { supportCase: current, duplicate: true };
  if (!SUPPORT_TRANSITIONS[current.status]?.includes(toStatus)) throw operationalError(`Support case cannot transition from ${current.status} to ${toStatus}.`, 'INVALID_SUPPORT_CASE_TRANSITION', 409);
  const now = new Date(); const reopen = toStatus === 'IN_PROGRESS' && ['RESOLVED', 'CLOSED'].includes(current.status);
  const timestamps = { ...(toStatus === 'RESOLVED' ? { resolvedAt: now } : {}), ...(toStatus === 'CLOSED' ? { closedAt: now } : {}), ...(reopen ? { resolvedAt: null, closedAt: null } : {}) };
  const changed = await tx.supportCase.updateMany({ where: { id, status: current.status }, data: { status: toStatus, ...timestamps } });
  if (changed.count !== 1) throw operationalError('Support case changed concurrently.', 'SUPPORT_CASE_CONFLICT', 409);
  const safeReason = redactText(reason);
  await tx.supportCaseEvent.create({ data: { caseId: id, actorId, eventType: reopen ? 'REOPENED' : 'STATUS_CHANGED', fromStatus: current.status, toStatus, message: safeReason } });
  await tx.outboxEvent.create({ data: { aggregateType: 'SupportCase', aggregateId: id, eventType: reopen ? 'support.case.reopened' : 'support.case.status_changed', payload: { caseId: id, fromStatus: current.status, toStatus }, metadata: telemetryMetadata(context) } });
  await tx.auditLog.create({ data: { actorId, action: 'support.status_changed', resourceType: 'SupportCase', resourceId: id, outcome: 'SUCCESS', reason: safeReason, before: { status: current.status }, after: { status: toStatus }, ...contextFields(context) } });
  return { supportCase: await tx.supportCase.findUnique({ where: { id } }), duplicate: false };
});

const assignSupportCase = async ({ id, assignedToId, actorId, reason, context }, client = prisma) => client.$transaction(async (tx) => {
  const current = await tx.supportCase.findUnique({ where: { id }, select: { id: true, assignedToId: true, status: true } });
  if (!current) throw operationalError('Support case was not found.', 'SUPPORT_CASE_NOT_FOUND', 404);
  if (assignedToId) {
    const assignee = await tx.user.findUnique({ where: { id: assignedToId }, select: { id: true, role: true, isActive: true } });
    if (!assignee || !assignee.isActive || !await hasPermission(assignee, 'support.manage', tx, { allowLegacyAdmin: false })) throw operationalError('Assignee is not an active support operator.', 'INVALID_SUPPORT_ASSIGNEE', 422);
  }
  if (current.assignedToId === assignedToId) return { supportCase: current, duplicate: true };
  const updated = await tx.supportCase.update({ where: { id }, data: { assignedToId }, select: { id: true, assignedToId: true, status: true } });
  const safeReason = redactText(reason);
  await tx.supportCaseEvent.create({ data: { caseId: id, actorId, eventType: assignedToId ? 'ASSIGNED' : 'UNASSIGNED', message: safeReason, metadata: sanitizeTelemetry({ from: current.assignedToId, to: assignedToId }) } });
  await tx.outboxEvent.create({ data: { aggregateType: 'SupportCase', aggregateId: id, eventType: 'support.case.assignment_changed', payload: { caseId: id, assigned: Boolean(assignedToId) }, metadata: telemetryMetadata(context) } });
  await tx.auditLog.create({ data: { actorId, action: 'support.assignment_changed', resourceType: 'SupportCase', resourceId: id, outcome: 'SUCCESS', reason: safeReason, before: { assignedToId: current.assignedToId }, after: { assignedToId }, ...contextFields(context) } });
  return { supportCase: updated, duplicate: false };
});

const addSupportComment = async ({ id, actorId, body, context }, client = prisma) => client.$transaction(async (tx) => {
  if (!await tx.supportCase.findUnique({ where: { id }, select: { id: true } })) throw operationalError('Support case was not found.', 'SUPPORT_CASE_NOT_FOUND', 404);
  const comment = await tx.supportCaseComment.create({ data: { caseId: id, authorId: actorId, body } });
  await tx.supportCaseEvent.create({ data: { caseId: id, actorId, eventType: 'COMMENT_ADDED', metadata: { commentId: comment.id } } });
  await tx.outboxEvent.create({ data: { aggregateType: 'SupportCase', aggregateId: id, eventType: 'support.case.comment_added', payload: { caseId: id, commentId: comment.id }, metadata: telemetryMetadata(context) } });
  await tx.auditLog.create({ data: { actorId, action: 'support.comment_added', resourceType: 'SupportCase', resourceId: id, outcome: 'SUCCESS', metadata: { commentId: comment.id }, ...contextFields(context) } });
  return comment;
});

const listSupportOperators = (client = prisma) => client.user.findMany({ where: { isActive: true, administrativeRoles: { some: { status: 'ACTIVE', role: { permissions: { some: { permission: { key: 'support.manage' } } } } } } }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], select: { id: true, firstName: true, lastName: true } });

module.exports = { SUPPORT_TRANSITIONS, addSupportComment, assignSupportCase, createSupportCase, getSupportCase, listSupportCases, listSupportOperators, transitionSupportCase };
