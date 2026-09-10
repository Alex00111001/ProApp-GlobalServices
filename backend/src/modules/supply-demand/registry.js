const { canonicalDigest, operationalError } = require('../privacy/privacy-utils');

const WINDOW_MS = Object.freeze({
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000,
  THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,
});

const METRIC_CATALOG = Object.freeze({
  eligible_professionals: { kind: 'SUPPLY', unit: 'professionals', sources: ['ProfessionalProfile', 'ProfessionalServiceArea', 'Market'], version: 1 },
  verified_professionals: { kind: 'SUPPLY', unit: 'professionals', sources: ['ProfessionalProfile'], version: 1 },
  active_service_areas: { kind: 'SUPPLY', unit: 'divisions', sources: ['ProfessionalServiceArea'], version: 1 },
  declared_capacity_hours: { kind: 'SUPPLY', unit: 'hours', sources: ['ProfessionalAvailability'], version: 1 },
  request_demand: { kind: 'DEMAND', unit: 'events', sources: ['MarketingEvent:request_created'], version: 1 },
  booking_attempts: { kind: 'DEMAND', unit: 'events', sources: ['MarketingEvent:booking_created'], version: 1 },
  completed_bookings: { kind: 'DEMAND', unit: 'bookings', sources: ['Booking:COMPLETED'], version: 1 },
  unmet_demand: { kind: 'DEMAND', unit: 'requests', sources: ['MarketingEvent:request_created', 'MarketingEvent:professional_matched'], version: 1 },
  fulfilment_rate: { kind: 'BALANCE', unit: 'ratio', sources: ['Booking'], version: 1 },
  cancellation_pressure: { kind: 'GUARDRAIL', unit: 'ratio', sources: ['Booking'], version: 1 },
  requests_per_professional: { kind: 'BALANCE', unit: 'ratio', sources: ['MarketingEvent', 'ProfessionalProfile'], version: 1 },
  geographic_coverage: { kind: 'BALANCE', unit: 'ratio', sources: ['ProfessionalServiceArea', 'AdministrativeDivision'], version: 1 },
});

const ANOMALY_RULES = Object.freeze({
  demand_spike: { component: 'requestsPerProfessional', operator: 'gte', threshold: 8 },
  supply_collapse: { component: 'eligibleProfessionals', operator: 'lte', threshold: 1 },
  fulfilment_degradation: { component: 'fulfilmentRate', operator: 'lt', threshold: 0.7 },
  cancellation_increase: { component: 'cancellationRate', operator: 'gt', threshold: 0.2 },
  coverage_gap: { component: 'geographicCoverage', operator: 'lt', threshold: 0.5 },
});

const resolveWindow = ({ window, from, to, now = new Date() }) => {
  if (window === 'CUSTOM') {
    const start = new Date(from); const end = new Date(to);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end - start > 366 * 86400000) {
      throw operationalError('Custom range must be positive and bounded to 366 days.', 'SUPPLY_DEMAND_RANGE_INVALID', 400);
    }
    return { windowStart: start, windowEnd: end };
  }
  const duration = WINDOW_MS[window];
  if (!duration) throw operationalError('Window is not supported.', 'SUPPLY_DEMAND_WINDOW_INVALID', 400);
  return { windowStart: new Date(now.getTime() - duration), windowEnd: now };
};

const safeRatio = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;
const round = (value, scale = 6) => Number(Number(value || 0).toFixed(scale));

const calculateComponents = (facts) => {
  const requestDemand = Number(facts.requestDemand || 0);
  const matchedDemand = Math.min(requestDemand, Number(facts.matchedDemand || 0));
  const eligibleProfessionals = Number(facts.eligibleProfessionals || 0);
  const totalBookings = Number(facts.totalBookings || 0);
  const completedBookings = Number(facts.completedBookings || 0);
  const cancelledBookings = Number(facts.cancelledBookings || 0);
  const eligibleDivisions = Number(facts.eligibleDivisions || 0);
  const coveredDivisions = Math.min(eligibleDivisions, Number(facts.coveredDivisions || 0));
  return Object.freeze({
    eligibleProfessionals,
    verifiedProfessionals: Number(facts.verifiedProfessionals || 0),
    activeServiceAreas: Number(facts.activeServiceAreas || 0),
    declaredCapacityHours: round(facts.declaredCapacityHours),
    requestDemand,
    bookingAttempts: Number(facts.bookingAttempts || 0),
    completedBookings,
    unmetDemand: Math.max(0, requestDemand - matchedDemand),
    fulfilmentRate: round(safeRatio(completedBookings, totalBookings)),
    cancellationRate: round(safeRatio(cancelledBookings, totalBookings)),
    requestsPerProfessional: round(safeRatio(requestDemand, eligibleProfessionals)),
    geographicCoverage: round(safeRatio(coveredDivisions, eligibleDivisions)),
    medianTimeToMatchMinutes: facts.medianTimeToMatchMinutes == null ? null : round(facts.medianTimeToMatchMinutes, 2),
  });
};

const evaluateAnomalies = (components, rules = ANOMALY_RULES) => Object.entries(rules).flatMap(([key, rule]) => {
  const value = components[rule.component];
  if (!Number.isFinite(value)) return [];
  const matched = rule.operator === 'gte' ? value >= rule.threshold
    : rule.operator === 'lte' ? value <= rule.threshold
      : rule.operator === 'gt' ? value > rule.threshold : value < rule.threshold;
  return matched ? [{ key, component: rule.component, value, threshold: rule.threshold, ruleVersion: 1 }] : [];
});

const assessDataQuality = ({ components, eventWatermark, windowEnd, now = new Date(), lateArrivalMinutes = 60 }) => {
  const missing = [];
  if (!components.eligibleProfessionals) missing.push('eligible_supply_zero');
  if (components.medianTimeToMatchMinutes == null) missing.push('time_to_match_unavailable');
  const lagMinutes = eventWatermark ? Math.max(0, (windowEnd - eventWatermark) / 60000) : null;
  if (lagMinutes == null) missing.push('event_watermark_missing');
  const ageMinutes = Math.max(0, (now - windowEnd) / 60000);
  const status = lagMinutes == null ? 'PARTIAL'
    : ageMinutes > 24 * 60 ? 'STALE'
      : lagMinutes > lateArrivalMinutes ? 'PARTIAL'
        : missing.length > 1 ? 'PARTIAL' : 'COMPLETE';
  return { status, missingEvidence: missing, lagMinutes: lagMinutes == null ? null : round(lagMinutes, 2) };
};

const snapshotDigest = (value) => canonicalDigest(value);

module.exports = { ANOMALY_RULES, METRIC_CATALOG, WINDOW_MS, assessDataQuality, calculateComponents, evaluateAnomalies, resolveWindow, safeRatio, snapshotDigest };
