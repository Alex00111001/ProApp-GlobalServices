// scripts/test-prisma.js
require('dotenv').config();
// Disable strict TLS validation for this quick test (not for production)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    const res = await prisma.$queryRaw`SELECT 1 AS result`;
    console.log('Prisma test OK:', res);
    process.exit(0);
  } catch (err) {
    console.error('Prisma test FAILED:');
    console.error(err);
    process.exit(1);
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
