const { setTimeout: delay } = require('node:timers/promises');
const env = require('../config/env');
const prisma = require('../config/prisma');
const { logger } = require('../modules/observability/logger');
const { publishDueContent } = require('../modules/content/content.service');

if (!env.contentWorkerEnabled) throw new Error('CONTENT_WORKER_ENABLED must be true to start the content worker.');
let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });

const main = async () => {
  while (!stopping) {
    try {
      const result = await publishDueContent();
      logger.info({ examined: result.examined, published: result.published }, 'Content publication worker cycle completed');
    } catch (error) {
      logger.error({ err: error }, 'Content publication worker cycle failed');
    }
    if (!stopping) await delay(env.contentWorkerPollMs);
  }
  await prisma.$disconnect();
};

main().catch(async (error) => { logger.fatal({ err: error }, 'Content publication worker terminated'); await prisma.$disconnect(); process.exitCode = 1; });
