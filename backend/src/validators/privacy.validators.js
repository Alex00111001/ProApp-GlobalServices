const { z } = require('zod');

const idempotencyKey = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const countryCode = z.string().trim().length(2).transform((value) => value.toUpperCase());
const locale = z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);
const identifier = z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const source = z.string().trim().min(2).max(64).regex(/^[A-Z0-9_:-]+$/);
const reason = z.string().trim().min(10).max(2_000);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(25);

const policyQuerySchema = z.object({
  countryCode,
  locale,
  purposes: z.string().trim().max(500).optional().transform((value) => value ? [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))] : undefined),
}).strict();

const identityProofSchema = z.object({ anonymousId: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/) }).strict();
const reconciliationSchema = z.object({ proof: z.string().trim().min(40).max(2_000) }).strict();

const consentDecisionSchema = z.object({
  idempotencyKey,
  policyId: z.uuid(),
  policyVersion: z.number().int().positive(),
  purpose: identifier,
  countryCode,
  locale,
  decision: z.enum(['GRANTED', 'DENIED']),
  source,
  evidence: z.record(z.string(), z.unknown()).optional(),
  identityProof: z.string().trim().min(40).max(2_000).optional(),
}).strict();

const withdrawalSchema = z.object({
  idempotencyKey,
  purpose: identifier,
  source,
  evidence: z.record(z.string(), z.unknown()).optional(),
  identityProof: z.string().trim().min(40).max(2_000).optional(),
}).strict();

const consentHistoryQuerySchema = z.object({ page, limit, purpose: identifier.optional() }).strict();

const touchpointSchema = z.object({
  idempotencyKey,
  purpose: identifier,
  countryCode,
  locale,
  policyId: z.uuid(),
  policyVersion: z.number().int().positive(),
  identityProof: z.string().trim().min(40).max(2_000).optional(),
  source: identifier,
  medium: identifier.optional(),
  channel: identifier.optional(),
  referrer: z.string().trim().max(2_000).optional(),
  landingUrl: z.string().trim().max(2_000).optional(),
  occurredAt: z.iso.datetime().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
}).strict();

const policyCreateSchema = z.object({
  key: identifier,
  purpose: identifier,
  version: z.number().int().positive(),
  countryCode,
  locale,
  legalBasis: identifier,
  enforcementMode: z.enum(['EXPLICIT_GRANT', 'POLICY_ONLY', 'PROHIBITED']),
  documentReference: z.string().trim().min(8).max(500),
  documentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
  reason,
}).strict();

const policyUpdateSchema = z.object({
  legalBasis: identifier.optional(),
  enforcementMode: z.enum(['EXPLICIT_GRANT', 'POLICY_ONLY', 'PROHIBITED']).optional(),
  documentReference: z.string().trim().min(8).max(500).optional(),
  documentDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
  reason,
}).strict().refine((input) => Object.keys(input).some((key) => key !== 'reason'), { message: 'At least one policy field is required.' });

const policyReviewSchema = z.object({
  reviewStatus: z.enum(['APPROVED', 'REJECTED']),
  reviewReference: z.string().trim().min(8).max(500),
  reason,
}).strict();

const statusSchema = (values) => z.object({ status: z.enum(values), effectiveAt: z.iso.datetime().optional(), reason }).strict();
const policyStatusSchema = statusSchema(['ACTIVE', 'RETIRED']);
const modelStatusSchema = statusSchema(['ACTIVE', 'RETIRED']);

const modelCreateSchema = z.object({
  key: identifier,
  version: z.number().int().positive(),
  name: z.string().trim().min(2).max(160),
  type: z.enum(['FIRST_TOUCH', 'LAST_TOUCH']),
  purpose: identifier,
  windowDays: z.number().int().min(1).max(366),
  reason,
}).strict();

const modelUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  type: z.enum(['FIRST_TOUCH', 'LAST_TOUCH']).optional(),
  purpose: identifier.optional(),
  windowDays: z.number().int().min(1).max(366).optional(),
  reason,
}).strict().refine((input) => Object.keys(input).some((key) => key !== 'reason'), { message: 'At least one model field is required.' });

const adminListQuerySchema = z.object({
  page, limit,
  purpose: identifier.optional(),
  status: z.string().trim().max(40).optional(),
  countryCode: countryCode.optional(),
  locale: locale.optional(),
  modelId: z.uuid().optional(),
  conversionId: z.uuid().optional(),
}).strict();

module.exports = {
  adminListQuerySchema,
  consentDecisionSchema,
  consentHistoryQuerySchema,
  identityProofSchema,
  modelCreateSchema,
  modelStatusSchema,
  modelUpdateSchema,
  policyCreateSchema,
  policyQuerySchema,
  policyReviewSchema,
  policyStatusSchema,
  policyUpdateSchema,
  reconciliationSchema,
  touchpointSchema,
  withdrawalSchema,
};
