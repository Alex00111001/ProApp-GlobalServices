const { setTimeout: delay } = require('node:timers/promises');
const env = require('../config/env');
const prisma = require('../config/prisma');
const { logger } = require('../modules/observability/logger');
const { runAutomationCycle } = require('../modules/automation/automation-execution.service');

if (!env.automationWorkerEnabled) throw new Error('AUTOMATION_WORKER_ENABLED must be true to start the automation worker.');

let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });

const main = async () => {
  while (!stopping) {
    try {
      const result = await runAutomationCycle();
      logger.info({ result }, 'Automation worker cycle completed');
    } catch (error) {
      logger.error({ err: error }, 'Automation worker cycle failed');
    }
    if (!stopping) await delay(env.automationWorkerPollMs);
  }
  await prisma.$disconnect();
};

main().catch(async (error) => { logger.fatal({ err: error }, 'Automation worker terminated'); await prisma.$disconnect(); process.exitCode = 1; });
