const { z } = require('zod');
const { codeCreateSchema, referralClaimSchema, revokeCodeSchema } = require('../validators/referrals-automation.validators');
const { claimReferral, createCode, listEligiblePrograms, listOwn, listOwnCodes, revokeOwnCode } = require('../modules/referrals/referral.service');

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(25) }).strict();
const handler = (work) => async (req, res, next) => { try { return await work(req, res); } catch (error) { return next(error); } };

exports.programs = handler(async (req, res) => res.json({ items: await listEligiblePrograms({ user: req.user }) }));
exports.codes = handler(async (req, res) => res.json({ items: await listOwnCodes(req.user.id) }));
exports.createCode = handler(async (req, res) => res.status(201).json(await createCode({ input: codeCreateSchema.parse(req.body), user: req.user, context: req.context })));
exports.revokeCode = handler(async (req, res) => res.json(await revokeOwnCode({ codeId: req.params.id, user: req.user, reason: revokeCodeSchema.parse(req.body).reason, context: req.context })));
exports.claim = handler(async (req, res) => res.status(201).json(await claimReferral({ input: referralClaimSchema.parse(req.body), user: req.user, context: req.context })));
exports.mine = handler(async (req, res) => res.json(await listOwn({ userId: req.user.id, ...pageSchema.parse(req.query) })));

module.exports = exports;
