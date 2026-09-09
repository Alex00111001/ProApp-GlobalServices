const { z } = require('zod');

const marketCode = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{1,15}$/);
const uuid = z.string().uuid();
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(50);

const registrationSchemaQuery = z.object({
  actorType: z.enum(['CLIENT', 'PROFESSIONAL']).default('CLIENT'),
  locale: z.string().trim().min(2).max(35).optional(),
}).strict();

const divisionQuery = z.object({
  parentId: uuid.optional(),
  type: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,63}$/).optional(),
  page,
  limit,
}).strict();

const identityDocumentBody = z.object({
  marketCode,
  schemaVersion: z.string().trim().min(5).max(120),
  type: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  value: z.string().trim().min(5).max(64),
}).strict();

const addressBody = z.object({
  marketCode,
  schemaVersion: z.string().trim().min(5).max(120),
  purpose: z.enum(['CLIENT_CONTACT', 'PROFESSIONAL_DOMICILE', 'BOOKING_SERVICE', 'BILLING']),
  line1: z.string().trim().min(1).max(200).optional(),
  line2: z.string().trim().max(200).optional(),
  locality: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(32).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  divisionIds: z.array(uuid).min(1).max(12),
  isPrimary: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) context.addIssue({ code: 'custom', message: 'Latitude and longitude must be supplied together.' });
});

const serviceAreaBody = z.object({
  marketCode,
  schemaVersion: z.string().trim().min(5).max(120),
  divisionId: uuid,
}).strict();

const marketStatusBody = z.object({
  status: z.enum(['DISABLED', 'READY', 'ACTIVE', 'SUSPENDED', 'RETIRED']),
  reason: z.string().trim().min(8).max(500),
}).strict();

const adminListQuery = z.object({ page, limit, status: z.enum(['DRAFT', 'DISABLED', 'READY', 'ACTIVE', 'SUSPENDED', 'RETIRED']).optional() }).strict();
const adminDivisionQuery = z.object({
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  parentId: uuid.optional(),
  type: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,63}$/).optional(),
  lifecycle: z.enum(['ACTIVE', 'DEPRECATED', 'DISABLED']).optional(),
  page,
  limit,
}).strict();
const identityPolicyListQuery = z.object({
  marketCode: marketCode.optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'RETIRED']).optional(),
  reviewStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page,
  limit,
}).strict();
const identityPolicyReviewBody = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(8).max(500),
}).strict();
const identityPolicyStatusBody = z.object({
  status: z.enum(['ACTIVE', 'RETIRED']),
  reason: z.string().trim().min(8).max(500),
}).strict();
const adminIdentityDocumentQuery = z.object({ userId: uuid, page, limit }).strict();

const geographyRecord = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  type: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  level: z.number().int().min(1).max(12),
  parentCode: z.string().trim().min(1).max(64).optional(),
  displayNames: z.record(z.string().max(35), z.string().max(200)).optional(),
}).strict();

const sourceArtifact = z.object({
  url: z.string().url().max(500),
  mediaType: z.string().trim().min(3).max(120),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const geographyImportBody = z.object({
  countryCode: z.enum(['ES', 'BR', 'CL']),
  sourceKey: z.enum(['INE_ES', 'IBGE_DTB', 'INE_CL_SUBDERE']),
  sourceUrl: z.string().url().max(500),
  sourceVersion: z.string().trim().min(1).max(80),
  referenceDate: z.coerce.date(),
  retrievedAt: z.coerce.date(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.string().trim().min(1).max(80),
  completeSnapshot: z.boolean().default(false),
  sourceArtifacts: z.array(sourceArtifact).min(1).max(5),
  records: z.array(geographyRecord).min(1).max(10000),
}).strict();

module.exports = {
  addressBody,
  adminDivisionQuery,
  adminIdentityDocumentQuery,
  adminListQuery,
  divisionQuery,
  geographyImportBody,
  identityDocumentBody,
  identityPolicyListQuery,
  identityPolicyReviewBody,
  identityPolicyStatusBody,
  marketCode,
  marketStatusBody,
  registrationSchemaQuery,
  serviceAreaBody,
  uuid,
};
