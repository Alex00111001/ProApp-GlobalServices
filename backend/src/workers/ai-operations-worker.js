const { setTimeout: delay } = require('node:timers/promises');
const env = require('../config/env');
const prisma = require('../config/prisma');
const { logger } = require('../modules/observability/logger');
const { runExecutionCycle } = require('../modules/ai-operations/ai-operations.service');

if (!env.aiOperationsWorkerEnabled) throw new Error('AI_OPERATIONS_WORKER_ENABLED must be true to start the AI Operations worker.');
if (!env.aiProviderExecutionEnabled) throw new Error('AI_PROVIDER_EXECUTION_ENABLED must be true to start the AI Operations worker.');

let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });

const main = async () => {
  while (!stopping) {
    try { logger.info({ result: await runExecutionCycle() }, 'AI Operations worker cycle completed'); }
    catch (error) { logger.error({ err: error }, 'AI Operations worker cycle failed'); }
    if (!stopping) await delay(env.aiOperationsWorkerPollMs);
  }
  await prisma.$disconnect();
};

main().catch(async (error) => { logger.fatal({ err: error }, 'AI Operations worker terminated'); await prisma.$disconnect(); process.exitCode = 1; });
