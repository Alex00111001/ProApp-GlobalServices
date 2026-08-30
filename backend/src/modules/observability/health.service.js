const checkDependency = async (name, check) => {
  const started = Date.now();
  try {
    await check();
    return { service: name, status: 'HEALTHY', latencyMs: Date.now() - started };
  } catch (error) {
    return { service: name, status: 'OUTAGE', latencyMs: Date.now() - started, message: 'Dependency unavailable' };
  }
};

const getSystemHealth = async (prisma) => {
  const database = await checkDependency('database', () => prisma.$queryRaw`SELECT 1`);
  const dependencies = { api: { status: 'HEALTHY', latencyMs: 0 }, database };
  const status = Object.values(dependencies).some((item) => item.status === 'OUTAGE') ? 'OUTAGE' : 'HEALTHY';
  return { status, checkedAt: new Date().toISOString(), dependencies };
};

module.exports = { checkDependency, getSystemHealth };
