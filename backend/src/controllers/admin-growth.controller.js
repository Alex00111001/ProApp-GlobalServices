const prisma = require('../config/prisma');
const { writeAuditLog } = require('../modules/audit/audit.service');
const { createCampaign, transitionCampaign, updateCampaign } = require('../modules/growth/campaign.service');
const { getGrowthFunnel, getGrowthOverview, listCampaigns, listConversions, listLeads } = require('../modules/growth/growth-read.service');
const {
  campaignCreateSchema,
  campaignListQuerySchema,
  campaignStatusSchema,
  campaignUpdateSchema,
  conversionListQuerySchema,
  leadListQuerySchema,
  rangeQuerySchema,
} = require('../validators/growth.validators');
const { idSchema } = require('../validators/admin-operations.validators');
const { growthDataEnabled } = require('../config/env');

const assertGrowthEnabled = () => {
  if (!growthDataEnabled) throw Object.assign(new Error('Growth data control plane is disabled.'), { code: 'GROWTH_DATA_DISABLED', statusCode: 503 });
};

const handler = (work) => async (req, res, next) => {
  try { assertGrowthEnabled(); return await work(req, res); } catch (error) { return next(error); }
};

exports.overview = handler(async (req, res) => res.json(await getGrowthOverview(rangeQuerySchema.parse(req.query))));
exports.funnel = handler(async (req, res) => res.json(await getGrowthFunnel(rangeQuerySchema.parse(req.query))));
exports.campaigns = handler(async (req, res) => res.json(await listCampaigns(campaignListQuerySchema.parse(req.query))));
exports.createCampaign = handler(async (req, res) => res.status(201).json({ campaign: await createCampaign({ ...campaignCreateSchema.parse(req.body), actorId: req.user.id, context: req.context }) }));
exports.updateCampaign = handler(async (req, res) => {
  const input = campaignUpdateSchema.parse(req.body);
  const { reason, ...changes } = input;
  return res.json({ campaign: await updateCampaign({ id: idSchema.parse(req.params.id), actorId: req.user.id, context: req.context, reason, ...changes }) });
});
exports.setCampaignStatus = handler(async (req, res) => {
  const input = campaignStatusSchema.parse(req.body);
  return res.json(await transitionCampaign({ id: idSchema.parse(req.params.id), toStatus: input.status, reason: input.reason, actorId: req.user.id, context: req.context }));
});
exports.leads = handler(async (req, res) => {
  const query = leadListQuerySchema.parse(req.query);
  const result = await listLeads(query);
  await writeAuditLog({ req, action: 'ADMIN_GROWTH_LEADS_READ', resourceType: 'Lead', metadata: { returned: result.items.length, status: query.status, campaignId: query.campaignId, countryCode: query.countryCode } }, prisma);
  return res.json(result);
});
exports.conversions = handler(async (req, res) => {
  const query = conversionListQuerySchema.parse(req.query);
  const result = await listConversions(query);
  await writeAuditLog({ req, action: 'ADMIN_GROWTH_CONVERSIONS_READ', resourceType: 'Conversion', metadata: { returned: result.items.length, type: query.type, campaignId: query.campaignId, countryCode: query.countryCode } }, prisma);
  return res.json(result);
});

module.exports = exports;
