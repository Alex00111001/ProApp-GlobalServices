require('dotenv').config();
const { shutdownTelemetry, startTelemetry } = require('./modules/observability/telemetry');

startTelemetry();
const env = require('./config/env');
const app = require('./app');
const prisma = require('./config/prisma');
const { logger } = require('./modules/observability/logger');

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, 'Services Platform API listening');
});

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  const forceExit = setTimeout(() => {
    logger.fatal({ signal }, 'Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  server.close(async (error) => {
    try {
      await prisma.$disconnect();
      await shutdownTelemetry();
      clearTimeout(forceExit);
      if (error) throw error;
      process.exit(0);
    } catch (shutdownError) {
      logger.error({ err: shutdownError }, 'Graceful shutdown failed');
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
