const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { adminListResponse, dateTime } = require('./shared.responses');

const count = z.number().int().nonnegative();
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

const growthResponses = Object.freeze({ campaignList: campaignListResponse });

module.exports = { growthResponses };
