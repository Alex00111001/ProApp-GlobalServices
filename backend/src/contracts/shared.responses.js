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

module.exports = { customerSession, dateTime, messageResponse };
