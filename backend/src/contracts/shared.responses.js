const { z } = require('zod');
const { outputObject } = require('../shared/http/response-contract');

const dateTime = z.string().datetime({ offset: true });
const messageResponse = outputObject({ message: z.string() });
const customerSession = outputObject({
  id: z.string().uuid(),
  status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']),
  expiresAt: dateTime,
  lastSeenAt: dateTime.nullable(),
  createdAt: dateTime,
  current: z.boolean(),
});
const pagination = outputObject({
  page: z.number().int().min(1), limit: z.number().int().min(1), total: z.number().int().nonnegative(), pages: z.number().int().nonnegative(),
});
const adminListResponse = (item) => outputObject({
  items: z.array(item),
  pagination: outputObject({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().min(1),
  }),
});

module.exports = { adminListResponse, customerSession, dateTime, messageResponse, pagination };
