const prisma = require('../../config/prisma');
const { getReadiness } = require('../observability/health.service');

const pageResult = (page, limit, totalItems) => ({
  page,
  limit,
  totalItems,
  totalPages: Math.max(1, Math.ceil(totalItems / limit)),
});
const skipFor = (page, limit) => (page - 1) * limit;
const countsBy = (groups, key) => Object.fromEntries(groups.map((group) => [group[key], group._count._all]));
const decimal = (value) => value?.toFixed?.(2) || '0.00';
const alertEventTypes = ['incident.alert_requested', 'incident.reopened'];

const getOperationsOverview = async (client = prisma) => {
  const [
    health,
    errorsByStatus,
    incidentsByStatus,
    jobsByStatus,
    integrationsByStatus,
    supportByStatus,
    failedRefunds,
    failedPayouts,
    activeDisputes,
    latestReconciliation,
    latestError,
    latestIncident,
  ] = await Promise.all([
    getReadiness(client, { persist: true }),
    client.errorGroup.groupBy({ by: ['status'], _count: { _all: true } }),
    client.incident.groupBy({ by: ['status'], _count: { _all: true } }),
    client.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
    client.integrationEvent.groupBy({ by: ['status'], _count: { _all: true } }),
    client.supportCase.groupBy({ by: ['status'], _count: { _all: true } }),
    client.refund.count({ where: { status: 'FAILED' } }),
    client.payout.count({ where: { status: 'FAILED' } }),
    client.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    client.reconciliationRun.findFirst({
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, scope: true, startedAt: true, completedAt: true, matchedCount: true, mismatchCount: true, errorCount: true },
    }),
    client.errorGroup.findFirst({ orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }),
    client.incident.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    health,
    errors: countsBy(errorsByStatus, 'status'),
    incidents: countsBy(incidentsByStatus, 'status'),
    jobs: countsBy(jobsByStatus, 'status'),
    integrations: countsBy(integrationsByStatus, 'status'),
    support: countsBy(supportByStatus, 'status'),
    financialAttention: { failedRefunds, failedPayouts, activeDisputes, latestReconciliation },
    freshness: {
      latestErrorAt: latestError?.lastSeenAt || null,
      latestIncidentAt: latestIncident?.updatedAt || null,
      partialData: health.status !== 'HEALTHY',
    },
  };
};

const listErrorGroups = async ({ page, limit, status, severity, service, search }, client = prisma) => {
  const where = {
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(service ? { service } : {}),
    ...(search ? { OR: [
      { fingerprint: { contains: search, mode: 'insensitive' } },
      { errorCode: { contains: search, mode: 'insensitive' } },
      { normalizedMessage: { contains: search, mode: 'insensitive' } },
    ] } : {}),
  };
  const [items, totalItems] = await Promise.all([
    client.errorGroup.findMany({
      where,
      skip: skipFor(page, limit),
      take: limit,
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, fingerprint: true, severity: true, environment: true, service: true, module: true,
        operation: true, errorCode: true, normalizedMessage: true, status: true, firstSeenAt: true,
        lastSeenAt: true, occurrenceCount: true, windowStartedAt: true, windowOccurrenceCount: true,
        _count: { select: { events: true, incidents: true } },
      },
    }),
    client.errorGroup.count({ where }),
  ]);
  return { items, pagination: pageResult(page, limit, totalItems) };
};

const getErrorGroup = (id, client = prisma) => client.errorGroup.findUnique({
  where: { id },
  select: {
    id: true, fingerprint: true, severity: true, environment: true, service: true, module: true,
    operation: true, errorCode: true, normalizedMessage: true, status: true, firstSeenAt: true,
    lastSeenAt: true, occurrenceCount: true, windowStartedAt: true, windowOccurrenceCount: true,
    events: {
      take: 100,
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true, severity: true, httpStatus: true, endpoint: true, method: true, requestId: true,
        correlationId: true, traceId: true, appVersion: true, occurredAt: true,
      },
    },
    incidents: { take: 20, orderBy: { detectedAt: 'desc' }, select: { id: true, title: true, status: true, severity: true, detectedAt: true, resolvedAt: true } },
  },
});

const listIncidents = async ({ page, limit, status, severity, service, search }, client = prisma) => {
  const where = {
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(service ? { service } : {}),
    ...(search ? { OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { deduplicationKey: { contains: search, mode: 'insensitive' } },
    ] } : {}),
  };
  const [items, totalItems] = await Promise.all([
    client.incident.findMany({
      where,
      skip: skipFor(page, limit),
      take: limit,
      orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, title: true, description: true, status: true, severity: true, service: true,
        detectedAt: true, acknowledgedAt: true, resolvedAt: true, closedAt: true, updatedAt: true,
        errorGroup: { select: { id: true, fingerprint: true, errorCode: true, occurrenceCount: true } },
        _count: { select: { events: true, comments: true } },
      },
    }),
    client.incident.count({ where }),
  ]);
  return { items, pagination: pageResult(page, limit, totalItems) };
};

const getIncident = (id, client = prisma) => client.incident.findUnique({
  where: { id },
  select: {
    id: true, title: true, description: true, status: true, severity: true, service: true,
    detectedAt: true, acknowledgedAt: true, resolvedAt: true, closedAt: true, createdAt: true, updatedAt: true,
    errorGroup: { select: { id: true, fingerprint: true, severity: true, status: true, errorCode: true, normalizedMessage: true, occurrenceCount: true, lastSeenAt: true } },
    events: { take: 200, orderBy: { createdAt: 'desc' }, select: { id: true, eventType: true, message: true, createdAt: true, errorEventId: true } },
    comments: {
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: { id: true, body: true, createdAt: true, updatedAt: true, author: { select: { id: true, firstName: true, lastName: true } } },
    },
  },
});

const listHealthSnapshots = async ({ page, limit, service }, client = prisma) => {
  const where = service ? { service } : {};
  const [items, totalItems] = await Promise.all([
    client.serviceHealthSnapshot.findMany({ where, skip: skipFor(page, limit), take: limit, orderBy: { checkedAt: 'desc' }, select: { id: true, service: true, status: true, latencyMs: true, message: true, checkedAt: true } }),
    client.serviceHealthSnapshot.count({ where }),
  ]);
  return { items, pagination: pageResult(page, limit, totalItems) };
};

const listJobs = async ({ page, limit, status, search }, client = prisma) => {
  const where = {
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ eventType: { contains: search, mode: 'insensitive' } }, { aggregateType: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [rows, totalItems] = await Promise.all([
    client.outboxEvent.findMany({ where, skip: skipFor(page, limit), take: limit, orderBy: { createdAt: 'desc' }, select: { id: true, aggregateType: true, eventType: true, status: true, attempts: true, availableAt: true, lockedAt: true, processedAt: true, createdAt: true, lastError: true } }),
    client.outboxEvent.count({ where }),
  ]);
  return { items: rows.map(({ lastError, ...item }) => ({ ...item, hasError: Boolean(lastError) })), pagination: pageResult(page, limit, totalItems) };
};

const listIntegrations = async ({ page, limit, status, search }, client = prisma) => {
  const where = {
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ provider: { contains: search, mode: 'insensitive' } }, { eventType: { contains: search, mode: 'insensitive' } }, { correlationId: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [rows, totalItems] = await Promise.all([
    client.integrationEvent.findMany({ where, skip: skipFor(page, limit), take: limit, orderBy: { receivedAt: 'desc' }, select: { id: true, provider: true, eventType: true, status: true, attempts: true, correlationId: true, receivedAt: true, processingStartedAt: true, processedAt: true, updatedAt: true, lastError: true } }),
    client.integrationEvent.count({ where }),
  ]);
  return { items: rows.map(({ lastError, ...item }) => ({ ...item, hasError: Boolean(lastError) })), pagination: pageResult(page, limit, totalItems) };
};

const listAlertDeliveries = async ({ page, limit, status }, client = prisma) => {
  const where = { eventType: { in: alertEventTypes }, ...(status ? { status } : {}) };
  const [rows, totalItems] = await Promise.all([
    client.outboxEvent.findMany({ where, skip: skipFor(page, limit), take: limit, orderBy: { createdAt: 'desc' }, select: { id: true, aggregateId: true, eventType: true, status: true, attempts: true, availableAt: true, processedAt: true, createdAt: true, payload: true, lastError: true } }),
    client.outboxEvent.count({ where }),
  ]);
  return {
    items: rows.map(({ payload, lastError, ...item }) => ({
      ...item,
      route: typeof payload === 'object' && payload ? payload.route || null : null,
      severity: typeof payload === 'object' && payload ? payload.severity || null : null,
      hasError: Boolean(lastError),
    })),
    pagination: pageResult(page, limit, totalItems),
  };
};

const getFinancialMonitoring = async (client = prisma) => {
  const [refunds, payouts, disputes, latestRuns] = await Promise.all([
    client.refund.groupBy({ by: ['status', 'currency'], _count: { _all: true }, _sum: { totalAmount: true } }),
    client.payout.groupBy({ by: ['status', 'currency'], _count: { _all: true }, _sum: { amount: true } }),
    client.dispute.groupBy({ by: ['status', 'currency'], _count: { _all: true }, _sum: { amount: true, recoveredAmount: true } }),
    client.reconciliationRun.findMany({ take: 20, orderBy: { startedAt: 'desc' }, select: { id: true, status: true, scope: true, startedAt: true, completedAt: true, matchedCount: true, mismatchCount: true, errorCount: true } }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    refunds: refunds.map((row) => ({ status: row.status, currency: row.currency, count: row._count._all, amount: decimal(row._sum.totalAmount) })),
    payouts: payouts.map((row) => ({ status: row.status, currency: row.currency, count: row._count._all, amount: decimal(row._sum.amount) })),
    disputes: disputes.map((row) => ({ status: row.status, currency: row.currency, count: row._count._all, amount: decimal(row._sum.amount), recoveredAmount: decimal(row._sum.recoveredAmount) })),
    reconciliationRuns: latestRuns,
  };
};

module.exports = {
  getErrorGroup,
  getFinancialMonitoring,
  getIncident,
  getOperationsOverview,
  listAlertDeliveries,
  listErrorGroups,
  listHealthSnapshots,
  listIncidents,
  listIntegrations,
  listJobs,
};
