const env = require('../config/env');
const prisma = require('../config/prisma');
const {
  consentDecisionSchema,
  consentHistoryQuerySchema,
  identityProofSchema,
  policyQuerySchema,
  reconciliationSchema,
  touchpointSchema,
  withdrawalSchema,
} = require('../validators/privacy.validators');
const { listEffectivePolicies } = require('../modules/privacy/consent-policy.service');
const { listConsentHistory, recordDecision, withdrawConsent, getSubjectKeys } = require('../modules/privacy/consent.service');
const { authenticatedSubject, issueAnonymousProof, reconcileIdentity } = require('../modules/privacy/identity-proof.service');
const { ingestTouchpoint } = require('../modules/privacy/touchpoint.service');
const { operationalError } = require('../modules/privacy/privacy-utils');
const { observeAttributionOperation } = require('../modules/observability/metrics');

const identity = (req) => ({ userId: req.user?.id, professionalId: req.user?.professionalProfile?.id });
const handler = (work) => async (req, res, next) => {
  try { return await work(req, res); } catch (error) { return next(error); }
};

exports.policies = handler(async (req, res) => {
  const input = policyQuerySchema.parse(req.query);
  const policies = await listEffectivePolicies(input);
  return res.json({ policies: policies.map(({ reviewReference, reviewedAt, ...policy }) => policy), processingEnabled: env.consentAttributionEnabled });
});

exports.issueProof = handler(async (req, res) => {
  if (!env.consentAttributionEnabled) throw operationalError('Consent and attribution are disabled.', 'CONSENT_ATTRIBUTION_DISABLED', 503);
  return res.status(201).json(issueAnonymousProof(identityProofSchema.parse(req.body)));
});

exports.reconcile = handler(async (req, res) => {
  const input = reconciliationSchema.parse(req.body);
  const result = await reconcileIdentity({ identity: identity(req), proof: input.proof, context: req.context });
  return res.status(result.duplicate ? 200 : 201).json({ id: result.link.id, linkedAt: result.link.linkedAt, duplicate: result.duplicate });
});

exports.decide = handler(async (req, res) => {
  const input = consentDecisionSchema.parse(req.body);
  const result = await recordDecision({ input, identity: identity(req), proof: input.identityProof, context: req.context });
  return res.status(result.duplicate ? 200 : 201).json({ decision: {
    id: result.decision.id,
    policyId: result.decision.policyId,
    policyVersion: result.decision.policyVersion,
    purpose: result.decision.purpose,
    decision: result.decision.decision,
    occurredAt: result.decision.occurredAt,
  }, duplicate: result.duplicate });
});

exports.withdraw = handler(async (req, res) => {
  const input = withdrawalSchema.parse(req.body);
  const result = await withdrawConsent({ input, identity: identity(req), proof: input.identityProof, context: req.context });
  return res.status(result.duplicate ? 200 : 201).json({ withdrawal: {
    id: result.decision.id,
    policyId: result.decision.policyId,
    policyVersion: result.decision.policyVersion,
    purpose: result.decision.purpose,
    occurredAt: result.decision.occurredAt,
  }, duplicate: result.duplicate });
});

exports.history = handler(async (req, res) => res.json(await listConsentHistory({
  identity: identity(req),
  ...consentHistoryQuerySchema.parse(req.query),
})));

exports.touchpoint = async (req, res, next) => {
  try {
    const input = touchpointSchema.parse(req.body);
    const result = await ingestTouchpoint({ input, identity: identity(req), proof: input.identityProof, context: req.context });
    return res.status(result.duplicate ? 200 : 201).json({ touchpoint: {
      id: result.touchpoint.id,
      source: result.touchpoint.source,
      medium: result.touchpoint.medium,
      channel: result.touchpoint.channel,
      occurredAt: result.touchpoint.occurredAt,
    }, duplicate: result.duplicate, sanitized: result.sanitized });
  } catch (error) {
    observeAttributionOperation({ operation: 'touchpoint_ingestion', outcome: 'rejected', reason: error?.code || 'validation_error' });
    return next(error);
  }
};

exports.attributions = handler(async (req, res) => {
  const query = consentHistoryQuerySchema.parse(req.query);
  const subject = authenticatedSubject(identity(req));
  if (!subject) throw operationalError('Authentication is required.', 'AUTHENTICATION_REQUIRED', 401);
  const subjectKeys = await getSubjectKeys(subject, prisma);
  const where = {
    conversion: { OR: [
      { userId: req.user.id },
      ...(req.user.professionalProfile?.id ? [{ professionalId: req.user.professionalProfile.id }] : []),
      { lead: { subjectKey: { in: subjectKeys } } },
    ] },
    ...(query.purpose ? { model: { purpose: query.purpose } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.attribution.findMany({ where, orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit,
      select: { id: true, status: true, reasonCode: true, calculatedAt: true, windowStartedAt: true, windowEndedAt: true,
        conversion: { select: { id: true, type: true, occurredAt: true } },
        model: { select: { key: true, version: true, name: true, type: true, purpose: true, windowDays: true } },
        touchpoint: { select: { id: true, source: true, medium: true, channel: true, occurredAt: true } },
      } }),
    prisma.attribution.count({ where }),
  ]);
  return res.json({ items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) });
});

module.exports = exports;
