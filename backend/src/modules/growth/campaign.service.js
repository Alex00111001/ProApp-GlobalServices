const prisma = require('../../config/prisma');
const { redactText, sanitizeTelemetry } = require('../observability/redaction');
const { telemetryMetadata } = require('../observability/context');

const CAMPAIGN_TRANSITIONS = Object.freeze({
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
});
const operationalError = (message, code, statusCode) => Object.assign(new Error(message), { code, statusCode });
const contextFields = (context = {}) => ({ requestId: context.requestId, correlationId: context.correlationId, traceId: context.traceId });
const campaignSnapshot = (campaign) => ({
  key: campaign.key,
  name: campaign.name,
  status: campaign.status,
  source: campaign.source,
  medium: campaign.medium,
  channel: campaign.channel,
  countryCode: campaign.countryCode,
  startsAt: campaign.startsAt,
  endsAt: campaign.endsAt,
});

const validateWindow = (startsAt, endsAt) => {
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw operationalError('Campaign end must be after its start.', 'INVALID_CAMPAIGN_WINDOW', 422);
  }
};

const dateValue = (value) => value === null || value === undefined ? value : new Date(value);

const createCampaign = async ({ actorId, context, reason, ...input }, client = prisma) => {
  validateWindow(input.startsAt, input.endsAt);
  try {
    return await client.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({ data: {
        ...input,
        startsAt: dateValue(input.startsAt),
        endsAt: dateValue(input.endsAt),
        createdById: actorId,
      } });
      await tx.outboxEvent.create({ data: {
        aggregateType: 'Campaign', aggregateId: campaign.id, eventType: 'growth.campaign.created',
        payload: { campaignId: campaign.id, key: campaign.key, status: campaign.status },
        metadata: telemetryMetadata(context),
      } });
      await tx.auditLog.create({ data: {
        actorId, action: 'growth.campaign_created', resourceType: 'Campaign', resourceId: campaign.id,
        outcome: 'SUCCESS', reason: redactText(reason), after: sanitizeTelemetry(campaignSnapshot(campaign)), ...contextFields(context),
      } });
      return campaign;
    });
  } catch (error) {
    if (error?.code === 'P2002') throw operationalError('Campaign key already exists.', 'CAMPAIGN_KEY_CONFLICT', 409);
    throw error;
  }
};

const updateCampaign = async ({ id, actorId, reason, context, ...input }, client = prisma) => client.$transaction(async (tx) => {
  const current = await tx.campaign.findUnique({ where: { id } });
  if (!current) throw operationalError('Campaign was not found.', 'CAMPAIGN_NOT_FOUND', 404);
  if (current.status === 'ARCHIVED') throw operationalError('Archived campaigns are immutable.', 'CAMPAIGN_ARCHIVED', 409);
  const startsAt = input.startsAt === undefined ? current.startsAt : dateValue(input.startsAt);
  const endsAt = input.endsAt === undefined ? current.endsAt : dateValue(input.endsAt);
  validateWindow(startsAt, endsAt);
  const data = {
    ...input,
    ...(input.startsAt !== undefined ? { startsAt } : {}),
    ...(input.endsAt !== undefined ? { endsAt } : {}),
  };
  const campaign = await tx.campaign.update({ where: { id }, data });
  const safeReason = redactText(reason);
  await tx.outboxEvent.create({ data: {
    aggregateType: 'Campaign', aggregateId: id, eventType: 'growth.campaign.updated',
    payload: { campaignId: id, key: campaign.key, status: campaign.status }, metadata: telemetryMetadata(context),
  } });
  await tx.auditLog.create({ data: {
    actorId, action: 'growth.campaign_updated', resourceType: 'Campaign', resourceId: id, outcome: 'SUCCESS',
    reason: safeReason, before: sanitizeTelemetry(campaignSnapshot(current)), after: sanitizeTelemetry(campaignSnapshot(campaign)), ...contextFields(context),
  } });
  return campaign;
});

const transitionCampaign = async ({ id, toStatus, actorId, reason, context }, client = prisma) => client.$transaction(async (tx) => {
  const current = await tx.campaign.findUnique({ where: { id } });
  if (!current) throw operationalError('Campaign was not found.', 'CAMPAIGN_NOT_FOUND', 404);
  if (current.status === toStatus) return { campaign: current, duplicate: true };
  if (!CAMPAIGN_TRANSITIONS[current.status]?.includes(toStatus)) {
    throw operationalError(`Campaign cannot transition from ${current.status} to ${toStatus}.`, 'INVALID_CAMPAIGN_TRANSITION', 409);
  }
  if (toStatus === 'ACTIVE' && current.endsAt && current.endsAt <= new Date()) {
    throw operationalError('An expired campaign cannot be activated.', 'CAMPAIGN_WINDOW_EXPIRED', 409);
  }
  const changed = await tx.campaign.updateMany({ where: { id, status: current.status }, data: { status: toStatus } });
  if (changed.count !== 1) throw operationalError('Campaign changed concurrently.', 'CAMPAIGN_CONFLICT', 409);
  const campaign = await tx.campaign.findUniqueOrThrow({ where: { id } });
  const safeReason = redactText(reason);
  await tx.outboxEvent.create({ data: {
    aggregateType: 'Campaign', aggregateId: id, eventType: 'growth.campaign.status_changed',
    payload: { campaignId: id, key: campaign.key, fromStatus: current.status, toStatus }, metadata: telemetryMetadata(context),
  } });
  await tx.auditLog.create({ data: {
    actorId, action: 'growth.campaign_status_changed', resourceType: 'Campaign', resourceId: id, outcome: 'SUCCESS',
    reason: safeReason, before: { status: current.status }, after: { status: toStatus }, ...contextFields(context),
  } });
  return { campaign, duplicate: false };
});

module.exports = { CAMPAIGN_TRANSITIONS, campaignSnapshot, createCampaign, transitionCampaign, updateCampaign, validateWindow };
