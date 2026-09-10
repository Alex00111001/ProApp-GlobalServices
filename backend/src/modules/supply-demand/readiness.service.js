const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { writeAuditLog } = require('../audit/audit.service');
const { canonicalDigest, operationalError, requestEvidence, sanitizePrivateObject } = require('../privacy/privacy-utils');
const { observeSupplyDemandOperation } = require('../observability/metrics');

const REQUIRED_DIMENSIONS = Object.freeze([
  'supply_coverage', 'demand_evidence', 'geography_coverage', 'professional_verification',
  'support_capacity', 'financial_configuration', 'identity_legal_policy', 'observability',
  'incident_response', 'content_seo', 'operational_staffing', 'data_quality',
]);
const assertEnabled = () => { if (!env.supplyDemandEnabled) throw operationalError('Readiness intelligence is disabled.', 'SUPPLY_DEMAND_DISABLED', 503); };
const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

const validatePolicy = (input) => {
  const requiredDimensions = [...new Set(input.requiredDimensions || [])];
  if (requiredDimensions.length !== REQUIRED_DIMENSIONS.length || REQUIRED_DIMENSIONS.some((key) => !requiredDimensions.includes(key))) throw operationalError('Readiness policy must include every required dimension.', 'READINESS_DIMENSIONS_INCOMPLETE', 422);
  const thresholds = sanitizePrivateObject(input.thresholds);
  const weights = sanitizePrivateObject(input.weights);
  const sum = REQUIRED_DIMENSIONS.reduce((total, key) => total + bounded(weights[key], 0, 10000, 0), 0);
  if (sum !== 10000) throw operationalError('Readiness weights must total 10000 basis points.', 'READINESS_WEIGHTS_INVALID', 422);
  return { requiredDimensions, thresholds, weights, dataQualityPolicy: sanitizePrivateObject(input.dataQualityPolicy), algorithmVersion: input.algorithmVersion };
};

const createPolicy = async ({ input, actorId, req, database = prisma }) => {
  assertEnabled(); const validated = validatePolicy(input);
  const latest = await database.marketReadinessPolicy.findFirst({ where: { key: input.key, marketId: input.marketId || null }, orderBy: { version: 'desc' } });
  const version = (latest?.version || 0) + 1; const configurationDigest = canonicalDigest({ key: input.key, marketId: input.marketId || null, version, ...validated });
  const policy = await database.$transaction(async (tx) => {
    const created = await tx.marketReadinessPolicy.create({ data: { key: input.key, version, marketId: input.marketId || null, ...validated, configurationDigest, createdById: actorId } });
    await writeAuditLog({ req, action: 'READINESS_POLICY_CREATED', resourceType: 'MARKET_READINESS_POLICY', resourceId: created.id, metadata: { key: created.key, version } }, tx); return created;
  });
  observeSupplyDemandOperation({ operation: 'readiness_policy', outcome: 'created' }); return policy;
};

const reviewPolicy = async ({ policyId, actorId, decision, reason, req, database = prisma }) => {
  assertEnabled();
  const policy = await database.marketReadinessPolicy.findUnique({ where: { id: policyId } });
  if (!policy) throw operationalError('Readiness policy was not found.', 'READINESS_POLICY_NOT_FOUND', 404);
  if (policy.status !== 'DRAFT') throw operationalError('Only draft policy can be reviewed.', 'READINESS_POLICY_IMMUTABLE', 409);
  if (policy.createdById === actorId) throw operationalError('Creator cannot review the same readiness policy.', 'READINESS_FOUR_EYES_REQUIRED', 409);
  const updated = await database.$transaction(async (tx) => {
    const saved = await tx.marketReadinessPolicy.update({ where: { id: policyId }, data: { reviewedById: actorId, reviewedAt: new Date(), reviewReason: `${decision}:${reason}` } });
    await writeAuditLog({ req, action: `READINESS_POLICY_${decision}`, resourceType: 'MARKET_READINESS_POLICY', resourceId: policyId, reason }, tx); return saved;
  });
  return updated;
};

const activatePolicy = async ({ policyId, actorId, reason, req, database = prisma }) => {
  assertEnabled(); const policy = await database.marketReadinessPolicy.findUnique({ where: { id: policyId } });
  if (!policy) throw operationalError('Readiness policy was not found.', 'READINESS_POLICY_NOT_FOUND', 404);
  if (!policy.reviewedById || !String(policy.reviewReason).startsWith('APPROVED:')) throw operationalError('Approved independent review is required.', 'READINESS_REVIEW_REQUIRED', 409);
  if (policy.createdById === actorId || policy.reviewedById === policy.createdById) throw operationalError('Four-eyes approval is required.', 'READINESS_FOUR_EYES_REQUIRED', 409);
  return database.$transaction(async (tx) => {
    await tx.marketReadinessPolicy.updateMany({ where: { key: policy.key, marketId: policy.marketId, status: 'ACTIVE', id: { not: policy.id } }, data: { status: 'RETIRED', retiredAt: new Date() } });
    const updated = await tx.marketReadinessPolicy.update({ where: { id: policy.id }, data: { status: 'ACTIVE', effectiveAt: new Date() } });
    await writeAuditLog({ req, action: 'READINESS_POLICY_ACTIVATED', resourceType: 'MARKET_READINESS_POLICY', resourceId: policy.id, reason, metadata: { version: policy.version } }, tx); return updated;
  });
};

const buildComponentEvidence = async ({ market, snapshot, database }) => {
  const components = snapshot?.components || {}; const policyVersion = market.policies?.find((item) => item.version === market.currentPolicyVersion);
  const [supportOperators, pricingPolicies, refundPolicies, health, incidents, publishedContent] = await Promise.all([
    database.user.count({ where: { isActive: true, administrativeRoles: { some: { status: 'ACTIVE', role: { permissions: { some: { permission: { key: 'support.manage' } } } } } } } }),
    database.pricingPolicy.count({ where: { marketId: market.id, status: 'ACTIVE' } }),
    database.refundPolicy.count({ where: { marketId: market.id, status: 'ACTIVE' } }),
    database.serviceHealthSnapshot.findMany({ distinct: ['service'], orderBy: { checkedAt: 'desc' }, take: 20, select: { service: true, status: true, checkedAt: true } }),
    database.incident.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] }, severity: { in: ['HIGH', 'CRITICAL'] } } }),
    database.contentPublication.count({ where: { status: 'PUBLISHED', indexable: true, version: { marketId: market.id } } }),
  ]);
  return {
    supply_coverage: { value: components.geographicCoverage || 0, evidence: snapshot?.id },
    demand_evidence: { value: components.requestDemand || 0, evidence: snapshot?.id },
    geography_coverage: { value: components.geographicCoverage || 0, evidence: snapshot?.id },
    professional_verification: { value: components.verifiedProfessionals || 0, evidence: snapshot?.id },
    support_capacity: { value: supportOperators, evidence: 'RBAC:support.manage' },
    financial_configuration: { value: Math.min(pricingPolicies, refundPolicies), evidence: { pricingPolicies, refundPolicies } },
    identity_legal_policy: { value: policyVersion?.status === 'ACTIVE' && policyVersion?.reviewStatus === 'APPROVED' ? 1 : 0, evidence: policyVersion?.id || null },
    observability: { value: health.length > 0 && health.every((item) => item.status === 'HEALTHY') ? 1 : 0, evidence: health.map((item) => ({ service: item.service, status: item.status, checkedAt: item.checkedAt })) },
    incident_response: { value: incidents === 0 ? 1 : 0, evidence: { unresolvedHighCritical: incidents } },
    content_seo: { value: publishedContent, evidence: { publishedContent } },
    operational_staffing: { value: supportOperators, evidence: 'RBAC:active_operators' },
    data_quality: { value: snapshot?.status === 'COMPLETE' ? 1 : snapshot?.status === 'PARTIAL' ? 0.5 : 0, evidence: snapshot?.status || 'MISSING' },
  };
};

const evaluateReadiness = async ({ marketId, snapshotId, policyId, req, database = prisma }) => {
  assertEnabled();
  const market = await database.market.findUnique({ where: { id: marketId }, include: { policies: true } });
  if (!market) throw operationalError('Market was not found.', 'MARKET_UNAVAILABLE', 404);
  const policy = policyId ? await database.marketReadinessPolicy.findUnique({ where: { id: policyId } }) : await database.marketReadinessPolicy.findFirst({ where: { status: 'ACTIVE', OR: [{ marketId }, { marketId: null }] }, orderBy: [{ marketId: 'desc' }, { version: 'desc' }] });
  if (!policy || policy.status !== 'ACTIVE') throw operationalError('Active readiness policy is required.', 'READINESS_POLICY_REQUIRED', 409);
  const snapshot = snapshotId ? await database.supplyDemandSnapshot.findUnique({ where: { id: snapshotId } }) : await database.supplyDemandSnapshot.findFirst({ where: { marketId }, orderBy: { generatedAt: 'desc' } });
  const evidence = await buildComponentEvidence({ market, snapshot, database }); const thresholds = policy.thresholds; const weights = policy.weights;
  const componentResults = Object.fromEntries(REQUIRED_DIMENSIONS.map((key) => {
    const minimum = bounded(thresholds[key]?.minimum ?? thresholds[key], 0, 1000000000, 1); const actual = Number(evidence[key]?.value || 0); const passed = actual >= minimum;
    return [key, { actual, minimum, passed, weightBps: weights[key], evidence: evidence[key]?.evidence || null }];
  }));
  const missingEvidence = REQUIRED_DIMENSIONS.filter((key) => componentResults[key].evidence == null);
  const blockers = REQUIRED_DIMENSIONS.filter((key) => !componentResults[key].passed && thresholds[key]?.blocking !== false);
  if (market.status !== 'ACTIVE') blockers.unshift('market_inactive');
  const scoreBps = Math.round(REQUIRED_DIMENSIONS.reduce((sum, key) => sum + (componentResults[key].passed ? weights[key] : 0), 0));
  const outcome = blockers.length ? 'NOT_READY' : scoreBps >= bounded(thresholds.readyScoreBps, 0, 10000, 9000) ? 'READY' : 'CONDITIONALLY_READY';
  const inputDigest = canonicalDigest({ policyId: policy.id, marketId, snapshotId: snapshot?.id || null, componentResults, marketStatus: market.status }); const evaluationKey = canonicalDigest({ inputDigest, algorithmVersion: policy.algorithmVersion });
  const saved = await database.$transaction(async (tx) => {
    const result = await tx.marketReadinessEvaluation.upsert({ where: { evaluationKey }, update: {}, create: { evaluationKey, policyId: policy.id, marketId, snapshotId: snapshot?.id, outcome, componentResults: { ...componentResults, scoreBps }, blockers, missingEvidence, evidenceReferences: Object.fromEntries(REQUIRED_DIMENSIONS.map((key) => [key, componentResults[key].evidence])), inputDigest, algorithmVersion: policy.algorithmVersion, ...requestEvidence(req?.context) } });
    await writeAuditLog({ req, action: 'MARKET_READINESS_EVALUATED', resourceType: 'MARKET_READINESS_EVALUATION', resourceId: result.id, metadata: { marketId, outcome, scoreBps, marketStatus: market.status, activationChanged: false } }, tx); return result;
  });
  observeSupplyDemandOperation({ operation: 'readiness', outcome: outcome.toLowerCase(), reason: blockers[0] || 'none' }); return saved;
};

const createExpansionCandidate = async ({ input, actorId, req, database = prisma }) => {
  assertEnabled(); const market = await database.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw operationalError('Market was not found.', 'MARKET_UNAVAILABLE', 404);
  if (input.divisionId) {
    const division = await database.administrativeDivision.findUnique({ where: { id: input.divisionId } });
    if (!division || division.countryId !== market.countryId || division.lifecycle !== 'ACTIVE') throw operationalError('Expansion geography is invalid for Market.', 'EXPANSION_GEOGRAPHY_INVALID', 422);
  }
  if (input.serviceId && !(await database.service.findFirst({ where: { id: input.serviceId, isActive: true } }))) throw operationalError('Expansion service is unavailable.', 'EXPANSION_SERVICE_INVALID', 422);
  const candidateKey = canonicalDigest({ type: input.type, marketId: input.marketId, divisionId: input.divisionId || null, serviceId: input.serviceId || null, hypothesis: input.hypothesis });
  const candidate = await database.$transaction(async (tx) => {
    const saved = await tx.expansionCandidate.upsert({ where: { candidateKey }, update: {}, create: { candidateKey, type: input.type, marketId: input.marketId, divisionId: input.divisionId, serviceId: input.serviceId, hypothesis: input.hypothesis, createdById: actorId } });
    await writeAuditLog({ req, action: 'EXPANSION_CANDIDATE_CREATED', resourceType: 'EXPANSION_CANDIDATE', resourceId: saved.id, metadata: { type: saved.type, marketId: saved.marketId } }, tx); return saved;
  });
  return candidate;
};

const evaluateExpansion = async ({ candidateId, readinessEvaluationId, req, database = prisma }) => {
  assertEnabled(); const candidate = await database.expansionCandidate.findUnique({ where: { id: candidateId } });
  const readiness = await database.marketReadinessEvaluation.findUnique({ where: { id: readinessEvaluationId } });
  if (!candidate || !readiness || readiness.marketId !== candidate.marketId) throw operationalError('Expansion evidence is invalid.', 'EXPANSION_EVIDENCE_INVALID', 422);
  const recommendation = readiness.outcome === 'READY' ? 'PREPARE' : readiness.outcome === 'CONDITIONALLY_READY' ? 'INVESTIGATE' : 'DO_NOT_PROCEED';
  const confidenceBps = readiness.missingEvidence.length ? 5000 : readiness.blockers.length ? 7500 : 9000;
  const evidenceReferences = { readinessEvaluationId: readiness.id, snapshotId: readiness.snapshotId }; const inputDigest = canonicalDigest({ candidateId, recommendation, confidenceBps, evidenceReferences, blockers: readiness.blockers });
  const evaluationKey = canonicalDigest({ inputDigest, modelVersion: 'expansion-rules-v1' });
  return database.$transaction(async (tx) => {
    const saved = await tx.expansionEvaluation.upsert({ where: { evaluationKey }, update: {}, create: { evaluationKey, candidateId, readinessEvaluationId, recommendation, confidenceBps, reasons: [`readiness:${readiness.outcome.toLowerCase()}`], blockers: readiness.blockers, missingEvidence: readiness.missingEvidence, guardrails: { activationAllowed: false, financialMutationAllowed: false }, evidenceReferences, modelVersion: 'expansion-rules-v1', inputDigest, ...requestEvidence(req?.context) } });
    await writeAuditLog({ req, action: 'EXPANSION_EVALUATED', resourceType: 'EXPANSION_EVALUATION', resourceId: saved.id, metadata: { recommendation, activationChanged: false } }, tx); return saved;
  });
};

const reviewExpansion = async ({ evaluationId, actorId, decision, reason, req, database = prisma }) => {
  assertEnabled(); const evaluation = await database.expansionEvaluation.findUnique({ where: { id: evaluationId }, include: { candidate: true } });
  if (!evaluation) throw operationalError('Expansion evaluation was not found.', 'EXPANSION_EVALUATION_NOT_FOUND', 404);
  if (evaluation.candidate.createdById === actorId) throw operationalError('Candidate creator cannot review its expansion evaluation.', 'EXPANSION_FOUR_EYES_REQUIRED', 409);
  if (evaluation.reviewStatus !== 'PENDING_REVIEW') throw operationalError('Expansion review is no longer pending.', 'EXPANSION_REVIEW_IMMUTABLE', 409);
  return database.$transaction(async (tx) => {
    const saved = await tx.expansionEvaluation.update({ where: { id: evaluation.id }, data: { reviewStatus: decision, reviewedById: actorId, reviewReason: reason, reviewedAt: new Date() } });
    await tx.expansionCandidate.update({ where: { id: evaluation.candidateId }, data: { status: decision === 'APPROVED' ? 'REVIEWED' : 'REJECTED' } });
    await writeAuditLog({ req, action: `EXPANSION_${decision}`, resourceType: 'EXPANSION_EVALUATION', resourceId: saved.id, reason, metadata: { recommendation: saved.recommendation, activationChanged: false } }, tx); return saved;
  });
};

const listPolicies = async ({ page = 1, limit = 50, marketId, status, database = prisma }) => { const where = { ...(marketId ? { marketId } : {}), ...(status ? { status } : {}) }; const [items, total] = await Promise.all([database.marketReadinessPolicy.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }), database.marketReadinessPolicy.count({ where })]); return { items, pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) } }; };
const listEvaluations = async ({ page = 1, limit = 50, marketId, outcome, database = prisma }) => { const where = { ...(marketId ? { marketId } : {}), ...(outcome ? { outcome } : {}) }; const [items, total] = await Promise.all([database.marketReadinessEvaluation.findMany({ where, orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, include: { market: { select: { code: true, status: true } }, policy: { select: { key: true, version: true } } } }), database.marketReadinessEvaluation.count({ where })]); return { items, pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) } }; };
const listExpansion = async ({ page = 1, limit = 50, marketId, status, database = prisma }) => { const where = { ...(marketId ? { marketId } : {}), ...(status ? { status } : {}) }; const [items, total] = await Promise.all([database.expansionCandidate.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, include: { market: { select: { code: true, status: true } }, division: { select: { canonicalName: true, canonicalCode: true } }, service: { select: { name: true } }, evaluations: { orderBy: { generatedAt: 'desc' }, take: 1 } } }), database.expansionCandidate.count({ where })]); return { items, pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) } }; };

module.exports = { REQUIRED_DIMENSIONS, activatePolicy, buildComponentEvidence, createExpansionCandidate, createPolicy, evaluateExpansion, evaluateReadiness, listEvaluations, listExpansion, listPolicies, reviewExpansion, reviewPolicy, validatePolicy };
