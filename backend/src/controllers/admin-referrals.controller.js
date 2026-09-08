const { z } = require('zod');
const { adminListSchema, programCreateSchema, programNewVersionSchema, programStatusSchema } = require('../validators/referrals-automation.validators');
const { createProgram, createProgramVersion, setProgramStatus, setRewardStatus } = require('../modules/referrals/referral.service');
const { writeAuditLog } = require('../modules/audit/audit.service');
const prisma = require('../config/prisma');

const rewardStatusSchema = z.object({ status: z.enum(['APPROVED', 'HELD', 'REJECTED', 'REVERSED']), reason: z.string().trim().min(10).max(2_000) }).strict();
const handler = (work) => async (req, res, next) => { try { return await work(req, res); } catch (error) { return next(error); } };
const page = (input, totalItems) => ({ page: input.page, limit: input.limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / input.limit)) });
const dateWhere = (input, field = 'createdAt') => input.from || input.to ? { [field]: { ...(input.from ? { gte: new Date(input.from) } : {}), ...(input.to ? { lte: new Date(input.to) } : {}) } } : {};
const audited = async (req, type, result) => { await writeAuditLog({ req, action: `ADMIN_${type}_READ`, resourceType: type, metadata: { returnedItems: result.items.length, filtersApplied: Object.keys(req.query).sort() } }); return result; };

exports.programs = handler(async (req, res) => {
  const input = adminListSchema.parse(req.query); const where = { ...(input.status ? { status: input.status } : {}), ...(input.search ? { OR: [{ key: { contains: input.search, mode: 'insensitive' } }, { name: { contains: input.search, mode: 'insensitive' } }] } : {}), ...dateWhere(input) };
  const [items, total] = await Promise.all([prisma.referralProgram.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: { updatedAt: 'desc' }, include: { versions: { orderBy: { version: 'desc' }, take: 1 }, _count: { select: { codes: true, referrals: true } } } }), prisma.referralProgram.count({ where })]);
  res.json(await audited(req, 'REFERRAL_PROGRAM', { items, pagination: page(input, total) }));
});
exports.createProgram = handler(async (req, res) => res.status(201).json({ program: await createProgram({ input: programCreateSchema.parse(req.body), actorId: req.user.id, context: req.context }) }));
exports.createVersion = handler(async (req, res) => res.status(201).json({ version: await createProgramVersion({ programId: req.params.id, input: programNewVersionSchema.parse(req.body), actorId: req.user.id, context: req.context }) }));
exports.setStatus = handler(async (req, res) => res.json({ program: await setProgramStatus({ programId: req.params.id, input: programStatusSchema.parse(req.body), actorId: req.user.id, context: req.context }) }));

const list = (model, type, select, extraWhere = () => ({})) => handler(async (req, res) => {
  const input = adminListSchema.parse(req.query); const where = { ...(input.status ? { status: input.status } : {}), ...dateWhere(input), ...extraWhere(input) };
  const [items, total] = await Promise.all([prisma[model].findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: { createdAt: 'desc' }, select }), prisma[model].count({ where })]);
  res.json(await audited(req, type, { items, pagination: page(input, total) }));
});
exports.codes = list('referralCode', 'REFERRAL_CODE', { id: true, code: true, status: true, maxUses: true, useCount: true, expiresAt: true, revokedAt: true, createdAt: true, program: { select: { id: true, key: true, name: true } } }, (input) => input.market ? { program: { versions: { some: { enabledMarkets: { has: input.market } } } } } : {});
exports.referrals = list('referral', 'REFERRAL', { id: true, status: true, riskStatus: true, rejectionCode: true, market: true, qualifiedAt: true, convertedAt: true, reversedAt: true, createdAt: true, program: { select: { id: true, key: true, name: true } }, _count: { select: { conversions: true, rewards: true, riskAssessments: true } } }, (input) => input.market ? { market: input.market } : {});
exports.conversions = list('referralConversion', 'REFERRAL_CONVERSION', { id: true, referralId: true, sourceOutboxEventId: true, sourceConversionId: true, eventType: true, status: true, occurredAt: true, reversedAt: true, createdAt: true });
exports.rewards = list('referralReward', 'REFERRAL_REWARD', { id: true, referralId: true, beneficiarySide: true, rewardType: true, amount: true, currency: true, benefitKey: true, status: true, eligibleAt: true, financialIntentId: true, createdAt: true, updatedAt: true });
exports.setRewardStatus = handler(async (req, res) => { const input = rewardStatusSchema.parse(req.body); res.json(await setRewardStatus({ rewardId: req.params.id, ...input, actorId: req.user.id, context: req.context })); });

module.exports = exports;
