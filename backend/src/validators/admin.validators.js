const { z } = require('zod');

const optionalQueryString = (max) => z.preprocess(
  (value) => value === '' || value === undefined ? undefined : value,
  z.string().trim().max(max).optional()
);

const positiveInteger = (fallback, maximum) => z.preprocess(
  (value) => value === undefined ? fallback : Number(value),
  z.number().int().min(1).max(maximum)
);

const paginationSchema = z.object({
  page: positiveInteger(1, 100_000),
  limit: positiveInteger(25, 100),
  search: optionalQueryString(120),
}).strict();

const dashboardQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
  timezone: z.string().trim().min(1).max(80).default('UTC'),
}).strict().superRefine((value, context) => {
  if (value.from && value.to && new Date(value.from) >= new Date(value.to)) {
    context.addIssue({ code: 'custom', message: '`from` must be before `to`.', path: ['from'] });
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format();
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid IANA timezone.', path: ['timezone'] });
  }
});

const userListQuerySchema = paginationSchema.extend({
  role: z.enum(['CLIENT', 'PROFESSIONAL', 'ADMIN']).optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
}).strict();

const professionalListQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ACTIVE', 'INACTIVE']).optional(),
}).strict();

const bookingListQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
}).strict();

const auditListQuerySchema = paginationSchema.extend({
  actorId: z.uuid().optional(),
  resourceType: optionalQueryString(80),
  action: optionalQueryString(120),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILURE']).optional(),
  correlationId: optionalQueryString(128),
}).strict();

const userStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(10).max(500),
}).strict();

const professionalStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED', 'ACTIVE', 'INACTIVE']),
  reason: z.string().trim().min(10).max(500),
}).strict();

const adminLoginSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
}).strict();

const revokeSessionSchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();
const roleChangeSchema = z.object({
  targetUserId: z.uuid(),
  roleId: z.uuid(),
  action: z.enum(['GRANT', 'REVOKE']),
  reason: z.string().trim().min(10).max(500),
  idempotencyKey: z.string().trim().min(12).max(120).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
const roleDecisionSchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();

module.exports = {
  adminLoginSchema,
  auditListQuerySchema,
  bookingListQuerySchema,
  dashboardQuerySchema,
  paginationSchema,
  professionalListQuerySchema,
  professionalStatusSchema,
  revokeSessionSchema,
  roleChangeSchema,
  roleDecisionSchema,
  userListQuerySchema,
  userStatusSchema,
};
