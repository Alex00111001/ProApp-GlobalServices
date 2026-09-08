process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
process.env.JWT_SECRET ||= 'f8-test-jwt-secret-with-more-than-32-characters';
process.env.REFERRALS_AUTOMATION_ENABLED = 'true';
process.env.CONSENT_ATTRIBUTION_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { programCreateSchema, referralClaimSchema, automationCreateSchema } = require('../src/validators/referrals-automation.validators');
const { assertConditionTree, evaluateConditionTree, TRIGGER_REGISTRY, ACTION_REGISTRY } = require('../src/modules/automation/registries');
const { backoffSeconds, idempotencyKey, safeError } = require('../src/modules/automation/automation-execution.service');
const { PROGRAM_TRANSITIONS, REWARD_TRANSITIONS, createCode, claimReferral, setRewardStatus } = require('../src/modules/referrals/referral.service');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../src/modules/identity/permission-catalog');

const version = {
  referrerActorType: 'CLIENT', referredActorType: 'CLIENT', enabledMarkets: ['ES'], qualifyingEventType: 'booking.completed',
  waitingPeriodHours: 24, cancellationWindowHours: 48, maxCodesPerOwner: 1, maxUsesPerCode: 10, maxReferralsPerOwner: 50,
  rewardType: 'ACCOUNT_CREDIT', referrerRewardAmount: 10, referredRewardAmount: 5, currency: 'EUR',
};

test('ReferralProgram contract requires a coherent, versioned reward policy', () => {
  const parsed = programCreateSchema.parse({ key: 'client-es', name: 'Clientes España', featureFlagKey: 'referrals.client.es', version, reason: 'Create isolated F8 test program.' });
  assert.equal(parsed.version.currency, 'EUR');
  assert.throws(() => programCreateSchema.parse({ key: 'bad', name: 'Bad', featureFlagKey: 'referrals.bad', version: { ...version, currency: undefined }, reason: 'Invalid account-credit program.' }));
  assert.throws(() => programCreateSchema.parse({ key: 'bad', name: 'Bad', featureFlagKey: 'referrals.bad', version: { ...version, qualifyingEventType: 'client.claimed' }, reason: 'Forged client conversion event.' }));
});

test('non-monetary rewards cannot smuggle amounts or currency', () => {
  assert.throws(() => programCreateSchema.parse({ key: 'benefit', name: 'Benefit test', featureFlagKey: 'referrals.benefit', version: { ...version, rewardType: 'NON_MONETARY', nonMonetaryBenefitKey: 'priority.support', referrerRewardAmount: 10 }, reason: 'Reject mixed reward configuration.' }));
  const parsed = programCreateSchema.parse({ key: 'benefit', name: 'Benefit test', featureFlagKey: 'referrals.benefit', version: { ...version, rewardType: 'NON_MONETARY', nonMonetaryBenefitKey: 'priority.support', referrerRewardAmount: undefined, referredRewardAmount: undefined, currency: undefined }, reason: 'Accept bounded non monetary benefit.' });
  assert.equal(parsed.version.rewardType, 'NON_MONETARY');
});

test('referral code input is bounded and enumeration-unfriendly', () => {
  assert.equal(referralClaimSchema.parse({ code: `REF_${'A'.repeat(36)}`, idempotencyKey: 'claim-unique-1' }).code.length, 40);
  assert.throws(() => referralClaimSchema.parse({ code: 'REF_123', idempotencyKey: 'claim-unique-1' }));
  assert.throws(() => referralClaimSchema.parse({ code: `REF_${'A'.repeat(36)}' OR 1=1`, idempotencyKey: 'claim-unique-1' }));
});

test('condition registry is deterministic, typed and rejects arbitrary paths', () => {
  const tree = assertConditionTree({ all: [{ path: 'event.type', operator: 'equals', value: 'booking.completed' }, { path: 'payload.market', operator: 'in', value: ['ES', 'PT'] }] });
  assert.equal(evaluateConditionTree(tree, { event: { type: 'booking.completed' }, payload: { market: 'ES' } }), true);
  assert.equal(evaluateConditionTree(tree, { event: { type: 'booking.completed' }, payload: { market: 'FR' } }), false);
  assert.throws(() => assertConditionTree({ path: 'payload.constructor.prototype', operator: 'equals', value: true }), (error) => error.code === 'AUTOMATION_CONDITION_INVALID');
  assert.throws(() => assertConditionTree({ path: 'event.type', operator: 'eval', value: 'process.exit()' }), (error) => error.code === 'AUTOMATION_CONDITION_INVALID');
});

test('condition depth and cardinality are bounded', () => {
  let tree = { path: 'event.type', operator: 'equals', value: 'booking.completed' };
  for (let index = 0; index < 6; index += 1) tree = { all: [tree] };
  assert.throws(() => assertConditionTree(tree), (error) => error.code === 'AUTOMATION_CONDITION_LIMIT');
  assert.throws(() => assertConditionTree({ all: Array.from({ length: 21 }, () => ({ path: 'event.type', operator: 'equals', value: 'booking.completed' })) }), (error) => error.code === 'AUTOMATION_CONDITION_INVALID');
});

test('trigger and action registries are closed and contain no arbitrary HTTP or code execution', () => {
  assert.deepEqual(Object.keys(TRIGGER_REGISTRY).includes('booking.completed'), true);
  assert.deepEqual(Object.keys(ACTION_REGISTRY).sort(), ['CREATE_REFERRAL_REWARD', 'CREATE_SUPPORT_CASE', 'EMIT_DOMAIN_EVENT', 'ENQUEUE_NOTIFICATION']);
  assert.equal(Object.keys(ACTION_REGISTRY).some((key) => /HTTP|SCRIPT|EVAL|CODE/.test(key)), false);
});

test('automation definition validation rejects unregistered triggers and malicious action metadata', () => {
  const base = { key: 'booking-notice', name: 'Booking notice', featureFlagKey: 'automation.booking.notice', trigger: { eventType: 'booking.completed', schemaVersion: 1 }, actions: [{ actionType: 'EMIT_DOMAIN_EVENT', configuration: { eventType: 'automation.notice.queued' } }], reason: 'Create a bounded automation definition.' };
  assert.throws(() => automationCreateSchema.parse({ ...base, actions: [{ actionType: 'HTTP_REQUEST', configuration: { url: 'https://attacker.invalid' } }] }));
  const parsed = automationCreateSchema.parse(base);
  assert.equal(parsed.trigger.eventType, 'booking.completed');
});

test('program and reward lifecycles prohibit silent rollback and fulfillment from F8', () => {
  assert.equal(PROGRAM_TRANSITIONS.ACTIVE.has('DRAFT'), false);
  assert.equal(PROGRAM_TRANSITIONS.ARCHIVED.size, 0);
  assert.equal(REWARD_TRANSITIONS.PENDING.has('REVERSED'), true);
  assert.equal(REWARD_TRANSITIONS.REVERSED.size, 0);
});

test('automation action identity is stable across retries and unique by action', () => {
  const first = idempotencyKey('version-1', 'event-1', 'action-1');
  assert.equal(first, idempotencyKey('version-1', 'event-1', 'action-1'));
  assert.notEqual(first, idempotencyKey('version-1', 'event-1', 'action-2'));
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('retry backoff is exponential and capped', () => {
  const policy = { initialBackoffSeconds: 30, maxBackoffSeconds: 300 };
  assert.equal(backoffSeconds(policy, 1), 30);
  assert.equal(backoffSeconds(policy, 4), 240);
  assert.equal(backoffSeconds(policy, 10), 300);
});

test('automation errors are redacted before persistence', () => {
  const output = safeError(new Error('Bearer abcdefghijklmnopqrstuvwxyz012345 password=hunter2 person@example.com'));
  assert.doesNotMatch(output, /abcdefghijklmnopqrstuvwxyz|hunter2|person@example/);
  assert.match(output, /REDACTED/);
});

test('code generation is deterministic, high entropy and owner is server-derived', async () => {
  let stored;
  const user = { id: 'user-owner-1', role: 'CLIENT', countryCode: 'ES', clientProfile: { id: 'client-1' } };
  const program = { id: 'program-1', key: 'client-es', status: 'ACTIVE', featureFlagKey: 'referrals.client.es', currentVersion: 1, effectiveAt: null, endsAt: null };
  const tx = { $queryRaw: async () => [{ acquired: true }], referralProgram: { findUnique: async () => program }, referralProgramVersion: { findUnique: async () => ({ id: 'version-1', programId: program.id, version: 1, ...version }) }, featureFlag: { findUnique: async () => ({ status: 'ENABLED', rules: {} }) }, referralCode: { findUnique: async ({ where }) => stored?.code === where.code ? stored : null, count: async () => 0, create: async ({ data }) => { stored = { id: 'code-1', ...data }; return stored; } }, auditLog: { create: async () => ({}) } };
  const database = { $transaction: async (work) => work(tx) };
  const first = await createCode({ input: { programKey: program.key, idempotencyKey: 'code-request-123' }, user, database });
  const second = await createCode({ input: { programKey: program.key, idempotencyKey: 'code-request-123' }, user, database });
  assert.match(first.code.code, /^REF_[A-F0-9]{36}$/);
  assert.equal(second.duplicate, true);
  assert.equal(first.code.ownerUserId, user.id);
});

const claimDatabase = (overrides = {}) => {
  const owner = { id: 'owner-1', role: 'CLIENT', countryCode: 'ES', clientProfile: { id: 'client-owner' } };
  const program = { id: 'program-1', key: 'client-es', status: 'ACTIVE', featureFlagKey: 'referrals.client.es', currentVersion: 1, effectiveAt: null, endsAt: null };
  const code = { id: 'code-1', code: `REF_${'A'.repeat(36)}`, programId: program.id, ownerUserId: owner.id, status: 'ACTIVE', maxUses: 10, useCount: 0, expiresAt: null, revokedAt: null, program, owner };
  const tx = { $queryRaw: async () => [{ acquired: true }], referralCode: { findUnique: async () => ({ ...code, ...overrides }) }, referralProgramVersion: { findUnique: async () => ({ id: 'version-1', programId: program.id, version: 1, ...version }) }, featureFlag: { findUnique: async () => ({ status: 'ENABLED', rules: {} }) }, referral: { findUnique: async () => null, findFirst: async () => null, count: async () => 0, create: async ({ data }) => ({ id: 'referral-1', status: 'CREATED', ...data }) }, auditLog: { create: async () => ({}) }, outboxEvent: { create: async () => ({}) } };
  tx.referralCode.updateMany = async () => ({ count: 1 });
  return { database: { $transaction: async (work) => work(tx) }, code };
};

test('self-referral, revoked, expired and cross-market claims fail closed', async () => {
  const now = new Date('2026-09-08T12:00:00Z');
  const base = claimDatabase();
  await assert.rejects(() => claimReferral({ input: { code: base.code.code, idempotencyKey: 'claim-self-1' }, user: { ...base.code.owner }, database: base.database, now }), (error) => error.code === 'REFERRAL_SELF_REFERRAL');
  const revoked = claimDatabase({ status: 'REVOKED', revokedAt: now });
  await assert.rejects(() => claimReferral({ input: { code: revoked.code.code, idempotencyKey: 'claim-revoked-1' }, user: { id: 'new-1', role: 'CLIENT', countryCode: 'ES', clientProfile: {} }, database: revoked.database, now }), (error) => error.code === 'REFERRAL_CODE_REVOKED');
  const expired = claimDatabase({ expiresAt: new Date(now.getTime() - 1) });
  await assert.rejects(() => claimReferral({ input: { code: expired.code.code, idempotencyKey: 'claim-expired-1' }, user: { id: 'new-1', role: 'CLIENT', countryCode: 'ES', clientProfile: {} }, database: expired.database, now }), (error) => error.code === 'REFERRAL_CODE_EXPIRED');
  const cross = claimDatabase();
  await assert.rejects(() => claimReferral({ input: { code: cross.code.code, idempotencyKey: 'claim-market-1' }, user: { id: 'new-1', role: 'CLIENT', countryCode: 'PT', clientProfile: {} }, database: cross.database, now }), (error) => ['REFERRAL_MARKET_INELIGIBLE', 'REFERRAL_CROSS_MARKET'].includes(error.code));
});

test('reward fulfillment is explicitly blocked and does not touch F3', async () => {
  const database = { $transaction: async (work) => work({ referralReward: { findUnique: async () => ({ id: 'reward-1', status: 'APPROVED' }) } }) };
  await assert.rejects(() => setRewardStatus({ rewardId: 'reward-1', status: 'FULFILLED', reason: 'Attempting unsupported fulfillment.', actorId: 'admin-1', database }), (error) => error.code === 'REFERRAL_REWARD_FULFILLMENT_DISABLED');
});

test('F8 RBAC is narrow and separates activation, execution visibility and rewards', () => {
  assert.equal(PERMISSIONS.AUTOMATION_ACTIVATE, 'automation.activate');
  assert.equal(PERMISSIONS.REFERRAL_REWARDS_MANAGE, 'referrals.rewards.manage');
  assert.equal(ROLE_PERMISSIONS.MARKETING_ADMIN.includes(PERMISSIONS.AUTOMATION_ACTIVATE), true);
  assert.equal(ROLE_PERMISSIONS.ANALYST.includes(PERMISSIONS.AUTOMATION_ACTIVATE), false);
  assert.equal(ROLE_PERMISSIONS.FINANCE_ADMIN.includes(PERMISSIONS.REFERRAL_REWARDS_MANAGE), true);
});

test('F8 migration encodes idempotency, RLS, anti-self-referral and independent outbox fan-out', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/202609080001_referrals_automation/migration.sql'), 'utf8');
  assert.match(migration, /Referral_no_self_referral_check/);
  assert.match(migration, /AutomationExecution_automationVersionId_triggerEventId_key/);
  assert.match(migration, /AutomationStepExecution_idempotencyKey_key/);
  assert.match(migration, /OutboxEvent_automation_delivery/);
  assert.match(migration, /ALTER TABLE "ReferralReward" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE/);
  assert.doesNotMatch(migration, /ON DELETE CASCADE/);
});
