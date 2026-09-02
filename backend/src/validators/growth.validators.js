const { z } = require('zod');

const eventId = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const sourceId = z.string().min(1).max(128);
const optionalText = (max) => z.string().trim().min(1).max(max).optional();
const countryCode = z.string().trim().length(2).transform((value) => value.toUpperCase());
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const reason = z.string().trim().min(10).max(2_000);

const eventSchema = z.object({
  eventId: eventId.optional(),
  eventName: z.string().trim().min(1).max(100),
  occurredAt: z.iso.datetime().optional(),
  bookingId: z.uuid().optional(),
  sessionId: sourceId.optional(),
  anonymousId: sourceId.optional(),
  source: optionalText(64),
  channel: optionalText(64),
  campaign: optionalText(128),
  utm: z.object({
    source: optionalText(128),
    medium: optionalText(128),
    campaign: optionalText(128),
    content: optionalText(128),
    term: optionalText(128),
  }).strict().optional(),
  device: z.record(z.string(), z.unknown()).optional(),
  appVersion: optionalText(64),
  geography: z.object({ countryCode: countryCode.optional() }).catchall(z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

const rangeQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
  campaignId: z.uuid().optional(),
  countryCode: countryCode.optional(),
});

const campaignCreateSchema = z.object({
  key: z.string().trim().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(160),
  source: z.string().trim().min(1).max(64),
  medium: optionalText(64),
  channel: optionalText(64),
  countryCode: countryCode.optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  reason,
}).strict();

const campaignUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  source: optionalText(64),
  medium: z.string().trim().min(1).max(64).nullable().optional(),
  channel: z.string().trim().min(1).max(64).nullable().optional(),
  countryCode: countryCode.nullable().optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  reason,
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'At least one campaign field is required.' });

const campaignStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']),
  reason,
}).strict();

const campaignListQuerySchema = z.object({
  ...pagination,
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  search: optionalText(128),
  countryCode: countryCode.optional(),
});
const leadListQuerySchema = z.object({
  ...pagination,
  status: z.enum(['NEW', 'ENGAGED', 'CONVERTED', 'DISQUALIFIED']).optional(),
  campaignId: z.uuid().optional(),
  countryCode: countryCode.optional(),
});
const conversionListQuerySchema = z.object({
  ...pagination,
  type: z.enum(['SIGNUP', 'REQUEST', 'BOOKING', 'PAYMENT', 'JOB_COMPLETED']).optional(),
  campaignId: z.uuid().optional(),
  countryCode: countryCode.optional(),
});

module.exports = {
  campaignCreateSchema,
  campaignListQuerySchema,
  campaignStatusSchema,
  campaignUpdateSchema,
  conversionListQuerySchema,
  eventSchema,
  leadListQuerySchema,
  rangeQuerySchema,
};
