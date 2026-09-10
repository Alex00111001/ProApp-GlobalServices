const { Prisma } = require('@prisma/client');
const env = require('../../config/env');
const prisma = require('../../config/prisma');
const { writeAuditLog } = require('../audit/audit.service');
const { featureFlagRulesSchema, isFeatureEnabled } = require('../configuration/feature-flags.service');
const { resolveMarketPolicy } = require('../markets/market.service');
const { observeExperimentOperation } = require('../observability/metrics');
const { enforceSubjectConsent } = require('../privacy/consent.service');
const { resolveTrustedSubject } = require('../privacy/identity-proof.service');
const { asynchronousEvidence, canonicalDigest, operationalError, requestEvidence, sanitizePrivateObject } = require('../privacy/privacy-utils');
const { bucketFor, evaluateAudience, selectVariant, validateDefinition } = require('./registry');
const { summarizeAnalysis } = require('./statistics');

const TRANSITIONS = Object.freeze({
  DRAFT: new Set(['READY', 'ARCHIVED']),
  READY: new Set(['RUNNING', 'DRAFT', 'ARCHIVED']),
  RUNNING: new Set(['PAUSED', 'COMPLETED']),
  PAUSED: new Set(['RUNNING', 'COMPLETED', 'ARCHIVED']),
  COMPLETED: new Set(['ARCHIVED']),
  ARCHIVED: new Set(),
});

const assertEnabled = () => {
  if (!env.experimentsContentSeoEnabled || !env.experimentsEnabled) {
    throw operationalError('Experiment capability is unavailable.', 'EXPERIMENTS_DISABLED', 503);
  }
};
const lockExperiment = async (tx, id) => {
  if (typeof tx.$queryRaw === 'function') await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`experiment:${id}`}, 0)) IS NULL AS acquired`);
};
const versionInclude = { audience: true, variants: { orderBy: { key: 'asc' } }, metrics: { orderBy: { key: 'asc' } }, marketPolicyVersion: true };

const assertVersionPolicy = (experiment, version, resolved) => {
  if (!version || version.marketPolicyVersionId !== resolved.policy.id || experiment.marketId !== resolved.market.id) {
    throw operationalError('Experiment policy version is stale.', 'EXPERIMENT_POLICY_STALE', 409);
  }
};

const createExperiment = async ({ input, actorId, req, database = prisma }) => {
  assertEnabled();
  const resolved = await resolveMarketPolicy({ marketCode: input.marketCode, client: database, requireActive: false });
  if (!resolved.policy) throw operationalError('Market policy is unavailable.', 'MARKET_POLICY_UNAVAILABLE', 409);
  const created = await database.experiment.create({ data: {
    key: input.key, name: input.name, description: input.description, marketId: resolved.market.id,
    layerKey: input.layerKey, surface: input.surface, featureFlagKey: input.featureFlagKey,
    trafficAllocationBps: input.trafficAllocationBps, createdById: actorId,
  } });
  await writeAuditLog({ req, action: 'EXPERIMENT_CREATED', resourceType: 'EXPERIMENT', resourceId: created.id, after: { key: created.key, marketCode: resolved.market.code } }, database);
  observeExperimentOperation({ operation: 'definition_created', outcome: 'accepted' });
  return created;
};

const createVersion = async ({ experimentId, input, actorId, req, database = prisma }) => {
  assertEnabled();
  const definition = validateDefinition(input);
  const work = async (tx) => {
    await lockExperiment(tx, experimentId);
    const experiment = await tx.experiment.findUnique({ where: { id: experimentId }, include: { market: true } });
    if (!experiment) throw operationalError('Experiment not found.', 'EXPERIMENT_NOT_FOUND', 404);
    if (experiment.status !== 'DRAFT') throw operationalError('Only a draft experiment can receive a version.', 'EXPERIMENT_VERSION_LOCKED', 409);
    const resolved = await resolveMarketPolicy({ marketCode: experiment.market.code, client: tx, requireActive: false });
    if (!resolved.policy) throw operationalError('Market policy is unavailable.', 'MARKET_POLICY_UNAVAILABLE', 409);
    const next = experiment.currentVersion;
    const version = await tx.experimentVersion.create({ data: {
      experimentId, marketPolicyVersionId: resolved.policy.id, version: next, purpose: input.purpose,
      startAt: input.startAt, endAt: input.endAt, analysisAt: input.analysisAt, timezone: input.timezone,
      minimumSampleSize: input.minimumSampleSize, significanceAlpha: input.significanceAlpha,
      configurationDigest: definition.configurationDigest,
      audience: { create: { conditionTree: definition.audience, configurationDigest: canonicalDigest(definition.audience) } },
      variants: { create: definition.variants }, metrics: { create: definition.metrics },
    }, include: versionInclude });
    await tx.experiment.update({ where: { id: experimentId }, data: { currentVersion: next + 1, rowVersion: { increment: 1 } } });
    return version;
  };
  const version = database.$transaction ? await database.$transaction(work) : await work(database);
  await writeAuditLog({ req, action: 'EXPERIMENT_VERSION_CREATED', resourceType: 'EXPERIMENT_VERSION', resourceId: version.id, after: { experimentId, version: version.version, configurationDigest: version.configurationDigest } }, database);
  observeExperimentOperation({ operation: 'version_created', outcome: 'accepted' });
  return version;
};

const setExperimentStatus = async ({ experimentId, status, reason, actorId, req, database = prisma, now = new Date() }) => {
  assertEnabled();
  const work = async (tx) => {
    await lockExperiment(tx, experimentId);
    const experiment = await tx.experiment.findUnique({ where: { id: experimentId }, include: { market: true, versions: { orderBy: { version: 'desc' }, take: 1, include: versionInclude } } });
    if (!experiment) throw operationalError('Experiment not found.', 'EXPERIMENT_NOT_FOUND', 404);
    if (!TRANSITIONS[experiment.status]?.has(status)) throw operationalError('Experiment lifecycle transition is invalid.', 'EXPERIMENT_TRANSITION_INVALID', 409);
    const version = experiment.versions[0];
    if (['READY', 'RUNNING'].includes(status)) {
      if (!version) throw operationalError('Experiment version is required.', 'EXPERIMENT_VERSION_REQUIRED', 409);
      validateDefinition({
        audience: version.audience?.conditionTree,
        variants: version.variants.map(({ key, name, isControl, weightBps, payload }) => ({ key, name, isControl, weightBps, payload })),
        metrics: version.metrics.map(({ key, role, eventName, aggregation, windowHours, direction, minimumSampleSize, guardrailThreshold }) => ({ key, role, eventName, aggregation, windowHours, direction, minimumSampleSize, ...(guardrailThreshold == null ? {} : { guardrailThreshold }) })),
      });
      const resolved = await resolveMarketPolicy({ marketCode: experiment.market.code, client: tx, requireActive: status === 'RUNNING', now });
      assertVersionPolicy(experiment, version, resolved);
      if (status === 'RUNNING' && experiment.trafficAllocationBps < 1) throw operationalError('A non-zero traffic allocation is required before running.', 'EXPERIMENT_NOT_RUNNABLE', 409);
      if (status === 'RUNNING') {
        const flag = await tx.featureFlag.findUnique({ where: { key: experiment.featureFlagKey } });
        const rules = featureFlagRulesSchema.safeParse(flag?.rules || {});
        if (!flag || flag.status !== 'ENABLED' || !rules.success || (rules.data.percentage ?? 100) < 1) throw operationalError('Experiment feature flag is not activation-ready.', 'EXPERIMENT_FEATURE_FLAG_INVALID', 409);
      }
    }
    const data = { status, rowVersion: { increment: 1 }, ...(status === 'RUNNING' ? { killSwitch: false } : {}), ...(['PAUSED', 'COMPLETED', 'ARCHIVED'].includes(status) ? { killSwitch: true } : {}) };
    const updated = await tx.experiment.update({ where: { id: experimentId }, data });
    if (version) await tx.experimentVersion.update({ where: { id: version.id }, data: {
      ...(status === 'READY' ? { readyAt: now } : {}), ...(status === 'RUNNING' && !version.startedAt ? { startedAt: now } : {}), ...(status === 'COMPLETED' ? { completedAt: now } : {}),
    } });
    return { before: experiment, updated };
  };
  const result = database.$transaction ? await database.$transaction(work) : await work(database);
  await writeAuditLog({ req, action: 'EXPERIMENT_STATUS_CHANGED', resourceType: 'EXPERIMENT', resourceId: experimentId, reason, before: { status: result.before.status }, after: { status }, metadata: { actorId } }, database);
  observeExperimentOperation({ operation: 'lifecycle', outcome: status.toLowerCase() });
  return result.updated;
};

const factsFor = async ({ subject, resolved, locale, experiment, database }) => {
  const user = subject.userId ? await database.user.findUnique({ where: { id: subject.userId }, select: {
    role: true, isActive: true, createdAt: true,
    clientProfile: { select: { _count: { select: { bookings: true } } } },
    professionalProfile: { select: { _count: { select: { bookings: true } } } },
  } }) : null;
  return {
    market: { code: resolved.market.code }, country: { code: resolved.market.country.isoAlpha2.trim() }, locale,
    actorType: user?.role || subject.subjectType, lifecycleStatus: user ? (user.isActive ? 'ACTIVE' : 'INACTIVE') : 'ANONYMOUS',
    campaign: { source: null }, featureEligible: true,
    activity: { registrationCount: user ? 1 : 0, bookingCount: (user?.clientProfile?._count?.bookings || 0) + (user?.professionalProfile?._count?.bookings || 0), completedBookingCount: 0 },
  };
};

const assignVariant = async ({ key, marketCode, locale, proof, identity = {}, context = {}, database = prisma, now = new Date() }) => {
  assertEnabled();
  const subject = resolveTrustedSubject({ identity, proof });
  const resolved = await resolveMarketPolicy({ marketCode, client: database, requireActive: true, now });
  if (!resolved.market.supportedLocales.includes(locale)) throw operationalError('Locale is not supported.', 'EXPERIMENT_LOCALE_UNSUPPORTED', 400);
  const experiment = await database.experiment.findFirst({ where: { key, marketId: resolved.market.id }, include: { versions: { orderBy: { version: 'desc' }, take: 1, include: versionInclude } } });
  if (!experiment || experiment.status !== 'RUNNING' || experiment.killSwitch) throw operationalError('Experiment is unavailable.', 'EXPERIMENT_UNAVAILABLE', 404);
  const version = experiment.versions[0];
  assertVersionPolicy(experiment, version, resolved);
  if ((version.startAt && version.startAt > now) || (version.endAt && version.endAt <= now)) throw operationalError('Experiment is outside its active window.', 'EXPERIMENT_OUTSIDE_WINDOW', 404);
  const consent = await enforceSubjectConsent({ purpose: version.purpose, countryCode: resolved.market.country.isoAlpha2.trim(), locale, subject, at: now, database });
  const flag = await isFeatureEnabled(experiment.featureFlagKey, { environment: env.environment, country: resolved.market.country.isoAlpha2.trim(), subjectId: subject.subjectKey }, database);
  const rolloutBucket = bucketFor({ versionId: `rollout:${version.id}`, subjectKey: subject.subjectKey, secret: env.experimentAssignmentSecret });
  if (!flag || rolloutBucket >= experiment.trafficAllocationBps) throw operationalError('Subject is not eligible for this experiment.', 'EXPERIMENT_NOT_ELIGIBLE', 404);
  const facts = await factsFor({ subject, resolved, locale, experiment, database });
  if (!evaluateAudience(version.audience?.conditionTree, facts)) throw operationalError('Subject is not in the experiment audience.', 'EXPERIMENT_NOT_ELIGIBLE', 404);
  const bucketBps = bucketFor({ versionId: version.id, subjectKey: subject.subjectKey, secret: env.experimentAssignmentSecret });
  const variant = selectVariant(version.variants, bucketBps);
  const expected = { versionId: version.id, variantId: variant.id, subjectKey: subject.subjectKey, bucketBps };
  let assignment = await database.experimentAssignment.findUnique({ where: { versionId_subjectKey: { versionId: version.id, subjectKey: subject.subjectKey } }, include: { variant: true } });
  if (assignment && (assignment.variantId !== expected.variantId || assignment.bucketBps !== expected.bucketBps)) throw operationalError('Stored experiment assignment is inconsistent.', 'EXPERIMENT_ASSIGNMENT_CONFLICT', 409);
  if (!assignment) {
    try {
      assignment = await database.experimentAssignment.create({ data: { ...expected, subjectType: subject.subjectType, locale, consentDecisionId: consent.decision?.id, ...requestEvidence(context) }, include: { variant: true } });
      observeExperimentOperation({ operation: 'assignment', outcome: 'created' });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      assignment = await database.experimentAssignment.findUnique({ where: { versionId_subjectKey: { versionId: version.id, subjectKey: subject.subjectKey } }, include: { variant: true } });
      if (!assignment || assignment.variantId !== expected.variantId) throw operationalError('Concurrent experiment assignment conflicted.', 'EXPERIMENT_ASSIGNMENT_CONFLICT', 409);
      observeExperimentOperation({ operation: 'assignment', outcome: 'duplicate' });
    }
  }
  return { assignmentId: assignment.id, experiment: experiment.key, version: version.version, variant: { key: assignment.variant.key, payload: assignment.variant.payload }, assignedAt: assignment.assignedAt };
};

const recordExposure = async ({ assignmentId, eventId, surface, exposureContext, identity = {}, proof, context = {}, database = prisma, now = new Date() }) => {
  assertEnabled();
  const subject = resolveTrustedSubject({ identity, proof });
  const assignment = await database.experimentAssignment.findUnique({ where: { id: assignmentId }, include: { version: { include: { experiment: { include: { market: { include: { country: true } } } } } } } });
  if (!assignment || assignment.subjectKey !== subject.subjectKey) throw operationalError('Experiment assignment is unavailable.', 'EXPERIMENT_ASSIGNMENT_UNAVAILABLE', 404);
  const experiment = assignment.version.experiment;
  if (experiment.status !== 'RUNNING' || experiment.killSwitch || experiment.surface !== surface) throw operationalError('Experiment exposure is not accepted.', 'EXPERIMENT_EXPOSURE_REJECTED', 409);
  const consent = await enforceSubjectConsent({ purpose: assignment.version.purpose, countryCode: experiment.market.country.isoAlpha2.trim(), locale: assignment.locale, subject, at: now, database });
  const safeContext = exposureContext === undefined ? undefined : sanitizePrivateObject(exposureContext, { maxDepth: 3, maxKeys: 20, maxString: 120 });
  const expected = { assignmentId, versionId: assignment.versionId, variantId: assignment.variantId, surface };
  const replay = await database.experimentExposure.findUnique({ where: { eventId } });
  if (replay) {
    if (Object.entries(expected).some(([field, value]) => replay[field] !== value)) throw operationalError('Exposure event was already used for another assignment.', 'EXPERIMENT_EXPOSURE_CONFLICT', 409);
    observeExperimentOperation({ operation: 'exposure', outcome: 'duplicate' });
    return { exposure: replay, duplicate: true };
  }
  try {
    const exposure = await database.experimentExposure.create({ data: { eventId, ...expected, consentDecisionId: consent.decision?.id, context: safeContext, exposedAt: now, ...requestEvidence(context) } });
    observeExperimentOperation({ operation: 'exposure', outcome: 'recorded' });
    return { exposure, duplicate: false };
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const concurrent = await database.experimentExposure.findUnique({ where: { eventId } });
    if (!concurrent || Object.entries(expected).some(([field, value]) => concurrent[field] !== value)) throw operationalError('Concurrent exposure conflicted.', 'EXPERIMENT_EXPOSURE_CONFLICT', 409);
    return { exposure: concurrent, duplicate: true };
  }
};

const calculateResults = async ({ experimentId, windowStart, windowEnd, req, database = prisma, now = new Date() }) => {
  assertEnabled();
  const experiment = await database.experiment.findUnique({ where: { id: experimentId }, include: { versions: { orderBy: { version: 'desc' }, take: 1, include: versionInclude } } });
  if (!experiment?.versions[0]) throw operationalError('Experiment version not found.', 'EXPERIMENT_VERSION_REQUIRED', 404);
  const version = experiment.versions[0];
  const assignments = await database.experimentAssignment.findMany({ where: { versionId: version.id }, select: { subjectKey: true, variant: { select: { key: true, isControl: true } } } });
  const exposures = await database.experimentExposure.findMany({ where: { versionId: version.id, exposedAt: { gte: windowStart, lt: windowEnd } }, select: { exposedAt: true, assignment: { select: { subjectKey: true } }, variant: { select: { key: true, isControl: true } } } });
  const subjects = [...new Set(exposures.map((item) => item.assignment.subjectKey))];
  const events = subjects.length ? await database.marketingEvent.findMany({ where: { subjectKey: { in: subjects }, eventName: { in: version.metrics.map((metric) => metric.eventName) }, occurredAt: { gte: windowStart, lt: windowEnd } }, select: { subjectKey: true, eventName: true, occurredAt: true } }) : [];
  const variantBySubject = new Map(assignments.map((item) => [item.subjectKey, item.variant]));
  const firstExposure = new Map();
  for (const exposure of [...exposures].sort((a, b) => a.exposedAt - b.exposedAt)) if (!firstExposure.has(exposure.assignment.subjectKey)) firstExposure.set(exposure.assignment.subjectKey, exposure.exposedAt);
  const counts = version.variants.map((variant) => {
    const variantExposures = exposures.filter((item) => item.variant.key === variant.key);
    const exposedSubjects = new Set(variantExposures.map((item) => item.assignment.subjectKey));
    const conversions = {}; const denominators = {};
    for (const metric of version.metrics) {
      const eligible = events.filter((event) => {
        const exposedAt = firstExposure.get(event.subjectKey);
        return event.eventName === metric.eventName && variantBySubject.get(event.subjectKey)?.key === variant.key && exposedAt && event.occurredAt >= exposedAt && event.occurredAt < windowEnd && event.occurredAt <= new Date(exposedAt.getTime() + metric.windowHours * 3_600_000);
      });
      conversions[metric.key] = metric.aggregation === 'UNIQUE_SUBJECT_RATE' ? new Set(eligible.map((event) => event.subjectKey)).size : eligible.length;
      denominators[metric.key] = metric.aggregation === 'UNIQUE_SUBJECT_RATE' ? exposedSubjects.size : variantExposures.length;
    }
    return { key: variant.key, isControl: variant.isControl, exposures: exposedSubjects.size, conversions, denominators };
  });
  const analysis = summarizeAnalysis({ metrics: version.metrics, counts, minimumSampleSize: version.minimumSampleSize, significanceAlpha: version.significanceAlpha, analysisAt: version.analysisAt, now });
  const snapshotKey = canonicalDigest({ versionId: version.id, windowStart, windowEnd, inputDigest: analysis.inputDigest });
  const snapshot = await database.experimentResultSnapshot.upsert({ where: { snapshotKey }, create: { snapshotKey, versionId: version.id, windowStart, windowEnd, status: analysis.status, method: analysis.results.method, results: analysis.results, inputDigest: analysis.inputDigest, ...requestEvidence(req?.context) }, update: {} });
  await writeAuditLog({ req, action: 'EXPERIMENT_RESULTS_CALCULATED', resourceType: 'EXPERIMENT_RESULT_SNAPSHOT', resourceId: snapshot.id, metadata: { experimentId, versionId: version.id, status: snapshot.status } }, database);
  observeExperimentOperation({ operation: 'results', outcome: analysis.status.toLowerCase() });
  return snapshot;
};

const listExperiments = async ({ page = 1, limit = 50, status, marketId, database = prisma }) => {
  const where = { ...(status ? { status } : {}), ...(marketId ? { marketId } : {}) };
  const [items, total] = await Promise.all([database.experiment.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, include: { market: { select: { code: true } }, versions: { orderBy: { version: 'desc' }, take: 1, include: { ...versionInclude, snapshots: { orderBy: { generatedAt: 'desc' }, take: 1 } } } } }), database.experiment.count({ where })]);
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

module.exports = { TRANSITIONS, assignVariant, calculateResults, createExperiment, createVersion, listExperiments, recordExposure, setExperimentStatus };
