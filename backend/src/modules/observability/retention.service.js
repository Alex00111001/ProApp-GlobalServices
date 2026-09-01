const env = require('../../config/env');

const runObservabilityRetention = async (client, now = new Date()) => {
  const database = client || require('../../config/prisma');
  const telemetryCutoff = new Date(now.getTime() - env.observabilityRetentionDays * 86_400_000);
  const auditCutoff = new Date(now.getTime() - env.observabilityAuditRetentionDays * 86_400_000);
  return database.$transaction(async (tx) => {
    const [events, snapshots, auditLogs] = await Promise.all([
      tx.errorEvent.deleteMany({ where: { occurredAt: { lt: telemetryCutoff } } }),
      tx.serviceHealthSnapshot.deleteMany({ where: { checkedAt: { lt: telemetryCutoff } } }),
      tx.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
    ]);
    return {
      errorEventsDeleted: events.count,
      healthSnapshotsDeleted: snapshots.count,
      auditLogsDeleted: auditLogs.count,
      completedAt: now.toISOString(),
    };
  });
};

module.exports = { runObservabilityRetention };
