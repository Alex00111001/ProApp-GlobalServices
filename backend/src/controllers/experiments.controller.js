const { assignmentBody, exposureBody } = require('../validators/experiments-content-seo.validators');
const { assignVariant, recordExposure } = require('../modules/experiments/experiment.service');
const handler = (work) => async (req, res, next) => { try { return await work(req, res); } catch (error) { return next(error); } };
const identity = (req) => ({ userId: req.user?.id, professionalId: req.user?.professionalProfile?.id });
exports.assign = handler(async (req, res) => { const input = assignmentBody.parse(req.body); res.json(await assignVariant({ key: req.params.key, marketCode: input.marketCode, locale: input.locale, proof: input.anonymousProof, identity: identity(req), context: req.context })); });
exports.expose = handler(async (req, res) => { const input = exposureBody.parse(req.body); res.status(201).json(await recordExposure({ ...input, exposureContext: input.context, proof: input.anonymousProof, identity: identity(req), context: req.context })); });
module.exports = exports;
