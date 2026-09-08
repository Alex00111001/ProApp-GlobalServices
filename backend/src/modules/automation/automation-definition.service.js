const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { canonicalDigest, operationalError } = require('../privacy/privacy-utils');
const { telemetryMetadata } = require('../observability/context');
const { validateAutomationVersion } = require('./registries');

const TRANSITIONS = Object.freeze({ DRAFT: new Set(['ACTIVE', 'ARCHIVED']), ACTIVE: new Set(['PAUSED', 'ARCHIVED']), PAUSED: new Set(['ACTIVE', 'ARCHIVED']), ARCHIVED: new Set() });
const assertEnabled = () => { if (!env.automationEngineEnabled && env.environment !== 'test') throw operationalError('Automation engine is disabled.', 'AUTOMATION_ENGINE_DISABLED', 503); };
const evidence = (context = {}) => ({ requestId: context.requestId, correlationId: context.correlationId, traceId: context.traceId });

const createVersionRecord = async (tx, definitionId, version, input) => {
  const validated = validateAutomationVersion(input);
  const digest = canonicalDigest(validated);
  return tx.automationVersion.create({ data: {
    definitionId, version, conditionTree: validated.conditionTree, configurationDigest: digest,
    trigger: { create: validated.trigger },
    actions: { create: validated.actions.map(({ position, actionType, configuration, delaySeconds, maxAttempts, initialBackoffSeconds, maxBackoffSeconds }) => ({ position, actionType, configuration, delaySeconds, maxAttempts, initialBackoffSeconds, maxBackoffSeconds })) },
  }, include: { trigger: true, actions: { orderBy: { position: 'asc' } } } });
};

const createDefinition = async ({ input, actorId, context = {}, database = prisma }) => {
  assertEnabled();
  return database.$transaction(async (tx) => {
    const definition = await tx.automationDefinition.create({ data: { key: input.key, name: input.name, featureFlagKey: input.featureFlagKey, createdById: actorId } });
    const version = await createVersionRecord(tx, definition.id, 1, input);
    await tx.auditLog.create({ data: { actorId, action: 'AUTOMATION_DEFINITION_CREATED', resourceType: 'AutomationDefinition', resourceId: definition.id, reason: input.reason, after: { key: definition.key, version: 1 }, ...evidence(context) } });
    await tx.outboxEvent.create({ data: { aggregateType: 'AutomationDefinition', aggregateId: definition.id, eventType: 'automation.definition.created', payload: { definitionId: definition.id, key: definition.key, version: 1 }, metadata: telemetryMetadata(context) } });
    return { ...definition, versions: [version] };
  });
};

const createVersion = async ({ definitionId, input, actorId, context = {}, database = prisma }) => {
  assertEnabled();
  return database.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`automation-definition:${definitionId}`}, 0)) IS NULL AS acquired`);
    const definition = await tx.automationDefinition.findUnique({ where: { id: definitionId } });
    if (!definition) throw operationalError('Automation definition not found.', 'AUTOMATION_NOT_FOUND', 404);
    if (!['DRAFT', 'PAUSED'].includes(definition.status)) throw operationalError('Active definitions must be paused before versioning.', 'AUTOMATION_VERSION_LOCKED', 409);
    const nextVersion = definition.currentVersion + 1;
    const version = await createVersionRecord(tx, definitionId, nextVersion, input);
    await tx.automationDefinition.update({ where: { id: definitionId }, data: { currentVersion: nextVersion, rowVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId, action: 'AUTOMATION_VERSION_CREATED', resourceType: 'AutomationDefinition', resourceId: definitionId, reason: input.reason, before: { version: definition.currentVersion }, after: { version: nextVersion }, ...evidence(context) } });
    return version;
  });
};

const setDefinitionStatus = async ({ definitionId, input, actorId, context = {}, database = prisma, now = new Date() }) => {
  assertEnabled();
  return database.$transaction(async (tx) => {
    const definition = await tx.automationDefinition.findUnique({ where: { id: definitionId } });
    if (!definition) throw operationalError('Automation definition not found.', 'AUTOMATION_NOT_FOUND', 404);
    if (definition.rowVersion !== input.expectedRowVersion) throw operationalError('Automation definition was changed concurrently.', 'AUTOMATION_CONFLICT', 409);
    if (!TRANSITIONS[definition.status].has(input.status)) throw operationalError('Automation lifecycle transition is invalid.', 'AUTOMATION_TRANSITION_INVALID', 409);
    const version = input.versionId
      ? await tx.automationVersion.findFirst({ where: { id: input.versionId, definitionId } , include: { trigger: true, actions: { orderBy: { position: 'asc' } } } })
      : await tx.automationVersion.findUnique({ where: { definitionId_version: { definitionId, version: definition.currentVersion } }, include: { trigger: true, actions: { orderBy: { position: 'asc' } } } });
    if (!version) throw operationalError('Automation version not found.', 'AUTOMATION_VERSION_NOT_FOUND', 404);
    const validated = validateAutomationVersion({ trigger: { eventType: version.trigger.eventType, schemaVersion: version.trigger.schemaVersion }, conditionTree: version.conditionTree, actions: version.actions.map((action) => ({ actionType: action.actionType, configuration: action.configuration, delaySeconds: action.delaySeconds, maxAttempts: action.maxAttempts, initialBackoffSeconds: action.initialBackoffSeconds, maxBackoffSeconds: action.maxBackoffSeconds })) });
    if (version.configurationDigest !== canonicalDigest(validated)) throw operationalError('Automation version integrity check failed.', 'AUTOMATION_VERSION_INVALID', 409);
    if (input.status === 'ACTIVE') {
      await tx.automationVersion.updateMany({ where: { definitionId, activatedAt: { not: null }, retiredAt: null, id: { not: version.id } }, data: { retiredAt: now } });
      await tx.automationVersion.update({ where: { id: version.id }, data: { activatedAt: version.activatedAt || now, retiredAt: null } });
    }
    if (input.status === 'ARCHIVED') await tx.automationVersion.updateMany({ where: { definitionId, retiredAt: null }, data: { retiredAt: now } });
    const updated = await tx.automationDefinition.update({ where: { id: definitionId }, data: { status: input.status, currentVersion: version.version, rowVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId, action: 'AUTOMATION_STATUS_CHANGED', resourceType: 'AutomationDefinition', resourceId: definitionId, reason: input.reason, before: { status: definition.status }, after: { status: updated.status, version: version.version }, ...evidence(context) } });
    await tx.outboxEvent.create({ data: { aggregateType: 'AutomationDefinition', aggregateId: definitionId, eventType: `automation.definition.${updated.status.toLowerCase()}`, payload: { definitionId, status: updated.status, version: version.version }, metadata: telemetryMetadata(context) } });
    return updated;
  });
};

module.exports = { TRANSITIONS, createDefinition, createVersion, setDefinitionStatus };
