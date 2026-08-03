import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  datasources: {
    db: {
      provider: 'postgresql',
      url: env('DATABASE_URL'),
    },
  },
});
