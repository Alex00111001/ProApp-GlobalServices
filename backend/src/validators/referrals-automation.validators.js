const { z } = require('zod');

const identifier = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/);
const reason = z.string().trim().min(10).max(2_000);
const market = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const dateTime = z.string().datetime({ offset: true });
const money = z.coerce.number().finite().positive().max(1_000_000);

const adminListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().trim().max(40).optional(),
  market: market.optional(),
  search: z.string().trim().max(80).optional(),
  from: dateTime.optional(),
  to: dateTime.optional(),
}).strict().superRefine((value, context) => {
  if (value.from && value.to && new Date(value.to) <= new Date(value.from)) context.addIssue({ code: 'custom', path: ['to'], message: 'to must be after from' });
  if (value.from && value.to && new Date(value.to) - new Date(value.from) > 366 * 86_400_000) context.addIssue({ code: 'custom', path: ['to'], message: 'date range cannot exceed 366 days' });
});

const programVersionSchema = z.object({
  referrerActorType: z.enum(['CLIENT', 'PROFESSIONAL']),
  referredActorType: z.enum(['CLIENT', 'PROFESSIONAL']),
  enabledMarkets: z.array(market).min(1).max(100).transform((items) => [...new Set(items)].sort()),
  qualifyingEventType: z.enum(['booking.completed']),
  waitingPeriodHours: z.number().int().min(0).max(8_760).default(0),
  cancellationWindowHours: z.number().int().min(0).max(8_760).default(0),
  maxCodesPerOwner: z.number().int().min(1).max(20).default(1),
  maxUsesPerCode: z.number().int().min(1).max(100_000).default(100),
  maxReferralsPerOwner: z.number().int().min(1).max(100_000).default(100),
  rewardType: z.enum(['ACCOUNT_CREDIT', 'NON_MONETARY']),
  referrerRewardAmount: money.optional(),
  referredRewardAmount: money.optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  nonMonetaryBenefitKey: identifier.optional(),
}).strict().superRefine((value, context) => {
  if (value.rewardType === 'ACCOUNT_CREDIT' && (!value.currency || (!value.referrerRewardAmount && !value.referredRewardAmount))) {
    context.addIssue({ code: 'custom', path: ['currency'], message: 'account credit requires currency and at least one reward amount' });
  }
  if (value.rewardType === 'NON_MONETARY' && (!value.nonMonetaryBenefitKey || value.currency || value.referrerRewardAmount || value.referredRewardAmount)) {
    context.addIssue({ code: 'custom', path: ['nonMonetaryBenefitKey'], message: 'non-monetary rewards require only a benefit key' });
  }
});

const programCreateSchema = z.object({
  key: identifier,
  name: z.string().trim().min(3).max(120),
  featureFlagKey: identifier,
  effectiveAt: dateTime.optional(),
  endsAt: dateTime.optional(),
  version: programVersionSchema,
  reason,
}).strict();

const programNewVersionSchema = z.object({ version: programVersionSchema, reason }).strict();
const programStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']),
  expectedRowVersion: z.number().int().positive(),
  effectiveAt: dateTime.optional(),
  endsAt: dateTime.optional(),
  reason,
}).strict();

const codeCreateSchema = z.object({ programKey: identifier, expiresAt: dateTime.optional(), idempotencyKey: z.string().trim().min(8).max(128) }).strict();
const referralClaimSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^REF_[A-Z0-9]{24,64}$/), idempotencyKey: z.string().trim().min(8).max(128) }).strict();
const revokeCodeSchema = z.object({ reason }).strict();

const actionSchema = z.object({
  actionType: z.enum(['CREATE_REFERRAL_REWARD', 'CREATE_SUPPORT_CASE', 'ENQUEUE_NOTIFICATION', 'EMIT_DOMAIN_EVENT']),
  configuration: z.record(z.string(), z.unknown()),
  delaySeconds: z.number().int().min(0).max(2_592_000).default(0),
  maxAttempts: z.number().int().min(1).max(10).default(5),
  initialBackoffSeconds: z.number().int().min(1).max(86_400).default(30),
  maxBackoffSeconds: z.number().int().min(1).max(604_800).default(3_600),
}).strict();

const automationCreateSchema = z.object({
  key: identifier,
  name: z.string().trim().min(3).max(120),
  featureFlagKey: identifier,
  trigger: z.object({ eventType: z.string().trim().regex(/^[a-z][a-z0-9_.-]{2,127}$/), schemaVersion: z.number().int().min(1).max(100).default(1) }).strict(),
  conditionTree: z.unknown().optional(),
  actions: z.array(actionSchema).min(1).max(20),
  reason,
}).strict();
const automationNewVersionSchema = automationCreateSchema.omit({ key: true, name: true, featureFlagKey: true }).extend({ reason });
const automationStatusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']), versionId: z.string().uuid().optional(), expectedRowVersion: z.number().int().positive(), reason }).strict();

module.exports = {
  adminListSchema,
  automationCreateSchema,
  automationNewVersionSchema,
  automationStatusSchema,
  codeCreateSchema,
  programCreateSchema,
  programNewVersionSchema,
  programStatusSchema,
  referralClaimSchema,
  revokeCodeSchema,
};
