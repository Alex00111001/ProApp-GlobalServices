const { z } = require('zod');
const { annotateInputSemantics } = require('../shared/http/input-contract');
const { trimmedString, declareTrimmedInput } = require('../shared/http/input-normalization');
const { authEmailPattern } = require('./auth-email-pattern');

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

const projectedPaginationSchema = paginationSchema.extend({
  page: z.coerce.number().int().min(1).max(100_000).optional().transform((value) => value ?? 1),
  limit: z.coerce.number().int().min(1).max(100).optional().transform((value) => value ?? 25),
});
const paginationEvidence = {
  classes: ['NORMALIZATION', 'TRANSFORM'],
  evidence: ['backend/test/integration/admin-postgres.test.js'],
  semantics: [
    'Omitted page and limit default to 1 and 25. Empty or repeated values fail.',
    'Express decodes query values before number coercion. Noncanonical numeric spellings can be accepted.',
    'Unknown query keys, including bracketed pagination keys, are rejected.',
  ],
};

const bookingListQuerySchema = annotateInputSemantics(projectedPaginationSchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
}).strict(), paginationEvidence);

const auditListQuerySchema = annotateInputSemantics(projectedPaginationSchema.extend({
  actorId: z.uuid().optional(),
  resourceType: optionalQueryString(80),
  action: optionalQueryString(120),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILURE']).optional(),
  correlationId: optionalQueryString(128),
}).strict(), paginationEvidence);

const userStatusSchema = z.object({
  isActive: z.boolean(),
  reason: trimmedString(10, 500),
}).strict();

const professionalStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED', 'ACTIVE', 'INACTIVE']),
  reason: trimmedString(10, 500),
}).strict();

const adminLoginSchema = z.object({
  email: z.email({ pattern: authEmailPattern }).max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
}).strict();

const revokeSessionSchema = z.object({ reason: trimmedString(10, 500) }).strict();
const roleChangeSchema = z.object({
  targetUserId: z.uuid(),
  roleId: z.uuid(),
  action: z.enum(['GRANT', 'REVOKE']),
  reason: z.string().trim().min(10).max(500),
  idempotencyKey: z.string().trim().min(12).max(120).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
const roleDecisionSchema = z.object({ reason: trimmedString(10, 500) }).strict();

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

// T01: reviewed wire acceptance for these mounted object validators only.
declareTrimmedInput(userStatusSchema, 'trim.admin.validators.userStatusSchema');
declareTrimmedInput(professionalStatusSchema, 'trim.admin.validators.professionalStatusSchema');
declareTrimmedInput(revokeSessionSchema, 'trim.admin.validators.revokeSessionSchema');
declareTrimmedInput(roleDecisionSchema, 'trim.admin.validators.roleDecisionSchema');
