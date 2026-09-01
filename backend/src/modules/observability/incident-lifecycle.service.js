const { redactText, sanitizeTelemetry } = require('./redaction');
const { telemetryMetadata } = require('./context');
const { buildAlertRequest } = require('./alerting.service');

const INCIDENT_TRANSITIONS = Object.freeze({
  OPEN: ['INVESTIGATING'],
  INVESTIGATING: ['IDENTIFIED'],
  IDENTIFIED: ['MONITORING'],
  MONITORING: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: ['INVESTIGATING'],
});

const ERROR_TRANSITIONS = Object.freeze({
  OPEN: ['ACKNOWLEDGED', 'IGNORED'],
  ACKNOWLEDGED: ['RESOLVED', 'IGNORED'],
  RESOLVED: ['OPEN'],
  IGNORED: ['OPEN'],
});

const operationalError = (message, code, statusCode) => Object.assign(new Error(message), { code, statusCode });

const transitionIncident = async ({ incidentId, toStatus, actorId, reason, context = {} }, client) => {
  const database = client || require('../../config/prisma');
  return database.$transaction(async (tx) => {
    const incident = await tx.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw operationalError('Incident not found', 'INCIDENT_NOT_FOUND', 404);
    if (incident.status === toStatus) return { incident, duplicate: true };
    if (!INCIDENT_TRANSITIONS[incident.status]?.includes(toStatus)) {
      throw operationalError(
        `Incident cannot transition from ${incident.status} to ${toStatus}`,
        'INVALID_INCIDENT_TRANSITION',
        409
      );
    }

    const now = new Date();
    const timestamps = {};
    const isReopen = toStatus === 'INVESTIGATING' && ['RESOLVED', 'CLOSED'].includes(incident.status);
    if (toStatus === 'INVESTIGATING') timestamps.acknowledgedAt = now;
    if (isReopen) {
      timestamps.resolvedAt = null;
      timestamps.closedAt = null;
    }
    if (toStatus === 'RESOLVED') timestamps.resolvedAt = now;
    if (toStatus === 'CLOSED') timestamps.closedAt = now;
    const changed = await tx.incident.updateMany({
      where: { id: incidentId, status: incident.status },
      data: { status: toStatus, ...timestamps },
    });
    if (changed.count !== 1) throw operationalError('Incident changed concurrently', 'INCIDENT_CONFLICT', 409);

    await tx.incidentEvent.create({
      data: {
        incidentId,
        eventType: isReopen ? 'REOPENED' : 'STATUS_CHANGED',
        message: redactText(reason || `${incident.status} -> ${toStatus}`),
        metadata: sanitizeTelemetry({ fromStatus: incident.status, toStatus, actorId }),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'incident.status_changed',
        resourceType: 'Incident',
        resourceId: incidentId,
        outcome: 'SUCCESS',
        reason: redactText(reason),
        before: { status: incident.status },
        after: { status: toStatus },
        requestId: context.requestId,
        correlationId: context.correlationId,
        traceId: context.traceId,
      },
    });
    const alertRequest = isReopen ? buildAlertRequest({ ...incident, status: toStatus, ...timestamps }, context) : null;
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Incident',
        aggregateId: incidentId,
        eventType: isReopen ? 'incident.reopened' : 'incident.status_changed',
        payload: alertRequest?.payload || { incidentId, fromStatus: incident.status, toStatus },
        metadata: telemetryMetadata(context, {
          ...(alertRequest?.metadata || {}),
          correlationId: context.correlationId,
          requestId: context.requestId,
          traceId: context.traceId,
          alertRequested: isReopen,
        }),
      },
    });
    return {
      incident: await tx.incident.findUnique({ where: { id: incidentId } }),
      duplicate: false,
    };
  });
};

const transitionErrorGroup = async ({ errorGroupId, toStatus, actorId, reason, context = {} }, client) => {
  const database = client || require('../../config/prisma');
  return database.$transaction(async (tx) => {
    const errorGroup = await tx.errorGroup.findUnique({ where: { id: errorGroupId } });
    if (!errorGroup) throw operationalError('Error group not found', 'ERROR_GROUP_NOT_FOUND', 404);
    if (errorGroup.status === toStatus) return { errorGroup, duplicate: true };
    if (!ERROR_TRANSITIONS[errorGroup.status]?.includes(toStatus)) {
      throw operationalError(
        `Error group cannot transition from ${errorGroup.status} to ${toStatus}`,
        'INVALID_ERROR_TRANSITION',
        409
      );
    }
    const changed = await tx.errorGroup.updateMany({
      where: { id: errorGroupId, status: errorGroup.status },
      data: { status: toStatus },
    });
    if (changed.count !== 1) throw operationalError('Error group changed concurrently', 'ERROR_GROUP_CONFLICT', 409);
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'error.status_changed',
        resourceType: 'ErrorGroup',
        resourceId: errorGroupId,
        outcome: 'SUCCESS',
        reason: redactText(reason),
        before: { status: errorGroup.status },
        after: { status: toStatus },
        requestId: context.requestId,
        correlationId: context.correlationId,
        traceId: context.traceId,
      },
    });
    return {
      errorGroup: await tx.errorGroup.findUnique({ where: { id: errorGroupId } }),
      duplicate: false,
    };
  });
};

const addIncidentComment = async ({ incidentId, actorId, body, context = {} }, client) => {
  const database = client || require('../../config/prisma');
  const safeBody = redactText(body).trim();
  if (!safeBody) throw operationalError('Comment body is required', 'VALIDATION_ERROR', 400);
  return database.$transaction(async (tx) => {
    const incident = await tx.incident.findUnique({ where: { id: incidentId }, select: { id: true } });
    if (!incident) throw operationalError('Incident not found', 'INCIDENT_NOT_FOUND', 404);
    const comment = await tx.incidentComment.create({
      data: { incidentId, authorId: actorId, body: safeBody },
    });
    await tx.incidentEvent.create({
      data: { incidentId, eventType: 'COMMENT_ADDED', metadata: { commentId: comment.id, actorId } },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'incident.comment_added',
        resourceType: 'Incident',
        resourceId: incidentId,
        outcome: 'SUCCESS',
        requestId: context.requestId,
        correlationId: context.correlationId,
        traceId: context.traceId,
        metadata: { commentId: comment.id },
      },
    });
    return comment;
  });
};

module.exports = {
  ERROR_TRANSITIONS,
  INCIDENT_TRANSITIONS,
  addIncidentComment,
  transitionErrorGroup,
  transitionIncident,
};
