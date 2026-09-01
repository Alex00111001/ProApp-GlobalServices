require('dotenv').config();

const { startTelemetry, shutdownTelemetry } = require('../modules/observability/telemetry');
startTelemetry();
const env = require('../config/env');
const prisma = require('../config/prisma');
const { logger } = require('../modules/observability/logger');
const {
  createConfiguredAlertAdapters,
  dispatchAlert,
} = require('../modules/observability/alerting.service');
const { processOutboxBatch } = require('../modules/events/outbox-processor.service');
const { runObservabilityRetention } = require('../modules/observability/retention.service');

const adapters = createConfiguredAlertAdapters();
let stopping = false;
let nextRetentionAt = 0;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const handleAlert = (event) => dispatchAlert(event.payload, adapters);

const run = async () => {
  logger.info('Observability worker started');
  while (!stopping) {
    if (Date.now() >= nextRetentionAt) {
      const retention = await runObservabilityRetention(prisma);
      logger.info(retention, 'Observability retention completed');
      nextRetentionAt = Date.now() + 86_400_000;
    }
    const created = await processOutboxBatch({
      eventType: 'incident.alert_requested',
      handler: handleAlert,
    }, prisma);
    const reopened = await processOutboxBatch({
      eventType: 'incident.reopened',
      handler: handleAlert,
    }, prisma);
    if (created.claimed + reopened.claimed === 0) await wait(env.observabilityWorkerPollMs);
  }
};

const stop = async (signal) => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Observability worker stopping');
  await prisma.$disconnect();
  await shutdownTelemetry();
};

for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => stop(signal));

run().catch(async (error) => {
  logger.fatal({ err: error }, 'Observability worker terminated unexpectedly');
  await stop('UNHANDLED_ERROR');
  process.exitCode = 1;
});
