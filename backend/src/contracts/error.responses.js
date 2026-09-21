const { z } = require('zod');

const safeErrorSchema = z.object({
  success: z.literal(false).optional(),
  error: z.string().min(1),
  message: z.string().min(1).optional(),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
  details: z.unknown().optional(),
  requestId: z.string().min(1).max(128).optional(),
  correlationId: z.string().min(1).max(128).optional(),
});

module.exports = { safeErrorSchema };
