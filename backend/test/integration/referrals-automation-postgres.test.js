require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';
process.env.REFERRALS_ENABLED = 'true';
process.env.AUTOMATION_ENGINE_ENABLED = 'true';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true deliberately.');
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated Supabase test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const prisma = require('../../src/config/prisma');
const app = require('../../src/app');
const { hashPassword } = require('../../src/utils/password');
const { bootstrapRbac } = require('../../src/modules/identity/bootstrap-rbac');
const { createAdminSession } = require('../../src/modules/identity/admin-session.service');
const { createProgram, setProgramStatus, createCode, claimReferral } = require('../../src/modules/referrals/referral.service');
const { createDefinition, setDefinitionStatus } = require('../../src/modules/automation/automation-definition.service');
const { processDeliveryBatch, processStepBatch } = require('../../src/modules/automation/automation-execution.service');

const runId = `f8-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const created = { users: [], programs: [], definitions: [], flags: [], referrals: [], codes: [], executions: [] };
const context = { requestId: `${runId}-request`, correlationId: `${runId}-correlation`, traceId: '8'.repeat(32) };
let passwordHash;

const user = async (label, role = 'CLIENT') => {
  const record = await prisma.user.create({ data: {
    email: `${runId}-${label}@example.test`.toLowerCase(), phone: `integration-${runId}-${label}`.toLowerCase(),
    passwordHash, firstName: label, lastName: 'F8Test', role, countryCode: 'ES', registrationLocale: 'es',
    ...(role === 'CLIENT' ? { clientProfile: { create: { country: 'ES' } } } : { professionalProfile: { create: { status: 'APPROVED', verifiedAt: new Date() } } }),
  } });
  created.users.push(record.id); return prisma.user.findUniqueOrThrow({ where: { id: record.id }, include: { clientProfile: true, professionalProfile: true } });
};

test.before(async () => { await bootstrapRbac(prisma); passwordHash = await hashPassword('integration-password'); });

test.after(async () => {
  await prisma.$transaction(async (tx) => {
    await tx.automationStepExecution.deleteMany({ where: { execution: { automationVersion: { definitionId: { in: created.definitions } } } } });
    await tx.automationExecution.deleteMany({ where: { automationVersion: { definitionId: { in: created.definitions } } } });
    await tx.automationEventDelivery.deleteMany({ where: { sourceEvent: { aggregateId: { in: [...created.programs, ...created.definitions, ...created.referrals, ...created.executions] } } } });
    await tx.outboxEvent.deleteMany({ where: { aggregateId: { in: [...created.programs, ...created.definitions, ...created.referrals, ...created.executions] } } });
    await tx.referralReward.deleteMany({ where: { referralId: { in: created.referrals } } });
    await tx.referralConversion.deleteMany({ where: { referralId: { in: created.referrals } } });
    await tx.referralRiskAssessment.deleteMany({ where: { referralId: { in: created.referrals } } });
    await tx.referral.deleteMany({ where: { id: { in: created.referrals } } });
    await tx.referralCode.deleteMany({ where: { id: { in: created.codes } } });
    await tx.referralProgramVersion.deleteMany({ where: { programId: { in: created.programs } } });
    await tx.referralProgram.deleteMany({ where: { id: { in: created.programs } } });
    await tx.automationAction.deleteMany({ where: { automationVersion: { definitionId: { in: created.definitions } } } });
    await tx.automationTrigger.deleteMany({ where: { automationVersion: { definitionId: { in: created.definitions } } } });
    await tx.automationVersion.deleteMany({ where: { definitionId: { in: created.definitions } } });
    await tx.automationDefinition.deleteMany({ where: { id: { in: created.definitions } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: created.users } }, { correlationId: `${runId}-correlation` }] } });
    await tx.adminSession.deleteMany({ where: { userId: { in: created.users } } });
    await tx.userRoleAssignment.deleteMany({ where: { userId: { in: created.users } } });
    await tx.featureFlag.deleteMany({ where: { id: { in: created.flags } } });
    await tx.user.deleteMany({ where: { id: { in: created.users } } });
  });
  await prisma.$disconnect();
});

test('PostgreSQL proves referral claim and automation effects are concurrent-safe and replay-safe', async () => {
  const [owner, referred, creator] = await Promise.all([user('Owner'), user('Referred'), user('Creator')]);
  const referralFlag = await prisma.featureFlag.create({ data: { key: `${runId}.referrals`, status: 'ENABLED', rules: { environments: ['test'], countries: ['ES'], percentage: 100 } } });
  const automationFlag = await prisma.featureFlag.create({ data: { key: `${runId}.automation`, status: 'ENABLED', rules: { environments: ['test'], percentage: 100 } } });
  created.flags.push(referralFlag.id, automationFlag.id);

  const program = await createProgram({ actorId: creator.id, context, input: {
    key: `${runId}.client`, name: 'F8 integration client referral', featureFlagKey: referralFlag.key,
    version: { referrerActorType: 'CLIENT', referredActorType: 'CLIENT', enabledMarkets: ['ES'], qualifyingEventType: 'booking.completed', waitingPeriodHours: 0, cancellationWindowHours: 24, maxCodesPerOwner: 1, maxUsesPerCode: 10, maxReferralsPerOwner: 10, rewardType: 'NON_MONETARY', nonMonetaryBenefitKey: 'priority-support' },
    reason: 'Create isolated F8 integration program.',
  } });
  created.programs.push(program.id);
  const activeProgram = await setProgramStatus({ programId: program.id, actorId: creator.id, context, input: { status: 'ACTIVE', expectedRowVersion: program.rowVersion, reason: 'Activate isolated F8 integration program.' } });
  assert.equal(activeProgram.status, 'ACTIVE');

  const definition = await createDefinition({ actorId: creator.id, context, input: {
    key: `${runId}.referral-created`, name: 'F8 integration referral observer', featureFlagKey: automationFlag.key,
    trigger: { eventType: 'referral.created', schemaVersion: 1 },
    conditionTree: { path: 'payload.market', operator: 'equals', value: 'ES' },
    actions: [{ actionType: 'EMIT_DOMAIN_EVENT', configuration: { eventType: 'automation.task.created', aggregateType: 'AutomationExecution' }, delaySeconds: 0, maxAttempts: 3, initialBackoffSeconds: 1, maxBackoffSeconds: 5 }],
    reason: 'Create isolated replay-safe F8 automation.',
  } });
  created.definitions.push(definition.id);
  const activeDefinition = await setDefinitionStatus({ definitionId: definition.id, actorId: creator.id, context, input: { status: 'ACTIVE', expectedRowVersion: definition.rowVersion, versionId: definition.versions[0].id, reason: 'Activate isolated F8 integration automation.' } });
  assert.equal(activeDefinition.status, 'ACTIVE');

  const codeResult = await createCode({ user: owner, context, input: { programKey: program.key, idempotencyKey: `${runId}:owner-code` } });
  created.codes.push(codeResult.code.id);
  assert.match(codeResult.code.code, /^REF_[A-Z0-9]{36}$/);
  const claims = await Promise.all([1, 2].map(() => claimReferral({ user: referred, context, input: { code: codeResult.code.code, idempotencyKey: `${runId}:claim` } })));
  created.referrals.push(claims[0].referral.id);
  assert.equal(new Set(claims.map((item) => item.referral.id)).size, 1);
  assert.equal(claims.filter((item) => item.duplicate).length, 1);
  assert.equal((await prisma.referralCode.findUniqueOrThrow({ where: { id: codeResult.code.id } })).useCount, 1);
  assert.equal(await prisma.referralRiskAssessment.count({ where: { referralId: claims[0].referral.id } }), 1);

  const referralEvent = await prisma.outboxEvent.findFirstOrThrow({ where: { eventType: 'referral.created', aggregateId: claims[0].referral.id } });
  await prisma.automationEventDelivery.update({ where: { sourceEventId: referralEvent.id }, data: { availableAt: new Date(0) } });
  await Promise.all([processDeliveryBatch({ database: prisma, batchSize: 50 }), processDeliveryBatch({ database: prisma, batchSize: 50 })]);
  const createdExecutions = await prisma.automationExecution.findMany({ where: { automationVersion: { definitionId: definition.id }, triggerEvent: { aggregateId: claims[0].referral.id } }, include: { steps: true } });
  assert.equal(createdExecutions.length, 1);
  created.executions.push(createdExecutions[0].id);
  await prisma.automationStepExecution.updateMany({ where: { executionId: createdExecutions[0].id }, data: { nextAttemptAt: new Date(0) } });
  await Promise.all([processStepBatch({ database: prisma, batchSize: 50 }), processStepBatch({ database: prisma, batchSize: 50 })]);
  const executions = await prisma.automationExecution.findMany({ where: { automationVersion: { definitionId: definition.id }, triggerEvent: { aggregateId: claims[0].referral.id } }, include: { steps: true } });
  assert.equal(executions.length, 1);
  assert.equal(executions[0].status, 'SUCCEEDED');
  assert.equal(executions[0].steps.length, 1);
  assert.equal(executions[0].steps[0].status, 'SUCCEEDED');
  assert.equal(await prisma.outboxEvent.count({ where: { eventType: 'automation.task.created', aggregateId: executions[0].id, payload: { path: ['sourceEventId'], equals: executions[0].triggerEventId } } }), 1);
  await processDeliveryBatch({ database: prisma, batchSize: 50 }); await processStepBatch({ database: prisma, batchSize: 50 });
  assert.equal(await prisma.automationExecution.count({ where: { automationVersion: { definitionId: definition.id }, triggerEvent: { aggregateId: claims[0].referral.id } } }), 1);
  assert.equal(await prisma.outboxEvent.count({ where: { eventType: 'automation.task.created', aggregateId: executions[0].id } }), 1);
  assert.equal(await prisma.ledgerTransaction.count({ where: { OR: [
    { idempotencyKey: { contains: claims[0].referral.id } },
    { description: { contains: claims[0].referral.id } },
    { metadata: { path: ['referralId'], equals: claims[0].referral.id } },
  ] } }), 0);
});

test('F8 admin APIs require dedicated RBAC and audit denied reads', async () => {
  const supportRole = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPPORT_ADMIN' } });
  const support = await user('Support');
  await prisma.userRoleAssignment.create({ data: { userId: support.id, roleId: supportRole.id, status: 'ACTIVE' } });
  const session = await createAdminSession({ email: support.email, password: 'integration-password', userAgent: 'f8-integration', ipAddress: '127.0.0.1' }, prisma);
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/admin`;
    assert.equal((await fetch(`${base}/referrals/programs`)).status, 401);
    const denied = await fetch(`${base}/automation/definitions`, { headers: { authorization: `Bearer ${session.accessToken}`, 'x-correlation-id': `${runId}-correlation` } });
    assert.equal(denied.status, 403);
    assert.equal(await prisma.auditLog.count({ where: { actorId: support.id, action: 'AUTHORIZATION_DENIED', resourceId: 'automation.read' } }), 1);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
