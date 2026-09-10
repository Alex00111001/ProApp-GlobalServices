const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { writeAuditLog } = require('../audit/audit.service');
const { canonicalDigest, operationalError, requestEvidence, sanitizePrivateObject } = require('../privacy/privacy-utils');
const { observeSupplyDemandOperation } = require('../observability/metrics');
const { METRIC_CATALOG, assessDataQuality, calculateComponents, evaluateAnomalies, resolveWindow } = require('./registry');

const assertEnabled = () => {
  if (!env.supplyDemandEnabled) throw operationalError('Supply and demand intelligence is disabled.', 'SUPPLY_DEMAND_DISABLED', 503);
};
const dimensions = (marketId, divisionId, serviceId) => ({ marketId, ...(divisionId ? { divisionId } : {}), ...(serviceId ? { serviceId } : {}) });
const dateFilter = (windowStart, windowEnd) => ({ gte: windowStart, lt: windowEnd });
const relationFilters = ({ divisionId, serviceId }) => ({
  ...(serviceId ? { bookingServices: { some: { serviceId } } } : {}),
  ...(divisionId ? { normalizedAddress: { divisions: { some: { divisionId } } } } : {}),
});
const durationHours = (start, end) => {
  const [sh, sm] = String(start).split(':').map(Number); const [eh, em] = String(end).split(':').map(Number);
  const value = (eh * 60 + em - sh * 60 - sm) / 60;
  return Number.isFinite(value) ? Math.max(0, Math.min(24, value)) : 0;
};
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const loadFacts = async ({ market, divisionId, serviceId, windowStart, windowEnd, database = prisma }) => {
  const areaWhere = { marketId: market.id, lifecycle: 'ACTIVE', ...(divisionId ? { divisionId } : {}), ...(serviceId ? { professional: { services: { some: { id: serviceId, isActive: true } } } } : {}) };
  const professionalWhere = { status: { in: ['APPROVED', 'ACTIVE'] }, serviceAreas: { some: areaWhere } };
  const bookingWhere = { marketId: market.id, createdAt: dateFilter(windowStart, windowEnd), ...relationFilters({ divisionId, serviceId }) };
  const eventBookingFilter = relationFilters({ divisionId, serviceId });
  const eventWhere = { marketId: market.id, occurredAt: dateFilter(windowStart, windowEnd), ...(divisionId || serviceId ? { booking: eventBookingFilter } : {}) };
  const [eligibleProfessionals, verifiedProfessionals, areas, availability, events, bookings, eligibleDivisions, watermark] = await Promise.all([
    database.professionalProfile.count({ where: professionalWhere }),
    database.professionalProfile.count({ where: { ...professionalWhere, verifiedAt: { not: null } } }),
    database.professionalServiceArea.findMany({ where: areaWhere, distinct: ['divisionId'], select: { divisionId: true, professionalId: true } }),
    database.professionalAvailability.findMany({ where: { isAvailable: true, professional: professionalWhere }, select: { startTime: true, endTime: true } }),
    database.marketingEvent.findMany({ where: { ...eventWhere, eventName: { in: ['request_created', 'booking_created', 'professional_matched'] } }, select: { eventName: true, occurredAt: true, subjectKey: true } }),
    database.booking.findMany({ where: bookingWhere, select: { status: true, createdAt: true, completedAt: true } }),
    database.administrativeDivision.count({ where: { countryId: market.countryId, lifecycle: 'ACTIVE' } }),
    database.marketingEvent.aggregate({ where: eventWhere, _max: { receivedAt: true } }),
  ]);
  const requests = events.filter((item) => item.eventName === 'request_created');
  const matchesBySubject = new Map(events.filter((item) => item.eventName === 'professional_matched' && item.subjectKey).map((item) => [item.subjectKey, item.occurredAt]));
  const matchMinutes = requests.flatMap((item) => {
    const matchedAt = item.subjectKey && matchesBySubject.get(item.subjectKey);
    return matchedAt && matchedAt >= item.occurredAt ? [(matchedAt - item.occurredAt) / 60000] : [];
  });
  return {
    eligibleProfessionals, verifiedProfessionals, activeServiceAreas: areas.length,
    declaredCapacityHours: availability.reduce((sum, item) => sum + durationHours(item.startTime, item.endTime), 0),
    requestDemand: requests.length,
    bookingAttempts: events.filter((item) => item.eventName === 'booking_created').length,
    matchedDemand: events.filter((item) => item.eventName === 'professional_matched').length,
    totalBookings: bookings.length,
    completedBookings: bookings.filter((item) => item.status === 'COMPLETED').length,
    cancelledBookings: bookings.filter((item) => item.status === 'CANCELLED').length,
    eligibleDivisions,
    coveredDivisions: areas.length,
    medianTimeToMatchMinutes: median(matchMinutes),
    eventWatermark: watermark._max.receivedAt,
    sourceCounts: { events: events.length, bookings: bookings.length, serviceAreas: areas.length, availability: availability.length },
  };
};

const metricValues = (components) => ({
  eligible_professionals: components.eligibleProfessionals,
  verified_professionals: components.verifiedProfessionals,
  active_service_areas: components.activeServiceAreas,
  declared_capacity_hours: components.declaredCapacityHours,
  request_demand: components.requestDemand,
  booking_attempts: components.bookingAttempts,
  completed_bookings: components.completedBookings,
  unmet_demand: components.unmetDemand,
  fulfilment_rate: components.fulfilmentRate,
  cancellation_pressure: components.cancellationRate,
  requests_per_professional: components.requestsPerProfessional,
  geographic_coverage: components.geographicCoverage,
});

const ensureMetricDefinitions = async ({ actorId, database = prisma }) => {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT 1::integer AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtextextended('f10:supply-demand:metric-catalog', 0))) AS advisory_lock`);
    const records = [];
    for (const [key, definition] of Object.entries(METRIC_CATALOG)) {
      const configurationDigest = canonicalDigest({ key, ...definition, dimensions: ['market', 'geography', 'service'], windows: ['HOUR', 'DAY', 'SEVEN_DAYS', 'THIRTY_DAYS', 'CUSTOM'] });
      records.push(await tx.supplyDemandMetricDefinition.upsert({
        where: { key_version: { key, version: definition.version } }, update: {},
        create: {
          key, version: definition.version, status: 'ACTIVE', kind: definition.kind, unit: definition.unit,
          eventSources: definition.sources, numeratorDefinition: { key }, denominatorDefinition: definition.unit === 'ratio' ? { explicit: true } : undefined,
          deduplication: { strategy: 'authoritative_primary_key_or_event_id' }, dimensions: ['market', 'geography', 'service'],
          supportedWindows: ['HOUR', 'DAY', 'SEVEN_DAYS', 'THIRTY_DAYS', 'CUSTOM'], timezonePolicy: { source: 'Market.timezonePolicy' },
          formulaVersion: `builtin:${definition.version}`, configurationDigest, createdById: actorId, reviewedById: actorId, reviewedAt: new Date(), effectiveAt: new Date(),
        },
      }));
    }
    return records;
  });
};

const generateSnapshot = async ({ marketId, divisionId, serviceId, window = 'SEVEN_DAYS', from, to, actorId, req, database = prisma, now = new Date() }) => {
  assertEnabled(); const startedAt = Date.now();
  const { windowStart, windowEnd } = resolveWindow({ window, from, to, now });
  const market = await database.market.findUnique({ where: { id: marketId }, include: { policies: { orderBy: { version: 'desc' } } } });
  if (!market) throw operationalError('Market was not found.', 'MARKET_UNAVAILABLE', 404);
  if (divisionId) {
    const division = await database.administrativeDivision.findUnique({ where: { id: divisionId } });
    if (!division || division.countryId !== market.countryId || division.lifecycle !== 'ACTIVE') throw operationalError('Geography is not valid for Market.', 'SUPPLY_DEMAND_GEOGRAPHY_INVALID', 422);
  }
  if (serviceId && !(await database.service.findFirst({ where: { id: serviceId, isActive: true } }))) throw operationalError('Service is unavailable.', 'SUPPLY_DEMAND_SERVICE_INVALID', 422);
  const definitions = await ensureMetricDefinitions({ actorId, database });
  const facts = await loadFacts({ market, divisionId, serviceId, windowStart, windowEnd, database });
  const components = calculateComponents(facts); const anomalies = evaluateAnomalies(components);
  const quality = assessDataQuality({ components, eventWatermark: facts.eventWatermark, windowEnd, now });
  const input = { dimensions: dimensions(market.id, divisionId, serviceId), window, windowStart, windowEnd, sourceCounts: facts.sourceCounts, components, quality, anomalyRuleVersion: 1 };
  const inputDigest = canonicalDigest(input); const snapshotKey = canonicalDigest({ ...input, inputDigest, algorithmVersion: 'supply-demand-v1' });
  const dimensionKey = canonicalDigest(dimensions(market.id, divisionId, serviceId));
  const values = metricValues(components); const evidence = requestEvidence(req?.context);
  let snapshot;
  try {
    snapshot = await database.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT 1::integer AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${snapshotKey}, 0))) AS advisory_lock`);
      const existing = await tx.supplyDemandSnapshot.findUnique({ where: { snapshotKey } });
      if (existing) return existing;
      for (const definition of definitions) {
        const value = values[definition.key];
        await tx.supplyDemandObservation.upsert({
          where: { definitionId_dimensionKey_windowStart_windowEnd_inputDigest: { definitionId: definition.id, dimensionKey, windowStart, windowEnd, inputDigest } },
          update: {}, create: { definitionId: definition.id, ...dimensions(market.id, divisionId, serviceId), dimensionKey, window, windowStart, windowEnd, eventWatermark: facts.eventWatermark, numerator: value, value, sourceCount: Object.values(facts.sourceCounts).reduce((sum, count) => sum + count, 0), dataQuality: quality.status, qualityReasons: quality.missingEvidence, evidence: { sourceCounts: facts.sourceCounts, formulaVersion: definition.formulaVersion }, inputDigest, ...evidence },
        });
      }
      const saved = await tx.supplyDemandSnapshot.upsert({ where: { snapshotKey }, update: {}, create: { snapshotKey, ...dimensions(market.id, divisionId, serviceId), window, windowStart, windowEnd, eventWatermark: facts.eventWatermark, status: quality.status, components, balance: { requestsPerProfessional: components.requestsPerProfessional, fulfilmentRate: components.fulfilmentRate, cancellationRate: components.cancellationRate, geographicCoverage: components.geographicCoverage }, anomalies, missingEvidence: quality.missingEvidence, algorithmVersion: 'supply-demand-v1', inputDigest, ...evidence } });
      await writeAuditLog({ req, action: 'SUPPLY_DEMAND_SNAPSHOT_GENERATED', resourceType: 'SUPPLY_DEMAND_SNAPSHOT', resourceId: saved.id, metadata: { marketId: market.id, divisionId: divisionId || null, serviceId: serviceId || null, window, status: quality.status } }, tx);
      return saved;
    });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    snapshot = await database.supplyDemandSnapshot.findUnique({ where: { snapshotKey } });
    if (!snapshot) throw error;
  }
  observeSupplyDemandOperation({ operation: 'snapshot', outcome: quality.status.toLowerCase(), durationSeconds: (Date.now() - startedAt) / 1000, lagSeconds: quality.lagMinutes == null ? undefined : quality.lagMinutes * 60 });
  return snapshot;
};

const listMetricDefinitions = async ({ page = 1, limit = 50, kind, database = prisma }) => {
  const where = kind ? { kind } : {}; const [items, total] = await Promise.all([
    database.supplyDemandMetricDefinition.findMany({ where, orderBy: [{ key: 'asc' }, { version: 'desc' }], skip: (page - 1) * limit, take: limit }),
    database.supplyDemandMetricDefinition.count({ where }),
  ]);
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const listSnapshots = async ({ page = 1, limit = 50, marketId, divisionId, serviceId, from, to, status, database = prisma }) => {
  assertEnabled();
  const where = { ...(marketId ? { marketId } : {}), ...(divisionId ? { divisionId } : {}), ...(serviceId ? { serviceId } : {}), ...(status ? { status } : {}), ...(from || to ? { windowEnd: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
  const [items, total] = await Promise.all([database.supplyDemandSnapshot.findMany({ where, orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, include: { market: { select: { code: true, status: true } }, division: { select: { canonicalCode: true, canonicalName: true } }, service: { select: { name: true } } } }), database.supplyDemandSnapshot.count({ where })]);
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

module.exports = { ensureMetricDefinitions, generateSnapshot, listMetricDefinitions, listSnapshots, loadFacts, metricValues };
