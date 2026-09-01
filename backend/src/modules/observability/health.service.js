const env = require('../../config/env');
const { observeDependency, setOutboxDepth } = require('./metrics');

const timeoutError = () => Object.assign(new Error('Dependency check timed out'), { code: 'HEALTH_TIMEOUT' });

const withTimeout = (operation, timeoutMs) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(timeoutError()), timeoutMs);
  Promise.resolve()
    .then(operation)
    .then(resolve, reject)
    .finally(() => clearTimeout(timer));
});

const checkDependency = async (name, check, options = {}) => {
  const started = Date.now();
  const timeoutMs = options.timeoutMs || env.observabilityHealthTimeoutMs;
  try {
    const details = await withTimeout(check, timeoutMs);
    const result = {
      service: name,
      status: details?.status || 'HEALTHY',
      latencyMs: Date.now() - started,
      ...(details?.message ? { message: details.message } : {}),
    };
    observeDependency({ dependency: name, status: result.status, latencyMs: result.latencyMs });
    return result;
  } catch {
    const result = {
      service: name,
      status: 'OUTAGE',
      latencyMs: Date.now() - started,
      message: 'Dependency unavailable',
    };
    observeDependency({ dependency: name, status: result.status, latencyMs: result.latencyMs });
    return result;
  }
};

const getLiveness = () => ({
  status: 'HEALTHY',
  checkedAt: new Date().toISOString(),
  service: 'homeservices-core-api',
});

const checkOutbox = async (prisma) => {
  const [groups, staleLeases] = await Promise.all([
    prisma.outboxEvent.groupBy({
      by: ['status'],
      where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED', 'DEAD_LETTER'] } },
      _count: { _all: true },
    }),
    prisma.outboxEvent.count({
      where: {
        status: 'PROCESSING',
        lockedAt: { lt: new Date(Date.now() - 5 * 60_000) },
      },
    }),
  ]);
  const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  setOutboxDepth(counts);
  if ((counts.DEAD_LETTER || 0) > 0 || staleLeases > 0) {
    return { status: 'DEGRADED', message: 'Asynchronous processing requires attention' };
  }
  return { status: 'HEALTHY' };
};

const persistSnapshots = async (prisma, dependencies) => prisma.serviceHealthSnapshot.createMany({
  data: Object.values(dependencies).map(({ service, status, latencyMs, message }) => ({
    service,
    status,
    latencyMs,
    message,
  })),
});

const getReadiness = async (prisma, options = {}) => {
  const [database, outbox] = await Promise.all([
    checkDependency('database', () => prisma.$queryRaw`SELECT 1`),
    checkDependency('outbox', () => checkOutbox(prisma)),
  ]);
  const dependencies = { database, outbox };
  const status = Object.values(dependencies).some((item) => item.status === 'OUTAGE')
    ? 'OUTAGE'
    : Object.values(dependencies).some((item) => item.status === 'DEGRADED')
      ? 'DEGRADED'
      : 'HEALTHY';
  if (options.persist && database.status === 'HEALTHY') await persistSnapshots(prisma, dependencies);
  return {
    status,
    checkedAt: new Date().toISOString(),
    service: 'homeservices-core-api',
    dependencies,
  };
};

const getSystemHealth = getReadiness;

module.exports = {
  checkDependency,
  checkOutbox,
  getLiveness,
  getReadiness,
  getSystemHealth,
  persistSnapshots,
  withTimeout,
};
