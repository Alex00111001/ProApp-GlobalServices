const { z } = require('zod');

const uuid = z.string().uuid();
const key = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/);
const marketCode = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{1,15}$/);
const locale = z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).max(35);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(50);
const boundedReason = z.string().trim().min(8).max(500);
const date = z.coerce.date();

const experimentCreateBody = z.object({ key, name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).optional(), marketCode, layerKey: key, surface: key, featureFlagKey: key, trafficAllocationBps: z.number().int().min(0).max(10_000).default(0) }).strict();
const experimentVersionBody = z.object({
  purpose: key, startAt: date.optional(), endAt: date.optional(), analysisAt: date.optional(), timezone: z.string().trim().min(3).max(64), minimumSampleSize: z.number().int().min(10).max(10_000_000), significanceAlpha: z.number().gt(0).lt(0.5).default(0.05),
  audience: z.unknown().nullable().optional(), variants: z.array(z.unknown()).min(2).max(10), metrics: z.array(z.unknown()).min(1).max(20),
}).strict().superRefine((value, context) => { if (value.startAt && value.endAt && value.endAt <= value.startAt) context.addIssue({ code: 'custom', message: 'endAt must be after startAt' }); });
const experimentStatusBody = z.object({ status: z.enum(['DRAFT', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED']), reason: boundedReason }).strict();
const experimentListQuery = z.object({ page, limit, status: z.enum(['DRAFT', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(), marketId: uuid.optional() }).strict();
const assignmentBody = z.object({ marketCode, locale, anonymousProof: z.string().max(2000).optional() }).strict();
const exposureBody = z.object({ assignmentId: uuid, eventId: z.string().uuid(), surface: key, anonymousProof: z.string().max(2000).optional(), context: z.record(z.string(), z.unknown()).optional() }).strict();
const resultsBody = z.object({ windowStart: date, windowEnd: date }).strict().refine((value) => value.windowEnd > value.windowStart && value.windowEnd.getTime() - value.windowStart.getTime() <= 366 * 86400000, 'Results window must be positive and bounded to 366 days.');

const contentTypes = ['LANDING_PAGE', 'CATEGORY_PAGE', 'SERVICE_PAGE', 'LOCATION_PAGE', 'HELP_FAQ', 'CAMPAIGN_LANDING', 'SEO_METADATA_BLOCK'];
const contentEntryBody = z.object({ key, type: z.enum(contentTypes), marketCode }).strict();
const contentVersionBody = z.object({ locale, slug: z.string().min(1).max(120), title: z.string().max(160), summary: z.string().max(500), body: z.unknown(), seoTitle: z.string().max(65), metaDescription: z.string().max(170), robotsDirective: z.enum(['index,follow', 'noindex,follow', 'noindex,nofollow']).default('noindex,nofollow'), openGraph: z.record(z.string(), z.unknown()).optional(), structuredData: z.record(z.string(), z.unknown()).optional(), qualityEvidence: z.record(z.string(), z.unknown()), provenance: z.record(z.string(), z.unknown()).optional(), categoryId: uuid.optional(), serviceId: uuid.optional(), divisionId: uuid.optional() }).strict();
const contentListQuery = z.object({ page, limit, status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'RETIRED']).optional(), type: z.enum(contentTypes).optional(), marketId: uuid.optional() }).strict();
const reviewBody = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: boundedReason }).strict();
const publishBody = z.object({ publishAt: date, expiresAt: date.optional() }).strict().refine((value) => !value.expiresAt || value.expiresAt > value.publishAt, 'expiresAt must be after publishAt');
const retireBody = z.object({ reason: boundedReason }).strict();
const redirectBody = z.object({ sourcePath: z.string().max(240), targetPath: z.string().max(240), httpStatus: z.enum([301, 308, 410]), reason: boundedReason, contentEntryId: uuid.optional() }).strict();
const redirectQuery = z.object({ path: z.string().max(240) }).strict();
const redirectListQuery = z.object({ page, limit, status: z.enum(['ACTIVE', 'RETIRED']).optional() }).strict();
const publicContentParams = z.object({ marketCode, locale, type: z.enum(contentTypes), slug: z.string().min(1).max(120) }).strict();
const sitemapParams = z.object({ marketCode, locale }).strict();

module.exports = { assignmentBody, contentEntryBody, contentListQuery, contentVersionBody, experimentCreateBody, experimentListQuery, experimentStatusBody, experimentVersionBody, exposureBody, limit, page, publicContentParams, publishBody, redirectBody, redirectListQuery, redirectQuery, resultsBody, retireBody, reviewBody, sitemapParams, uuid };
