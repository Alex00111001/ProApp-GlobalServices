const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { adminListResponse, dateTime } = require('./shared.responses');

const count = z.number().int().nonnegative();
const subjectType = z.enum(['USER', 'PROFESSIONAL', 'ANONYMOUS', 'SESSION']);
const campaignSummary = outputObject({ id: z.string(), key: z.string(), name: z.string() });
const campaign = outputObject({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  source: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']),
  medium: z.string().nullable(),
  channel: z.string().nullable(),
  countryCode: z.string().nullable(),
  startsAt: dateTime.nullable(),
  endsAt: dateTime.nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
  _count: outputObject({ events: count, leads: count, conversions: count }),
});

const campaignListResponse = defineResponseContract({
  method: 'GET',
  path: '/api/v1/admin/growth/campaigns',
  operationId: 'adminGrowth.campaignList',
  responses: {
    200: serialized(adminListResponse(campaign)),
  },
});

const lead = outputObject({
  id: z.string(),
  subjectType,
  status: z.enum(['NEW', 'ENGAGED', 'CONVERTED', 'DISQUALIFIED']),
  source: z.string().nullable(),
  channel: z.string().nullable(),
  countryCode: z.string().nullable(),
  firstSeenAt: dateTime,
  lastSeenAt: dateTime,
  convertedAt: dateTime.nullable(),
  identified: z.boolean(),
  campaign: campaignSummary.nullable(),
  _count: outputObject({ events: count, conversions: count }),
});
const conversion = outputObject({
  id: z.string(),
  type: z.enum(['SIGNUP', 'REQUEST', 'BOOKING', 'PAYMENT', 'JOB_COMPLETED']),
  occurredAt: dateTime,
  createdAt: dateTime,
  campaign: campaignSummary.nullable(),
  event: outputObject({ id: z.string(), eventName: z.string(), correlationId: z.string().nullable() }),
  lead: outputObject({ subjectType }).nullable(),
});

const growthResponses = Object.freeze({
  campaignList: campaignListResponse,
  leadList: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/growth/leads', operationId: 'adminGrowth.leadList',
    responses: { 200: serialized(adminListResponse(lead)) },
  }),
  conversionList: defineResponseContract({
    method: 'GET', path: '/api/v1/admin/growth/conversions', operationId: 'adminGrowth.conversionList',
    responses: { 200: serialized(adminListResponse(conversion)) },
  }),
});

module.exports = { growthResponses };
