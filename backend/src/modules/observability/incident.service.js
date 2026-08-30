const shouldRecommendIncident = (errorEvent, options = {}) => {
  const threshold = options.threshold ?? 20;
  const windowMinutes = options.windowMinutes ?? 5;
  const cutoff = Date.now() - windowMinutes * 60_000;
  return errorEvent.occurrenceCount >= threshold && new Date(errorEvent.firstSeenAt).getTime() >= cutoff;
};

const ensureIncidentForError = async (errorEvent, client) => {
  if (!shouldRecommendIncident(errorEvent)) return null;
  const database = client || require('../../config/prisma');
  const existing = await database.incidentEvent.findFirst({
    where: { errorEventId: errorEvent.id, incident: { status: { notIn: ['RESOLVED', 'CLOSED'] } } },
    include: { incident: true },
  });
  if (existing) return existing.incident;
  return database.incident.create({
    data: {
      title: `${errorEvent.errorCode || 'Repeated error'} in ${errorEvent.service}`,
      description: errorEvent.message,
      severity: errorEvent.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      service: errorEvent.service,
      events: { create: { eventType: 'ERROR_THRESHOLD_REACHED', errorEventId: errorEvent.id } },
    },
  });
};

module.exports = { ensureIncidentForError, shouldRecommendIncident };
