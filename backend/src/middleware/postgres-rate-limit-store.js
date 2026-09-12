const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

class PostgresRateLimitStore {
  constructor({ prefix, client = prisma }) {
    this.prefix = prefix;
    this.client = client;
    this.localKeys = false;
    this.windowMs = 60_000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(rawKey) {
    const key = `${this.prefix}:${rawKey}`;
    const resetAt = new Date(Date.now() + this.windowMs);
    const [bucket] = await this.client.$queryRaw(Prisma.sql`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
      VALUES (${key}, 1, ${resetAt}, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= NOW() THEN EXCLUDED."resetAt"
          ELSE "RateLimitBucket"."resetAt"
        END,
        "updatedAt" = NOW()
      RETURNING "count", "resetAt"
    `);
    return { totalHits: bucket.count, resetTime: bucket.resetAt };
  }

  async decrement(rawKey) {
    const key = `${this.prefix}:${rawKey}`;
    await this.client.$executeRaw(Prisma.sql`
      UPDATE "RateLimitBucket"
      SET "count" = GREATEST("count" - 1, 0), "updatedAt" = NOW()
      WHERE "key" = ${key} AND "resetAt" > NOW()
    `);
  }

  async resetKey(rawKey) {
    await this.client.rateLimitBucket.deleteMany({ where: { key: `${this.prefix}:${rawKey}` } });
  }
}

module.exports = { PostgresRateLimitStore };
