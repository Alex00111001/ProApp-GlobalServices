const { PrismaClient } = require('@prisma/client');
   const { PrismaPg } = require('@prisma/adapter-pg');
   const pg = require('pg');
   require('dotenv').config();

   const connectionString = process.env.DATABASE_URL;

   if (!connectionString) {
     throw new Error('DATABASE_URL no está definida en el archivo .env');
   }

   const pool = new pg.Pool({ 
     connectionString,
     max: 10,
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });

   const adapter = new PrismaPg(pool);
   const prisma = new PrismaClient({ adapter });

   module.exports = prisma;