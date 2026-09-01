const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { logger } = require('../modules/observability/logger');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured before starting the API.');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (event) => logger.error({
  err: { name: 'PrismaError', message: event.message },
  target: event.target,
}, 'Database client error'));
prisma.$on('warn', (event) => logger.warn({ target: event.target }, 'Database client warning'));

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
