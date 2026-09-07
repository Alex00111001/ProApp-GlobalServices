const { z } = require('zod');
const {
  adminListQuerySchema,
  modelCreateSchema,
  modelStatusSchema,
  modelUpdateSchema,
  policyCreateSchema,
  policyReviewSchema,
  policyStatusSchema,
  policyUpdateSchema,
} = require('../validators/privacy.validators');
const { createPolicy, reviewPolicy, setPolicyStatus, updateDraftPolicy } = require('../modules/privacy/consent-policy.service');
const { attributeConversion, createModel, setModelStatus, updateDraftModel } = require('../modules/attribution/attribution.service');
const { listAttributions, listConsentDecisions, listModels, listPolicies, listTouchpoints } = require('../modules/admin/privacy-read.service');
const { writeAuditLog } = require('../modules/audit/audit.service');

const reasonSchema = z.object({ reason: z.string().trim().min(10).max(2_000) }).strict();
const handler = (work) => async (req, res, next) => {
  try { return await work(req, res); } catch (error) { return next(error); }
};
const auditedRead = async (req, resourceType, output) => {
  await writeAuditLog({ req, action: `ADMIN_${resourceType}_READ`, resourceType, metadata: { returnedItems: output.items.length, filtersApplied: Object.keys(req.query).sort() } });
  return output;
};

exports.policies = handler(async (req, res) => res.json(await auditedRead(req, 'CONSENT_POLICY', await listPolicies(adminListQuerySchema.parse(req.query)))));
exports.createPolicy = handler(async (req, res) => res.status(201).json({ policy: await createPolicy({ input: policyCreateSchema.parse(req.body), req }) }));
exports.updatePolicy = handler(async (req, res) => res.json({ policy: await updateDraftPolicy({ id: req.params.id, input: policyUpdateSchema.parse(req.body), req }) }));
exports.reviewPolicy = handler(async (req, res) => res.json({ policy: await reviewPolicy({ id: req.params.id, ...policyReviewSchema.parse(req.body), req }) }));
exports.setPolicyStatus = handler(async (req, res) => {
  const input = policyStatusSchema.parse(req.body);
  return res.json({ policy: await setPolicyStatus({ id: req.params.id, ...input, effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : undefined, req }) });
});
exports.consentHistory = handler(async (req, res) => res.json(await auditedRead(req, 'CONSENT_HISTORY', await listConsentDecisions(adminListQuerySchema.parse(req.query)))));
exports.withdrawals = handler(async (req, res) => res.json(await auditedRead(req, 'CONSENT_WITHDRAWAL', await listConsentDecisions(adminListQuerySchema.parse(req.query), { withdrawalsOnly: true }))));
exports.touchpoints = handler(async (req, res) => res.json(await auditedRead(req, 'TOUCHPOINT', await listTouchpoints(adminListQuerySchema.parse(req.query)))));

exports.models = handler(async (req, res) => res.json(await auditedRead(req, 'ATTRIBUTION_MODEL', await listModels(adminListQuerySchema.parse(req.query)))));
exports.createModel = handler(async (req, res) => res.status(201).json({ model: await createModel({ input: modelCreateSchema.parse(req.body), req }) }));
exports.updateModel = handler(async (req, res) => res.json({ model: await updateDraftModel({ id: req.params.id, input: modelUpdateSchema.parse(req.body), req }) }));
exports.setModelStatus = handler(async (req, res) => {
  const input = modelStatusSchema.parse(req.body);
  return res.json({ model: await setModelStatus({ id: req.params.id, ...input, effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : undefined, req }) });
});
exports.attributions = handler(async (req, res) => res.json(await auditedRead(req, 'ATTRIBUTION', await listAttributions(adminListQuerySchema.parse(req.query)))));
exports.calculate = handler(async (req, res) => {
  const { reason } = reasonSchema.parse(req.body);
  const output = await attributeConversion({ conversionId: req.params.id, context: req.context });
  await writeAuditLog({ req, action: 'ATTRIBUTION_CALCULATION_REQUESTED', resourceType: 'CONVERSION', resourceId: req.params.id, reason,
    metadata: { resultCount: output.results.length, duplicates: output.results.filter((item) => item.duplicate).length } });
  return res.json(output);
});

module.exports = exports;
