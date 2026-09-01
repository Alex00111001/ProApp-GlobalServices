const { randomUUID } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { redactText } = require('./redaction');
const env = require('../../config/env');
const { buildAlertRequest } = require('./alerting.service');
const { telemetryMetadata } = require('./context');

const incidentSeverityForError = (severity) => ({
  CRITICAL: 'CRITICAL',
  ERROR: 'HIGH',
  WARNING: 'MEDIUM',
}[severity]);

const shouldRecommendIncident = (errorGroup, options = {}) => {
  if (!incidentSeverityForError(errorGroup.severity)) return false;
  const defaultThreshold = errorGroup.severity === 'CRITICAL' ? 1 : errorGroup.severity === 'WARNING' ? 50 : 20;
  const threshold = options.threshold ?? (errorGroup.severity === 'ERROR' ? env.observabilityIncidentThreshold : defaultThreshold);
  const windowMinutes = options.windowMinutes ?? env.observabilityErrorWindowMinutes;
  const cutoff = Date.now() - windowMinutes * 60_000;
  const windowStartedAt = errorGroup.windowStartedAt || errorGroup.firstSeenAt;
  const windowCount = errorGroup.windowOccurrenceCount ?? errorGroup.occurrenceCount;
  return windowCount >= threshold && new Date(windowStartedAt).getTime() >= cutoff;
};

const ensureIncidentForError = async ({ event: errorEvent, group: errorGroup }, client) => {
  if (!shouldRecommendIncident(errorGroup)) return null;
  const database = client || require('../../config/prisma');
  const windowKey = new Date(errorGroup.windowStartedAt || errorGroup.firstSeenAt).toISOString();
  const deduplicationKey = `error-group:${errorGroup.id}:${windowKey}`;
  const existing = await database.incident.findUnique({ where: { deduplicationKey } });
  if (existing) return existing;

  const createIncident = async (tx) => {
    const title = `${errorGroup.errorCode || 'Repeated error'} in ${errorGroup.service}`.slice(0, 200);
    const description = redactText(errorGroup.normalizedMessage);
    const severity = incidentSeverityForError(errorGroup.severity);
    let incident;
    if (typeof tx.$queryRaw === 'function') {
      const now = new Date();
      const created = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "Incident" (
          "id", "errorGroupId", "deduplicationKey", "title", "description", "status",
          "severity", "service", "detectedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${errorGroup.id}, ${deduplicationKey}, ${title}, ${description},
          'OPEN'::"IncidentStatus", CAST(${severity} AS "IncidentSeverity"), ${errorGroup.service},
          ${now}, ${now}, ${now}
        )
        ON CONFLICT ("deduplicationKey") DO NOTHING
        RETURNING *
      `);
      if (created.length === 0) return tx.incident.findUnique({ where: { deduplicationKey } });
      [incident] = created;
      await tx.incidentEvent.create({
        data: { incidentId: incident.id, eventType: 'ERROR_THRESHOLD_REACHED', errorEventId: errorEvent.id },
      });
    } else {
      incident = await tx.incident.create({
        data: {
          deduplicationKey,
          errorGroupId: errorGroup.id,
          title,
          description,
          severity,
          service: errorGroup.service,
          events: { create: { eventType: 'ERROR_THRESHOLD_REACHED', errorEventId: errorEvent.id } },
        },
      });
    }
    const alertRequest = buildAlertRequest(incident, errorEvent);
    if (tx.outboxEvent && alertRequest) {
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Incident',
          aggregateId: incident.id,
          eventType: 'incident.alert_requested',
          payload: alertRequest.payload,
          metadata: telemetryMetadata(errorEvent, { ...alertRequest.metadata, reason: 'ERROR_THRESHOLD_REACHED' }),
        },
      });
    }
    if (tx.auditLog) {
      await tx.auditLog.create({
        data: {
          action: 'incident.created',
          resourceType: 'Incident',
          resourceId: incident.id,
          outcome: 'SUCCESS',
          after: { status: incident.status, severity: incident.severity, service: incident.service },
          requestId: errorEvent.requestId,
          correlationId: errorEvent.correlationId,
          traceId: errorEvent.traceId,
          metadata: { source: 'ERROR_THRESHOLD', errorEventId: errorEvent.id, errorGroupId: errorGroup.id },
        },
      });
    }
    return incident;
  };

  try {
    return typeof database.$transaction === 'function'
      ? await database.$transaction(createIncident)
      : await createIncident(database);
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    return database.incident.findUnique({ where: { deduplicationKey } });
  }
};

module.exports = { ensureIncidentForError, incidentSeverityForError, shouldRecommendIncident };
