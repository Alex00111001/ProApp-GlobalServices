const { createHash, createHmac } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { isFeatureEnabled } = require('../configuration/feature-flags.service');
const { canonicalDigest, operationalError } = require('../privacy/privacy-utils');
const { telemetryMetadata } = require('../observability/context');
const { observeReferralOperation } = require('../observability/metrics');

const PROGRAM_TRANSITIONS = Object.freeze({
  DRAFT: new Set(['SCHEDULED', 'ACTIVE', 'ARCHIVED']),
  SCHEDULED: new Set(['ACTIVE', 'PAUSED', 'ARCHIVED']),
  ACTIVE: new Set(['PAUSED', 'COMPLETED']),
  PAUSED: new Set(['ACTIVE', 'COMPLETED', 'ARCHIVED']),
  COMPLETED: new Set(['ARCHIVED']),
  ARCHIVED: new Set(),
});

const assertEnabled = () => {
  if (!env.referralsEnabled && env.environment !== 'test') throw operationalError('Referrals are disabled.', 'REFERRALS_DISABLED', 503);
};
const contextFields = (context = {}) => ({ requestId: context.requestId, correlationId: context.correlationId, traceId: context.traceId });
const codeFor = (programId, ownerUserId, idempotencyKey) => `REF_${createHmac('sha256', env.jwtSecret).update(`${programId}:${ownerUserId}:${idempotencyKey}`).digest('hex').slice(0, 36).toUpperCase()}`;
const rewardKey = (referralId, side) => createHash('sha256').update(`referral-reward:v1:${referralId}:${side}`).digest('hex');

const assertActor = (user, actorType) => {
  const valid = actorType === 'CLIENT'
    ? user.role === 'CLIENT' && user.clientProfile
    : user.role === 'PROFESSIONAL' && user.professionalProfile?.status === 'APPROVED';
  if (!valid) throw operationalError('Actor is not eligible for this referral program.', 'REFERRAL_ACTOR_INELIGIBLE', 403);
};

const assertProgramRuntime = async (program, version, user, database, now = new Date()) => {
  if (program.status !== 'ACTIVE' || (program.effectiveAt && program.effectiveAt > now) || (program.endsAt && program.endsAt <= now)) {
    throw operationalError('Referral program is not active.', 'REFERRAL_PROGRAM_INACTIVE', 409);
  }
  if (!version.enabledMarkets.includes(user.countryCode)) throw operationalError('Referral program is not available in this market.', 'REFERRAL_MARKET_INELIGIBLE', 403);
  const enabled = await isFeatureEnabled(program.featureFlagKey, { environment: env.environment, country: user.countryCode, subjectId: user.id }, database);
  if (!enabled) throw operationalError('Referral program is not enabled for this subject.', 'REFERRAL_FEATURE_DISABLED', 403);
};

const audit = (tx, { actorId, action, resourceType, resourceId, reason, before, after, context }) => tx.auditLog.create({ data: {
  actorId, action, resourceType, resourceId, reason, before, after, ...contextFields(context),
} });

const createProgram = async ({ input, actorId, context = {}, database = prisma }) => {
  assertEnabled();
  const digest = canonicalDigest(input.version);
  return database.$transaction(async (tx) => {
    const program = await tx.referralProgram.create({ data: {
      key: input.key, name: input.name, featureFlagKey: input.featureFlagKey,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : undefined,
      endsAt: input.endsAt ? new Date(input.endsAt) : undefined, createdById: actorId,
      versions: { create: { version: 1, ...input.version, configurationDigest: digest } },
    }, include: { versions: true } });
    await audit(tx, { actorId, action: 'REFERRAL_PROGRAM_CREATED', resourceType: 'ReferralProgram', resourceId: program.id, reason: input.reason, after: { key: program.key, version: 1 }, context });
    await tx.outboxEvent.create({ data: { aggregateType: 'ReferralProgram', aggregateId: program.id, eventType: 'referral.program.created', payload: { programId: program.id, key: program.key, version: 1 }, metadata: telemetryMetadata(context) } });
    return program;
  });
};

const createProgramVersion = async ({ programId, input, actorId, context = {}, database = prisma }) => {
  assertEnabled();
  return database.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`referral-program:${programId}`}, 0)) IS NULL AS acquired`);
    const program = await tx.referralProgram.findUnique({ where: { id: programId } });
    if (!program) throw operationalError('Referral program not found.', 'REFERRAL_PROGRAM_NOT_FOUND', 404);
    if (!['DRAFT', 'PAUSED'].includes(program.status)) throw operationalError('Only draft or paused programs can receive a new version.', 'REFERRAL_PROGRAM_VERSION_LOCKED', 409);
    const version = program.currentVersion + 1;
    const created = await tx.referralProgramVersion.create({ data: { programId, version, ...input.version, configurationDigest: canonicalDigest(input.version) } });
    await tx.referralProgram.update({ where: { id: programId }, data: { currentVersion: version, rowVersion: { increment: 1 } } });
    await audit(tx, { actorId, action: 'REFERRAL_PROGRAM_VERSION_CREATED', resourceType: 'ReferralProgram', resourceId: programId, reason: input.reason, before: { version: program.currentVersion }, after: { version }, context });
    return created;
  });
};

const setProgramStatus = async ({ programId, input, actorId, context = {}, database = prisma }) => {
  assertEnabled();
  return database.$transaction(async (tx) => {
    const current = await tx.referralProgram.findUnique({ where: { id: programId } });
    if (!current) throw operationalError('Referral program not found.', 'REFERRAL_PROGRAM_NOT_FOUND', 404);
    if (current.rowVersion !== input.expectedRowVersion) throw operationalError('Referral program was changed concurrently.', 'REFERRAL_PROGRAM_CONFLICT', 409);
    if (!PROGRAM_TRANSITIONS[current.status].has(input.status)) throw operationalError('Referral program transition is invalid.', 'REFERRAL_PROGRAM_TRANSITION_INVALID', 409);
    const version = await tx.referralProgramVersion.findUnique({ where: { programId_version: { programId, version: current.currentVersion } } });
    if (!version || !/^[a-f0-9]{64}$/.test(version.configurationDigest)) throw operationalError('Referral program version integrity check failed.', 'REFERRAL_PROGRAM_VERSION_INVALID', 409);
    const updated = await tx.referralProgram.update({ where: { id: programId }, data: {
      status: input.status, rowVersion: { increment: 1 },
      ...(input.effectiveAt ? { effectiveAt: new Date(input.effectiveAt) } : {}), ...(input.endsAt ? { endsAt: new Date(input.endsAt) } : {}),
    } });
    await audit(tx, { actorId, action: 'REFERRAL_PROGRAM_STATUS_CHANGED', resourceType: 'ReferralProgram', resourceId: programId, reason: input.reason, before: { status: current.status }, after: { status: updated.status }, context });
    await tx.outboxEvent.create({ data: { aggregateType: 'ReferralProgram', aggregateId: programId, eventType: `referral.program.${updated.status.toLowerCase()}`, payload: { programId, version: updated.currentVersion, status: updated.status }, metadata: telemetryMetadata(context) } });
    return updated;
  });
};

const createCode = async ({ input, user, context = {}, database = prisma }) => {
  assertEnabled();
  return database.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`referral-code:${input.programKey}:${user.id}`}, 0)) IS NULL AS acquired`);
    const program = await tx.referralProgram.findUnique({ where: { key: input.programKey } });
    if (!program) throw operationalError('Referral program not found.', 'REFERRAL_PROGRAM_NOT_FOUND', 404);
    const version = await tx.referralProgramVersion.findUnique({ where: { programId_version: { programId: program.id, version: program.currentVersion } } });
    assertActor(user, version.referrerActorType);
    await assertProgramRuntime(program, version, user, tx);
    const existing = await tx.referralCode.findUnique({ where: { code: codeFor(program.id, user.id, input.idempotencyKey) } });
    if (existing) return { code: existing, duplicate: true };
    const active = await tx.referralCode.count({ where: { programId: program.id, ownerUserId: user.id, status: 'ACTIVE' } });
    if (active >= version.maxCodesPerOwner) throw operationalError('Active referral-code limit reached.', 'REFERRAL_CODE_LIMIT', 409);
    const code = await tx.referralCode.create({ data: { code: codeFor(program.id, user.id, input.idempotencyKey), idempotencyKey: input.idempotencyKey, programId: program.id, ownerUserId: user.id, ownerType: version.referrerActorType, maxUses: version.maxUsesPerCode, expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined } });
    await audit(tx, { actorId: user.id, action: 'REFERRAL_CODE_CREATED', resourceType: 'ReferralCode', resourceId: code.id, after: { programId: program.id, expiresAt: code.expiresAt }, context });
    return { code, duplicate: false };
  });
};

const claimReferral = async ({ input, user, context = {}, database = prisma, now = new Date() }) => {
  assertEnabled();
  return database.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`referral-claim:${input.code}:${user.id}`}, 0)) IS NULL AS acquired`);
    const code = await tx.referralCode.findUnique({ where: { code: input.code }, include: { program: true, owner: { include: { clientProfile: true, professionalProfile: true } } } });
    if (!code) throw operationalError('Referral code is invalid.', 'REFERRAL_CODE_INVALID', 404);
    if (code.status !== 'ACTIVE' || code.revokedAt) throw operationalError('Referral code is revoked.', 'REFERRAL_CODE_REVOKED', 409);
    if (code.expiresAt && code.expiresAt <= now) throw operationalError('Referral code is expired.', 'REFERRAL_CODE_EXPIRED', 409);
    if (code.ownerUserId === user.id) throw operationalError('Self-referral is prohibited.', 'REFERRAL_SELF_REFERRAL', 409);
    const version = await tx.referralProgramVersion.findUnique({ where: { programId_version: { programId: code.programId, version: code.program.currentVersion } } });
    assertActor(user, version.referredActorType);
    await assertProgramRuntime(code.program, version, user, tx, now);
    if (code.owner.countryCode !== user.countryCode) throw operationalError('Cross-market referral claims are prohibited.', 'REFERRAL_CROSS_MARKET', 403);
    const replay = await tx.referral.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (replay) {
      if (replay.referralCodeId !== code.id || replay.referredUserId !== user.id) throw operationalError('Idempotency key conflict.', 'REFERRAL_IDEMPOTENCY_CONFLICT', 409);
      return { referral: replay, duplicate: true };
    }
    const circular = await tx.referral.findFirst({ where: { programId: code.programId, referrerUserId: user.id, referredUserId: code.ownerUserId } });
    if (circular) throw operationalError('Circular referrals are prohibited.', 'REFERRAL_CIRCULAR', 409);
    const ownerUses = await tx.referral.count({ where: { programId: code.programId, referrerUserId: code.ownerUserId } });
    if (ownerUses >= version.maxReferralsPerOwner) throw operationalError('Referral owner limit reached.', 'REFERRAL_OWNER_LIMIT', 409);
    const claimed = await tx.referralCode.updateMany({ where: { id: code.id, status: 'ACTIVE', useCount: { lt: code.maxUses } }, data: { useCount: { increment: 1 } } });
    if (claimed.count !== 1) throw operationalError('Referral code usage limit reached.', 'REFERRAL_CODE_EXHAUSTED', 409);
    const referral = await tx.referral.create({ data: { idempotencyKey: input.idempotencyKey, programId: code.programId, programVersionId: version.id, referralCodeId: code.id, referrerUserId: code.ownerUserId, referredUserId: user.id, market: user.countryCode, ...contextFields(context), riskAssessments: { create: { ruleVersion: 1, outcome: 'CLEAR', signals: { selfReferral: false, circularReferral: false, sameMarket: true }, evidenceDigest: canonicalDigest({ selfReferral: false, circularReferral: false, sameMarket: true }) } } } });
    await audit(tx, { actorId: user.id, action: 'REFERRAL_CREATED', resourceType: 'Referral', resourceId: referral.id, after: { programId: code.programId, market: referral.market }, context });
    await tx.outboxEvent.create({ data: { aggregateType: 'Referral', aggregateId: referral.id, eventType: 'referral.created', payload: { referralId: referral.id, market: referral.market, actorType: version.referredActorType }, metadata: telemetryMetadata(context) } });
    observeReferralOperation({ operation: 'referral_created', outcome: 'accepted' });
    return { referral, duplicate: false };
  });
};

const ensureRewards = async (tx, referral, version, eligibleAt, evidenceDigest) => {
  const specs = version.rewardType === 'NON_MONETARY'
    ? [{ side: 'REFERRER', userId: referral.referrerUserId, benefitKey: version.nonMonetaryBenefitKey }, { side: 'REFERRED', userId: referral.referredUserId, benefitKey: version.nonMonetaryBenefitKey }]
    : [{ side: 'REFERRER', userId: referral.referrerUserId, amount: version.referrerRewardAmount }, { side: 'REFERRED', userId: referral.referredUserId, amount: version.referredRewardAmount }].filter((item) => item.amount && Number(item.amount) > 0);
  for (const spec of specs) {
    const key = rewardKey(referral.id, spec.side);
    const existing = await tx.referralReward.findUnique({ where: { idempotencyKey: key } });
    if (existing) continue;
    const reward = await tx.referralReward.upsert({ where: { idempotencyKey: key }, update: {}, create: { idempotencyKey: key, referralId: referral.id, programVersionId: version.id, beneficiaryUserId: spec.userId, beneficiarySide: spec.side, rewardType: version.rewardType, amount: spec.amount, currency: version.currency, benefitKey: spec.benefitKey, evidenceDigest, eligibleAt } });
    await tx.outboxEvent.create({ data: { aggregateType: 'ReferralReward', aggregateId: reward.id, eventType: 'referral.reward.created', payload: { rewardId: reward.id, referralId: referral.id, rewardType: reward.rewardType, beneficiarySide: reward.beneficiarySide }, metadata: {} } });
  }
};

const qualifyFromEvent = async ({ event, database = prisma, now = new Date() }) => {
  if (!env.referralsEnabled || event.eventType !== 'booking.completed') return { matched: false };
  const booking = await database.booking.findUnique({ where: { id: event.aggregateId }, include: { client: { include: { user: true } } } });
  if (!booking || booking.status !== 'COMPLETED') return { matched: false };
  return database.$transaction(async (tx) => {
    const referral = await tx.referral.findFirst({ where: { referredUserId: booking.client.userId, status: 'CREATED' }, include: { programVersion: true } });
    if (!referral || referral.programVersion.qualifyingEventType !== event.eventType) return { matched: false };
    const sourceConversion = await tx.conversion.findFirst({ where: { bookingId: booking.id }, orderBy: { occurredAt: 'desc' }, select: { id: true } });
    const evidenceDigest = canonicalDigest({ eventId: event.id, bookingId: booking.id, eventType: event.eventType });
    const conversion = await tx.referralConversion.upsert({ where: { sourceOutboxEventId: event.id }, update: {}, create: { referralId: referral.id, sourceOutboxEventId: event.id, sourceConversionId: sourceConversion?.id, eventType: event.eventType, evidenceDigest, occurredAt: event.createdAt } });
    const eligibleAt = new Date(event.createdAt.getTime() + referral.programVersion.waitingPeriodHours * 3_600_000);
    await ensureRewards(tx, referral, referral.programVersion, eligibleAt, evidenceDigest);
    await tx.referral.update({ where: { id: referral.id }, data: { status: 'QUALIFIED', qualifiedAt: event.createdAt } });
    await tx.outboxEvent.create({ data: { aggregateType: 'Referral', aggregateId: referral.id, eventType: 'referral.qualified', payload: { referralId: referral.id, market: referral.market }, metadata: event.metadata || {} } });
    observeReferralOperation({ operation: 'referral_qualified', outcome: 'accepted' });
    return { matched: true, referralId: referral.id, conversionId: conversion.id, eligibleAt };
  }).then(async (output) => output.matched && output.eligibleAt <= now ? { ...output, ...(await finalizeReferral({ referralId: output.referralId, database, now })) } : output);
};

const finalizeReferral = async ({ referralId, database = prisma, now = new Date() }) => database.$transaction(async (tx) => {
  const referral = await tx.referral.findUnique({ where: { id: referralId }, include: { programVersion: true, rewards: true } });
  if (!referral || referral.status === 'CONVERTED') return { duplicate: true };
  if (referral.status !== 'QUALIFIED') throw operationalError('Referral is not qualified.', 'REFERRAL_NOT_QUALIFIED', 409);
  const eligibleAt = new Date(referral.qualifiedAt.getTime() + referral.programVersion.waitingPeriodHours * 3_600_000);
  if (eligibleAt > now) return { deferred: true, eligibleAt };
  const safeStatus = referral.programVersion.rewardType === 'ACCOUNT_CREDIT' ? 'HELD' : 'APPROVED';
  await tx.referralReward.updateMany({ where: { referralId, status: 'PENDING' }, data: { status: safeStatus, ...(safeStatus === 'HELD' ? { heldAt: now } : { approvedAt: now }) } });
  const updated = await tx.referral.update({ where: { id: referralId }, data: { status: 'CONVERTED', convertedAt: now } });
  await tx.referralConversion.updateMany({ where: { referralId, status: 'QUALIFIED' }, data: { status: 'CONVERTED' } });
  await tx.outboxEvent.create({ data: { aggregateType: 'Referral', aggregateId: referralId, eventType: 'referral.converted', payload: { referralId, market: referral.market }, metadata: {} } });
  observeReferralOperation({ operation: 'referral_converted', outcome: 'accepted' });
  for (const reward of referral.rewards.filter((item) => item.rewardType === 'ACCOUNT_CREDIT')) {
    const intent = `reward-intent:${reward.id}`;
    await tx.referralReward.update({ where: { id: reward.id }, data: { financialIntentId: intent } });
    await tx.outboxEvent.create({ data: { aggregateType: 'ReferralReward', aggregateId: reward.id, eventType: 'referral.reward.financial_intent.prepared', payload: { rewardId: reward.id, financialIntentId: intent, currency: reward.currency, amount: reward.amount.toString() }, metadata: { executionEnabled: false } } });
  }
  return { referral: updated, duplicate: false };
});

const reverseFromEvent = async ({ event, database = prisma, now = new Date() }) => {
  if (!env.referralsEnabled || !['booking.cancelled', 'refund.completed'].includes(event.eventType)) return { matched: false };
  const bookingId = event.eventType.startsWith('booking.') ? event.aggregateId : event.payload?.bookingId;
  if (!bookingId) return { matched: false };
  const booking = await database.booking.findUnique({ where: { id: bookingId }, include: { client: true } });
  if (!booking) return { matched: false };
  return database.$transaction(async (tx) => {
    const referral = await tx.referral.findFirst({ where: { referredUserId: booking.client.userId, status: { in: ['QUALIFIED', 'CONVERTED'] } } });
    if (!referral) return { matched: false };
    await tx.referral.update({ where: { id: referral.id }, data: { status: 'REVERSED', reversedAt: now } });
    await tx.referralConversion.updateMany({ where: { referralId: referral.id, status: { not: 'REVERSED' } }, data: { status: 'REVERSED', reversedAt: now } });
    const rewards = await tx.referralReward.findMany({ where: { referralId: referral.id, status: { in: ['PENDING', 'APPROVED', 'HELD'] } } });
    await tx.referralReward.updateMany({ where: { id: { in: rewards.map((item) => item.id) } }, data: { status: 'REVERSED', reversedAt: now } });
    for (const reward of rewards) await tx.outboxEvent.create({ data: { aggregateType: 'ReferralReward', aggregateId: reward.id, eventType: 'referral.reward.reversed', payload: { rewardId: reward.id, referralId: referral.id, reasonCode: event.eventType }, metadata: event.metadata || {} } });
    observeReferralOperation({ operation: 'reward_reversed', outcome: 'accepted', reason: event.eventType });
    return { matched: true, referralId: referral.id, rewards: rewards.length };
  });
};

const processDueReferrals = async ({ database = prisma, now = new Date(), limit = 100 } = {}) => {
  const items = await database.referral.findMany({ where: { status: 'QUALIFIED' }, include: { programVersion: true }, orderBy: { qualifiedAt: 'asc' }, take: limit });
  let finalized = 0;
  for (const item of items) {
    const eligibleAt = new Date(item.qualifiedAt.getTime() + item.programVersion.waitingPeriodHours * 3_600_000);
    if (eligibleAt <= now) { await finalizeReferral({ referralId: item.id, database, now }); finalized += 1; }
  }
  return finalized;
};

const listOwn = async ({ userId, page = 1, limit = 25, database = prisma }) => {
  const where = { OR: [{ referrerUserId: userId }, { referredUserId: userId }] };
  const [items, total] = await Promise.all([
    database.referral.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, riskStatus: true, market: true, createdAt: true, qualifiedAt: true, convertedAt: true, rewards: { where: { beneficiaryUserId: userId }, select: { id: true, beneficiarySide: true, rewardType: true, amount: true, currency: true, benefitKey: true, status: true, eligibleAt: true } }, program: { select: { key: true, name: true } } } }),
    database.referral.count({ where }),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const listOwnCodes = (userId, database = prisma) => database.referralCode.findMany({ where: { ownerUserId: userId }, orderBy: { createdAt: 'desc' }, select: { id: true, code: true, status: true, maxUses: true, useCount: true, expiresAt: true, createdAt: true, program: { select: { key: true, name: true } } } });

const revokeOwnCode = async ({ codeId, user, reason, context = {}, database = prisma }) => database.$transaction(async (tx) => {
  const code = await tx.referralCode.findUnique({ where: { id: codeId } });
  if (!code || code.ownerUserId !== user.id) throw operationalError('Referral code not found.', 'REFERRAL_CODE_NOT_FOUND', 404);
  if (code.status === 'REVOKED') return { code, duplicate: true };
  const updated = await tx.referralCode.update({ where: { id: codeId }, data: { status: 'REVOKED', revokedAt: new Date() } });
  await audit(tx, { actorId: user.id, action: 'REFERRAL_CODE_REVOKED', resourceType: 'ReferralCode', resourceId: codeId, reason, before: { status: code.status }, after: { status: updated.status }, context });
  return { code: updated, duplicate: false };
});

const REWARD_TRANSITIONS = Object.freeze({
  PENDING: new Set(['APPROVED', 'HELD', 'REJECTED', 'REVERSED']),
  APPROVED: new Set(['HELD', 'REVERSED']),
  HELD: new Set(['APPROVED', 'REJECTED', 'REVERSED']),
  FULFILLED: new Set(['REVERSED']),
  REJECTED: new Set(), REVERSED: new Set(),
});

const setRewardStatus = async ({ rewardId, status, reason, actorId, context = {}, database = prisma, now = new Date() }) => database.$transaction(async (tx) => {
  const current = await tx.referralReward.findUnique({ where: { id: rewardId } });
  if (!current) throw operationalError('Referral reward not found.', 'REFERRAL_REWARD_NOT_FOUND', 404);
  if (status === 'FULFILLED') throw operationalError('Financial reward fulfillment is outside F8 and disabled.', 'REFERRAL_REWARD_FULFILLMENT_DISABLED', 409);
  if (current.status === status) return { reward: current, duplicate: true };
  if (!REWARD_TRANSITIONS[current.status].has(status)) throw operationalError('Referral reward transition is invalid.', 'REFERRAL_REWARD_TRANSITION_INVALID', 409);
  const timestamp = status === 'APPROVED' ? { approvedAt: now } : status === 'HELD' ? { heldAt: now } : status === 'REJECTED' ? { rejectedAt: now } : status === 'REVERSED' ? { reversedAt: now } : {};
  const reward = await tx.referralReward.update({ where: { id: rewardId }, data: { status, ...timestamp } });
  await audit(tx, { actorId, action: 'REFERRAL_REWARD_STATUS_CHANGED', resourceType: 'ReferralReward', resourceId: rewardId, reason, before: { status: current.status }, after: { status }, context });
  await tx.outboxEvent.create({ data: { aggregateType: 'ReferralReward', aggregateId: rewardId, eventType: status === 'REVERSED' ? 'referral.reward.reversed' : 'referral.reward.status_changed', payload: { rewardId, referralId: reward.referralId, status }, metadata: telemetryMetadata(context) } });
  return { reward, duplicate: false };
});

const listEligiblePrograms = async ({ user, database = prisma, now = new Date() }) => {
  assertEnabled();
  const actorType = user.role === 'PROFESSIONAL' ? 'PROFESSIONAL' : 'CLIENT';
  const programs = await database.referralProgram.findMany({ where: { status: 'ACTIVE', AND: [{ OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }], versions: { some: { version: { gte: 1 }, referrerActorType: actorType, enabledMarkets: { has: user.countryCode } } } }, include: { versions: { where: { referrerActorType: actorType, enabledMarkets: { has: user.countryCode } }, orderBy: { version: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, take: 50 });
  const output = [];
  for (const program of programs) if (program.versions[0]?.version === program.currentVersion && await isFeatureEnabled(program.featureFlagKey, { environment: env.environment, country: user.countryCode, subjectId: user.id }, database)) output.push({ id: program.id, key: program.key, name: program.name, effectiveAt: program.effectiveAt, endsAt: program.endsAt, version: program.currentVersion, rewardType: program.versions[0].rewardType });
  return output;
};

module.exports = {
  PROGRAM_TRANSITIONS,
  REWARD_TRANSITIONS,
  claimReferral,
  createCode,
  createProgram,
  createProgramVersion,
  ensureRewards,
  finalizeReferral,
  listOwn,
  listOwnCodes,
  listEligiblePrograms,
  processDueReferrals,
  qualifyFromEvent,
  reverseFromEvent,
  revokeOwnCode,
  setRewardStatus,
  setProgramStatus,
};
