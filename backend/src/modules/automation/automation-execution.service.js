const { createHash } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { isFeatureEnabled } = require('../configuration/feature-flags.service');
const { enforceConsent } = require('../privacy/consent.service');
const { canonicalDigest, operationalError } = require('../privacy/privacy-utils');
const { redactText, sanitizeTelemetry } = require('../observability/redaction');
const { observeAutomationOperation } = require('../observability/metrics');
const { evaluateConditionTree } = require('./registries');
const { ensureRewards, qualifyFromEvent, reverseFromEvent, processDueReferrals } = require('../referrals/referral.service');

const safeError = (error) => redactText(error?.message || error || 'Unknown automation error').slice(0, 1_024);
const idempotencyKey = (versionId, eventId, actionId) => createHash('sha256').update(`${versionId}:${eventId}:${actionId}`).digest('hex');
const backoffSeconds = (action, attempts) => Math.min(action.maxBackoffSeconds, action.initialBackoffSeconds * (2 ** Math.max(0, attempts - 1)));

const claimDeliveries = ({ batchSize = env.automationWorkerBatchSize, leaseMs = 60_000, database = prisma } = {}) => database.$transaction((tx) => tx.$queryRaw(Prisma.sql`
  WITH candidates AS (
    SELECT "id" FROM "AutomationEventDelivery"
    WHERE (("status" IN ('PENDING'::"AutomationDeliveryStatus", 'FAILED'::"AutomationDeliveryStatus") AND "availableAt" <= CURRENT_TIMESTAMP)
      OR ("status" = 'PROCESSING'::"AutomationDeliveryStatus" AND "lockedAt" <= CURRENT_TIMESTAMP - (${leaseMs} * INTERVAL '1 millisecond')))
    ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
  )
  UPDATE "AutomationEventDelivery" delivery SET "status" = 'PROCESSING'::"AutomationDeliveryStatus", "lockedAt" = CURRENT_TIMESTAMP,
    "attempts" = delivery."attempts" + 1, "lastError" = NULL FROM candidates WHERE delivery."id" = candidates."id" RETURNING delivery.*
`));

const factsFor = (event) => ({
  event: { type: event.eventType, aggregateType: event.aggregateType, aggregateId: event.aggregateId },
  payload: {
    status: event.payload?.status, market: event.payload?.market, actorType: event.payload?.actorType,
    reasonCode: event.payload?.reasonCode, rewardType: event.payload?.rewardType,
    beneficiarySide: event.payload?.beneficiarySide, purpose: event.payload?.purpose,
  },
});

const createExecutionsForDelivery = async (delivery, database = prisma) => {
  const event = await database.outboxEvent.findUnique({ where: { id: delivery.sourceEventId } });
  if (!event) throw operationalError('Source event no longer exists.', 'AUTOMATION_SOURCE_EVENT_MISSING', 409);
  await qualifyFromEvent({ event, database });
  await reverseFromEvent({ event, database });
  const definitions = await database.automationDefinition.findMany({ where: { status: 'ACTIVE', versions: { some: { trigger: { eventType: event.eventType }, retiredAt: null } } }, include: { versions: { where: { trigger: { eventType: event.eventType }, retiredAt: null }, include: { trigger: true, actions: { orderBy: { position: 'asc' } } } } } });
  let created = 0;
  for (const definition of definitions) {
    const version = definition.versions.find((item) => item.version === definition.currentVersion);
    if (!version) continue;
    const enabled = await isFeatureEnabled(definition.featureFlagKey, { environment: env.environment, subjectId: event.aggregateId }, database);
    const conditionMatched = enabled && evaluateConditionTree(version.conditionTree, factsFor(event));
    try {
      await database.$transaction(async (tx) => {
        const execution = await tx.automationExecution.create({ data: { automationVersionId: version.id, triggerEventId: event.id, status: conditionMatched ? 'RUNNING' : 'SKIPPED', startedAt: conditionMatched ? new Date() : undefined, completedAt: conditionMatched ? undefined : new Date(), correlationId: event.metadata?.correlationId, traceId: event.metadata?.traceId } });
        if (conditionMatched) await tx.automationStepExecution.createMany({ data: version.actions.map((action) => ({ executionId: execution.id, actionId: action.id, idempotencyKey: idempotencyKey(version.id, event.id, action.id), nextAttemptAt: new Date(Date.now() + action.delaySeconds * 1_000) })) });
      });
      created += 1;
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
    }
  }
  const updated = await database.automationEventDelivery.updateMany({ where: { id: delivery.id, status: 'PROCESSING', lockedAt: delivery.lockedAt }, data: { status: 'PROCESSED', processedAt: new Date(), lockedAt: null, lastError: null } });
  if (updated.count !== 1) throw operationalError('Automation delivery lease was lost.', 'AUTOMATION_LEASE_LOST', 409);
  observeAutomationOperation({ operation: 'triggered', outcome: created ? 'matched' : 'skipped', queueAgeSeconds: Math.max(0, (Date.now() - delivery.createdAt.getTime()) / 1000) });
  return { created };
};

const processDeliveryBatch = async ({ database = prisma, batchSize } = {}) => {
  if (!env.automationEngineEnabled) return { claimed: 0, processed: 0, failed: 0 };
  const deliveries = await claimDeliveries({ database, batchSize });
  let processed = 0; let failed = 0;
  for (const delivery of deliveries) {
    try { await createExecutionsForDelivery(delivery, database); processed += 1; }
    catch (error) {
      const exhausted = delivery.attempts >= 8 || (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429);
      await database.automationEventDelivery.updateMany({ where: { id: delivery.id, status: 'PROCESSING', lockedAt: delivery.lockedAt }, data: { status: exhausted ? 'DEAD_LETTER' : 'FAILED', availableAt: new Date(Date.now() + Math.min(3_600_000, 1_000 * (2 ** delivery.attempts))), lockedAt: null, lastError: safeError(error) } });
      failed += 1;
    }
  }
  return { claimed: deliveries.length, processed, failed };
};

const claimSteps = ({ batchSize = env.automationWorkerBatchSize, leaseMs = 60_000, database = prisma } = {}) => database.$transaction((tx) => tx.$queryRaw(Prisma.sql`
  WITH candidates AS (
    SELECT "id" FROM "AutomationStepExecution"
    WHERE (("status" IN ('PENDING'::"AutomationStepExecutionStatus", 'FAILED'::"AutomationStepExecutionStatus") AND "nextAttemptAt" <= CURRENT_TIMESTAMP)
      OR ("status" = 'RUNNING'::"AutomationStepExecutionStatus" AND "lockedAt" <= CURRENT_TIMESTAMP - (${leaseMs} * INTERVAL '1 millisecond')))
    ORDER BY "nextAttemptAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
  )
  UPDATE "AutomationStepExecution" step SET "status" = 'RUNNING'::"AutomationStepExecutionStatus", "lockedAt" = CURRENT_TIMESTAMP,
    "attempts" = step."attempts" + 1, "startedAt" = COALESCE(step."startedAt", CURRENT_TIMESTAMP), "lastError" = NULL
  FROM candidates WHERE step."id" = candidates."id" RETURNING step.*
`));

const recipientFrom = (payload, path) => path.split('.').reduce((value, key) => value?.[key], { payload });
const executeAction = async ({ tx, step, action, execution, event, version }) => {
  const config = action.configuration;
  if (action.actionType === 'CREATE_REFERRAL_REWARD') {
    const referralId = event.payload?.referralId;
    const referral = referralId ? await tx.referral.findUnique({ where: { id: referralId }, include: { programVersion: true } }) : null;
    if (!referral) throw operationalError('Referral action requires an authoritative referral.', 'AUTOMATION_REFERRAL_MISSING', 422);
    const eligibleAt = new Date(referral.qualifiedAt || referral.createdAt);
    await ensureRewards(tx, referral, referral.programVersion, eligibleAt, canonicalDigest({ executionId: execution.id, eventId: event.id }));
    return { referralId };
  }
  if (action.actionType === 'CREATE_SUPPORT_CASE') {
    const caseKey = `AUTO-${step.idempotencyKey.slice(0, 12).toUpperCase()}`;
    const existing = await tx.supportCase.findUnique({ where: { caseKey } });
    if (existing) return { supportCaseId: existing.id };
    const created = await tx.supportCase.create({ data: { caseKey, subject: config.subject, description: `Created by allowlisted automation ${version.id}. Source event ${event.id}.`, category: config.category, priority: config.priority, createdById: version.definition.createdById } });
    await tx.supportCaseEvent.create({ data: { caseId: created.id, actorId: version.definition.createdById, eventType: 'CREATED', toStatus: 'OPEN', metadata: { automationExecutionId: execution.id } } });
    await tx.outboxEvent.create({ data: { aggregateType: 'SupportCase', aggregateId: created.id, eventType: 'support.case.created', payload: { caseId: created.id, caseKey, status: created.status, priority: created.priority, category: created.category }, metadata: { correlationId: execution.correlationId, traceId: execution.traceId } } });
    await tx.auditLog.create({ data: { actorId: version.definition.createdById, action: 'AUTOMATION_SUPPORT_CASE_CREATED', resourceType: 'SupportCase', resourceId: created.id, metadata: { automationExecutionId: execution.id }, correlationId: execution.correlationId, traceId: execution.traceId } });
    return { supportCaseId: created.id };
  }
  if (action.actionType === 'ENQUEUE_NOTIFICATION') {
    const userId = recipientFrom(event.payload, config.recipientPath);
    const user = userId ? await tx.user.findUnique({ where: { id: userId }, include: { professionalProfile: true } }) : null;
    if (!user) throw operationalError('Notification recipient is not authoritative.', 'AUTOMATION_RECIPIENT_INVALID', 422);
    if (config.type === 'PROMOTION' || config.purpose) await enforceConsent({ identity: { userId: user.id, professionalId: user.professionalProfile?.id }, purpose: config.purpose || 'marketing_attribution', countryCode: config.countryCode || user.countryCode, locale: config.locale || user.registrationLocale || 'es-ES', database: tx });
    const notification = await tx.notification.create({ data: { userId, type: config.type, title: config.title, message: config.message } });
    return { notificationId: notification.id };
  }
  if (action.actionType === 'EMIT_DOMAIN_EVENT') {
    const emitted = await tx.outboxEvent.create({ data: { aggregateType: 'AutomationExecution', aggregateId: execution.id, eventType: config.eventType, payload: { executionId: execution.id, sourceEventId: event.id }, metadata: { correlationId: execution.correlationId, traceId: execution.traceId } } });
    return { outboxEventId: emitted.id };
  }
  throw operationalError('Action type is not allowlisted.', 'AUTOMATION_ACTION_NOT_ALLOWED', 422);
};

const refreshExecutionStatus = async (executionId, tx) => {
  const steps = await tx.automationStepExecution.findMany({ where: { executionId }, select: { status: true } });
  const statuses = new Set(steps.map((item) => item.status));
  if (statuses.has('EXHAUSTED')) return tx.automationExecution.update({ where: { id: executionId }, data: { status: 'EXHAUSTED', completedAt: new Date() } });
  if ([...statuses].every((status) => ['SUCCEEDED', 'SKIPPED'].includes(status))) return tx.automationExecution.update({ where: { id: executionId }, data: { status: 'SUCCEEDED', completedAt: new Date() } });
  if (statuses.has('FAILED')) return tx.automationExecution.update({ where: { id: executionId }, data: { status: 'FAILED' } });
  return tx.automationExecution.update({ where: { id: executionId }, data: { status: 'RUNNING' } });
};

const processStep = async (claimed, database = prisma) => {
  const loaded = await database.automationStepExecution.findUnique({ where: { id: claimed.id }, include: { action: true, execution: { include: { triggerEvent: true, automationVersion: { include: { definition: true } } } } } });
  if (!loaded) return;
  const { action, execution } = loaded; const event = execution.triggerEvent; const version = execution.automationVersion;
  try {
    await database.$transaction(async (tx) => {
      const current = await tx.automationStepExecution.findUnique({ where: { id: loaded.id } });
      if (!current || current.status !== 'RUNNING' || current.lockedAt?.getTime() !== claimed.lockedAt.getTime()) throw operationalError('Automation step lease was lost.', 'AUTOMATION_LEASE_LOST', 409);
      const result = await executeAction({ tx, step: current, action, execution, event, version });
      await tx.automationStepExecution.update({ where: { id: current.id }, data: { status: 'SUCCEEDED', completedAt: new Date(), lockedAt: null, resultReference: sanitizeTelemetry(result) } });
      await refreshExecutionStatus(execution.id, tx);
      observeAutomationOperation({ operation: 'action', outcome: 'succeeded', durationSeconds: Math.max(0, (Date.now() - current.startedAt.getTime()) / 1000) });
    });
  } catch (error) {
    const consentSkip = ['CONSENT_ENFORCEMENT_DENIED', 'CONSENT_GRANT_REQUIRED', 'CONSENT_PROCESSING_PROHIBITED'].includes(error.code);
    const retryable = !error.statusCode || error.statusCode >= 500 || error.statusCode === 429;
    const exhausted = !retryable || claimed.attempts >= action.maxAttempts;
    await database.$transaction(async (tx) => {
      await tx.automationStepExecution.updateMany({ where: { id: claimed.id, status: 'RUNNING', lockedAt: claimed.lockedAt }, data: { status: consentSkip ? 'SKIPPED' : exhausted ? 'EXHAUSTED' : 'FAILED', nextAttemptAt: new Date(Date.now() + backoffSeconds(action, claimed.attempts) * 1_000), lockedAt: null, firstFailureAt: loaded.firstFailureAt || new Date(), lastFailureAt: new Date(), lastError: safeError(error), ...(consentSkip || exhausted ? { completedAt: new Date() } : {}) } });
      await tx.automationExecution.update({ where: { id: execution.id }, data: { attemptCount: { increment: 1 }, firstFailureAt: execution.firstFailureAt || new Date(), lastFailureAt: new Date(), lastError: safeError(error) } });
      await refreshExecutionStatus(execution.id, tx);
      observeAutomationOperation({ operation: 'action', outcome: consentSkip ? 'skipped' : exhausted ? 'exhausted' : 'retry', reason: error.code || 'error' });
    });
  }
};

const processStepBatch = async ({ database = prisma, batchSize } = {}) => {
  if (!env.automationEngineEnabled) return { claimed: 0, processed: 0 };
  const steps = await claimSteps({ database, batchSize });
  for (const step of steps) await processStep(step, database);
  return { claimed: steps.length, processed: steps.length };
};

const runAutomationCycle = async ({ database = prisma } = {}) => ({
  deliveries: await processDeliveryBatch({ database }),
  steps: await processStepBatch({ database }),
  dueReferrals: await processDueReferrals({ database }),
});

module.exports = { backoffSeconds, claimDeliveries, claimSteps, createExecutionsForDelivery, factsFor, idempotencyKey, processDeliveryBatch, processStepBatch, runAutomationCycle, safeError };
