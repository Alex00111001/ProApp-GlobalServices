const { z } = require('zod');

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const optionalText = (max = 128) => z.string().trim().min(1).max(max).optional();

const errorListQuerySchema = z.object({
  ...pagination,
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED']).optional(),
  severity: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']).optional(),
  service: optionalText(100),
  search: optionalText(128),
});
const incidentListQuerySchema = z.object({
  ...pagination,
  status: z.enum(['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED']).optional(),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  service: optionalText(100),
  search: optionalText(128),
});
const operationalListQuerySchema = z.object({
  ...pagination,
  search: optionalText(128),
});
const jobListQuerySchema = operationalListQuerySchema.extend({ status: z.enum(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER']).optional() });
const integrationListQuerySchema = operationalListQuerySchema.extend({ status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER']).optional() });
const alertListQuerySchema = operationalListQuerySchema.extend({ status: z.enum(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER']).optional() });
const healthSnapshotQuerySchema = z.object({ ...pagination, service: optionalText(100) });
const idSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(10).max(2_000);
const errorStatusSchema = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED']),
  reason: reasonSchema,
});
const incidentStatusSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED']),
  reason: reasonSchema,
});
const incidentCommentSchema = z.object({ body: z.string().trim().min(1).max(5_000) });
const supportCaseListQuerySchema = z.object({
  ...pagination,
  status: z.enum(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().uuid().optional(),
  search: optionalText(128),
});
const supportCaseCreateSchema = z.object({
  subject: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(10_000),
  category: z.enum(['ACCOUNT', 'BOOKING', 'PAYMENT', 'PROFESSIONAL', 'SAFETY', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  requesterUserId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
});
const supportCaseStatusSchema = z.object({
  status: z.enum(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']),
  reason: reasonSchema,
});
const supportCaseAssignmentSchema = z.object({ assignedToId: z.string().uuid().nullable(), reason: reasonSchema });
const supportCaseCommentSchema = z.object({ body: z.string().trim().min(1).max(5_000) });

module.exports = {
  errorListQuerySchema,
  errorStatusSchema,
  alertListQuerySchema,
  healthSnapshotQuerySchema,
  idSchema,
  incidentCommentSchema,
  incidentListQuerySchema,
  incidentStatusSchema,
  integrationListQuerySchema,
  jobListQuerySchema,
  operationalListQuerySchema,
  supportCaseAssignmentSchema,
  supportCaseCommentSchema,
  supportCaseCreateSchema,
  supportCaseListQuerySchema,
  supportCaseStatusSchema,
};
