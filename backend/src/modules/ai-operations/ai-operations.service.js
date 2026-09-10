const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { writeAuditLog } = require('../audit/audit.service');
const { canonicalDigest, operationalError, requestEvidence, sanitizePrivateObject } = require('../privacy/privacy-utils');
const { redactText } = require('../observability/redaction');
const { observeAIOperation } = require('../observability/metrics');
const { OPERATION_REGISTRY, validateOperationInput, validateOperationOutput, validateTools } = require('./registry');
const { executeProvider } = require('./provider-adapters');

const DATA_CLASS_RANK = Object.freeze({ PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 });
const assertEnabled = () => { if (!env.aiOperationsEnabled) throw operationalError('AI Operations is disabled.', 'AI_OPERATIONS_DISABLED', 503); };
const safeError = (error) => redactText(error?.message || 'AI execution failed').slice(0, 500);
const pageResult = (page, limit, totalItems) => ({ page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) });
const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const backoffSeconds = (version, attempt) => Math.min(version.maxBackoffSeconds, version.initialBackoffSeconds * (2 ** Math.max(0, attempt - 1)));

const validateProviderInput = (input) => {
  if (!['OPENAI_RESPONSES', 'ANTHROPIC_MESSAGES'].includes(input.adapterType)) throw operationalError('Provider adapter is not allowlisted.', 'AI_PROVIDER_ADAPTER_NOT_REGISTERED', 422);
  if (!/^AI_PROVIDER_[A-Z0-9_]{3,80}$/.test(input.secretEnvName || '')) throw operationalError('Provider secret reference is invalid.', 'AI_PROVIDER_SECRET_REFERENCE_INVALID', 422);
  return { key: input.key, displayName: input.displayName, adapterType: input.adapterType, capabilities: [...new Set(input.capabilities)], purposeAllowlist: [...new Set(input.purposeAllowlist)], region: input.region, maximumDataClass: input.maximumDataClass, timeoutMs: input.timeoutMs, maxConcurrency: input.maxConcurrency, requestsPerMinute: input.requestsPerMinute, circuitBreakerPolicy: sanitizePrivateObject(input.circuitBreakerPolicy), configuration: { secretEnvName: input.secretEnvName } };
};

const createProvider = async ({ input, actorId, req, database = prisma }) => {
  assertEnabled(); const data = validateProviderInput(input);
  const provider = await database.$transaction(async (tx) => {
    const created = await tx.aIProvider.create({ data: { ...data, status: 'DISABLED', createdById: actorId } });
    await writeAuditLog({ req, action: 'AI_PROVIDER_CREATED', resourceType: 'AI_PROVIDER', resourceId: created.id, metadata: { key: created.key, adapterType: created.adapterType, status: created.status } }, tx); return created;
  });
  return provider;
};

const setProviderStatus = async ({ providerId, status, actorId, reason, req, database = prisma }) => {
  assertEnabled(); const provider = await database.aIProvider.findUnique({ where: { id: providerId } });
  if (!provider) throw operationalError('Provider was not found.', 'AI_PROVIDER_NOT_FOUND', 404);
  const allowed = { DISABLED: ['ACTIVE'], ACTIVE: ['DISABLED', 'DEGRADED', 'SUSPENDED'], DEGRADED: ['ACTIVE', 'DISABLED', 'SUSPENDED'], SUSPENDED: ['DISABLED', 'ACTIVE'], RETIRED: [] };
  if (!allowed[provider.status]?.includes(status)) throw operationalError('Provider transition is invalid.', 'AI_PROVIDER_TRANSITION_INVALID', 409);
  return database.$transaction(async (tx) => { const saved = await tx.aIProvider.update({ where: { id: providerId }, data: { status } }); await writeAuditLog({ req, action: 'AI_PROVIDER_STATUS_CHANGED', resourceType: 'AI_PROVIDER', resourceId: providerId, reason, before: { status: provider.status }, after: { status }, metadata: { actorId } }, tx); return saved; });
};

const createModelPolicy = async ({ providerId, input, actorId, req, database = prisma }) => {
  assertEnabled(); const provider = await database.aIProvider.findUnique({ where: { id: providerId } });
  if (!provider) throw operationalError('Provider was not found.', 'AI_PROVIDER_NOT_FOUND', 404);
  const latest = await database.aIModelPolicy.findFirst({ where: { key: input.key }, orderBy: { version: 'desc' } }); const version = (latest?.version || 0) + 1;
  const data = { key: input.key, version, providerId, modelIdentifier: input.modelIdentifier, capability: input.capability, purposeAllowlist: [...new Set(input.purposeAllowlist)], operationAllowlist: [...new Set(input.operationAllowlist)], maximumDataClass: input.maximumDataClass, marketAllowlist: [...new Set(input.marketAllowlist || [])], localeAllowlist: [...new Set(input.localeAllowlist || [])], maxInputTokens: input.maxInputTokens, maxOutputTokens: input.maxOutputTokens, timeoutMs: input.timeoutMs, maxCostMicros: BigInt(input.maxCostMicros), routingPriority: input.routingPriority, constraints: sanitizePrivateObject(input.constraints || {}), createdById: actorId };
  data.configurationDigest = canonicalDigest({ ...data, maxCostMicros: String(data.maxCostMicros) });
  return database.$transaction(async (tx) => { const created = await tx.aIModelPolicy.create({ data }); await writeAuditLog({ req, action: 'AI_MODEL_POLICY_CREATED', resourceType: 'AI_MODEL_POLICY', resourceId: created.id, metadata: { key: created.key, version, providerId } }, tx); return created; });
};

const reviewModelPolicy = async ({ policyId, actorId, decision, reason, req, database = prisma }) => {
  assertEnabled(); const policy = await database.aIModelPolicy.findUnique({ where: { id: policyId } });
  if (!policy) throw operationalError('Model policy was not found.', 'AI_MODEL_POLICY_NOT_FOUND', 404);
  if (policy.status !== 'DRAFT') throw operationalError('Model policy is immutable.', 'AI_MODEL_POLICY_IMMUTABLE', 409);
  if (policy.createdById === actorId) throw operationalError('Creator cannot review model policy.', 'AI_MODEL_POLICY_FOUR_EYES', 409);
  return database.$transaction(async (tx) => { const saved = await tx.aIModelPolicy.update({ where: { id: policyId }, data: { reviewedById: actorId, reviewedAt: new Date(), constraints: { ...policy.constraints, reviewDecision: decision, reviewReason: reason } } }); await writeAuditLog({ req, action: `AI_MODEL_POLICY_${decision}`, resourceType: 'AI_MODEL_POLICY', resourceId: policyId, reason }, tx); return saved; });
};

const activateModelPolicy = async ({ policyId, actorId, reason, req, database = prisma }) => {
  assertEnabled(); const policy = await database.aIModelPolicy.findUnique({ where: { id: policyId } });
  if (!policy?.reviewedById || policy.constraints?.reviewDecision !== 'APPROVED') throw operationalError('Approved independent review is required.', 'AI_MODEL_POLICY_REVIEW_REQUIRED', 409);
  if (policy.createdById === actorId) throw operationalError('Creator cannot activate model policy.', 'AI_MODEL_POLICY_FOUR_EYES', 409);
  return database.$transaction(async (tx) => { const saved = await tx.aIModelPolicy.update({ where: { id: policyId }, data: { status: 'ACTIVE', effectiveAt: new Date() } }); await writeAuditLog({ req, action: 'AI_MODEL_POLICY_ACTIVATED', resourceType: 'AI_MODEL_POLICY', resourceId: policyId, reason }, tx); return saved; });
};

const createOperation = async ({ input, actorId, req, database = prisma }) => {
  assertEnabled(); const registered = OPERATION_REGISTRY[input.kind];
  if (!registered || input.riskClass !== registered.riskClass) throw operationalError('Operation kind or risk classification is invalid.', 'AI_OPERATION_REGISTRY_MISMATCH', 422);
  const tools = validateTools(input.kind, input.allowedToolKeys || []); const safeSystemPolicy = String(input.systemPolicy).trim(); const safeTemplate = String(input.templateContent).trim();
  if (safeSystemPolicy.length < 20 || safeSystemPolicy.length > 8000 || safeTemplate.length < 10 || safeTemplate.length > 16000) throw operationalError('Prompt content is outside bounded limits.', 'AI_PROMPT_INVALID', 422);
  const contentDigest = canonicalDigest({ safeSystemPolicy, safeTemplate, outputSchema: registered.outputJsonSchema });
  return database.$transaction(async (tx) => {
    const prompt = await tx.aIPromptTemplate.create({ data: { key: `${input.key}.prompt`, purpose: input.purpose, riskClass: input.riskClass, createdById: actorId } });
    const promptVersion = await tx.aIPromptVersion.create({ data: { templateId: prompt.id, version: 1, status: 'DRAFT', systemPolicy: safeSystemPolicy, templateContent: safeTemplate, requiredVariables: input.requiredVariables || ['context'], outputSchema: registered.outputJsonSchema, providerConstraints: { capability: registered.capability }, contentDigest, createdById: actorId } });
    const definition = await tx.aIOperationDefinition.create({ data: { key: input.key, kind: input.kind, purpose: input.purpose, status: 'DRAFT', createdById: actorId } });
    const configurationDigest = canonicalDigest({ kind: input.kind, riskClass: input.riskClass, tools, maxInputBytes: input.maxInputBytes, maxAttempts: input.maxAttempts, maxCostMicros: input.maxCostMicros });
    const version = await tx.aIOperationVersion.create({ data: { definitionId: definition.id, promptVersionId: promptVersion.id, version: 1, riskClass: input.riskClass, inputSchema: { type: 'closed_registry', operation: input.kind }, outputSchema: registered.outputJsonSchema, allowedInputFields: ['locale', 'marketCode', 'references', 'context'], allowedToolKeys: tools, requiredCapability: registered.capability, maximumDataClass: input.maximumDataClass, maxInputBytes: input.maxInputBytes, maxAttempts: input.maxAttempts, initialBackoffSeconds: input.initialBackoffSeconds, maxBackoffSeconds: input.maxBackoffSeconds, maxCostMicros: BigInt(input.maxCostMicros), approvalRequired: input.riskClass === 'HIGH', evaluationRequired: true, configurationDigest } });
    await writeAuditLog({ req, action: 'AI_OPERATION_CREATED', resourceType: 'AI_OPERATION', resourceId: definition.id, metadata: { key: definition.key, kind: definition.kind, riskClass: input.riskClass } }, tx);
    return { definition, version, prompt, promptVersion };
  });
};

const reviewPrompt = async ({ promptVersionId, actorId, decision, reason, req, database = prisma }) => {
  assertEnabled(); const version = await database.aIPromptVersion.findUnique({ where: { id: promptVersionId } });
  if (!version) throw operationalError('Prompt version was not found.', 'AI_PROMPT_NOT_FOUND', 404);
  if (version.createdById === actorId) throw operationalError('Prompt creator cannot review it.', 'AI_PROMPT_FOUR_EYES', 409);
  if (version.status !== 'DRAFT') throw operationalError('Prompt version is immutable.', 'AI_PROMPT_IMMUTABLE', 409);
  return database.$transaction(async (tx) => { const saved = await tx.aIPromptVersion.update({ where: { id: version.id }, data: { reviewedById: actorId, reviewedAt: new Date(), providerConstraints: { ...version.providerConstraints, reviewDecision: decision, reviewReason: reason }, ...(decision === 'APPROVED' ? { status: 'ACTIVE', effectiveAt: new Date() } : {}) } }); await writeAuditLog({ req, action: `AI_PROMPT_${decision}`, resourceType: 'AI_PROMPT_VERSION', resourceId: saved.id, reason }, tx); return saved; });
};

const recordEvaluation = async ({ operationVersionId, input, req, database = prisma }) => {
  assertEnabled(); const version = await database.aIOperationVersion.findUnique({ where: { id: operationVersionId } });
  if (!version) throw operationalError('Operation version was not found.', 'AI_OPERATION_VERSION_NOT_FOUND', 404);
  const status = input.schemaPassRateBps >= input.thresholds.minimumSchemaPassRateBps && input.safetyPassRateBps >= input.thresholds.minimumSafetyPassRateBps && input.qualityScoreBps >= input.thresholds.minimumQualityScoreBps && input.p95LatencyMs <= input.thresholds.maximumP95LatencyMs && input.estimatedCostMicros <= input.thresholds.maximumCostMicros ? 'PASSED' : 'FAILED';
  const inputDigest = canonicalDigest({ operationVersionId, ...input }); const evaluationKey = canonicalDigest({ inputDigest, evaluatorVersion: input.evaluatorVersion, datasetVersion: input.datasetVersion });
  const saved = await database.aIEvaluation.upsert({ where: { evaluationKey }, update: {}, create: { evaluationKey, operationVersionId, evaluatorVersion: input.evaluatorVersion, datasetVersion: input.datasetVersion, datasetDigest: input.datasetDigest, modelPolicyKey: input.modelPolicyKey, status, sampleSize: input.sampleSize, schemaPassRateBps: input.schemaPassRateBps, safetyPassRateBps: input.safetyPassRateBps, qualityScoreBps: input.qualityScoreBps, p95LatencyMs: input.p95LatencyMs, estimatedCostMicros: BigInt(input.estimatedCostMicros), thresholds: input.thresholds, results: sanitizePrivateObject(input.results), inputDigest } });
  await writeAuditLog({ req, action: 'AI_OPERATION_EVALUATED', resourceType: 'AI_EVALUATION', resourceId: saved.id, metadata: { operationVersionId, status } }, database); observeAIOperation({ operation: 'evaluation', outcome: status.toLowerCase() }); return saved;
};

const activateOperation = async ({ operationId, actorId, reason, req, database = prisma }) => {
  assertEnabled(); const definition = await database.aIOperationDefinition.findUnique({ where: { id: operationId }, include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { promptVersion: true, evaluations: { where: { status: 'PASSED' }, orderBy: { evaluatedAt: 'desc' }, take: 1 } } } } });
  const version = definition?.versions[0];
  if (!version || version.promptVersion.status !== 'ACTIVE' || !version.evaluations.length) throw operationalError('Active reviewed prompt and passing evaluation are required.', 'AI_OPERATION_QUALITY_GATE_FAILED', 409);
  if (definition.createdById === actorId || version.promptVersion.createdById === actorId) throw operationalError('Creator cannot activate the operation.', 'AI_OPERATION_FOUR_EYES', 409);
  return database.$transaction(async (tx) => { await tx.aIOperationVersion.update({ where: { id: version.id }, data: { activatedAt: new Date() } }); const saved = await tx.aIOperationDefinition.update({ where: { id: definition.id }, data: { status: 'ACTIVE' } }); await writeAuditLog({ req, action: 'AI_OPERATION_ACTIVATED', resourceType: 'AI_OPERATION', resourceId: saved.id, reason }, tx); return saved; });
};

const referenceRecord = async (reference, database) => {
  if (reference.type === 'SUPPLY_DEMAND_SNAPSHOT') return database.supplyDemandSnapshot.findUnique({ where: { id: reference.id }, select: { id: true, inputDigest: true } });
  if (reference.type === 'READINESS_EVALUATION') return database.marketReadinessEvaluation.findUnique({ where: { id: reference.id }, select: { id: true, inputDigest: true } });
  if (reference.type === 'EXPANSION_EVALUATION') return database.expansionEvaluation.findUnique({ where: { id: reference.id }, select: { id: true, inputDigest: true } });
  if (reference.type === 'INCIDENT') { const incident = await database.incident.findUnique({ where: { id: reference.id }, select: { id: true, status: true, severity: true, service: true, detectedAt: true, updatedAt: true } }); return incident && { id: incident.id, inputDigest: canonicalDigest(incident) }; }
  return null;
};

const resolveIdempotentExecution = (existing, { version, inputDigest }) => {
  if (existing.operationVersionId !== version.id || existing.inputDigest !== inputDigest) {
    throw operationalError('Idempotency key conflicts with another execution.', 'AI_EXECUTION_IDEMPOTENCY_CONFLICT', 409);
  }
  return { execution: existing, duplicate: true };
};

const queueExecution = async ({ operationId, idempotencyKey, input, dataClass, actorId, req, database = prisma }) => {
  assertEnabled(); const definition = await database.aIOperationDefinition.findUnique({ where: { id: operationId }, include: { versions: { where: { retiredAt: null }, orderBy: { version: 'desc' }, take: 1 } } }); const version = definition?.versions[0];
  if (!definition || definition.status !== 'ACTIVE' || !version?.activatedAt) throw operationalError('AI operation is not active.', 'AI_OPERATION_INACTIVE', 409);
  if (version.riskClass === 'PROHIBITED') throw operationalError('AI operation is prohibited.', 'AI_OPERATION_PROHIBITED', 403);
  if (DATA_CLASS_RANK[dataClass] > DATA_CLASS_RANK[version.maximumDataClass]) throw operationalError('Input data class exceeds operation policy.', 'AI_DATA_CLASS_REJECTED', 422);
  const safeInput = validateOperationInput(definition.kind, input); if (jsonBytes(safeInput) > version.maxInputBytes) throw operationalError('AI input is too large.', 'AI_INPUT_TOO_LARGE', 413);
  for (const reference of safeInput.references) { const record = await referenceRecord(reference, database); if (!record || record.inputDigest !== reference.digest) throw operationalError('AI input reference is stale or forged.', 'AI_INPUT_REFERENCE_INVALID', 422); }
  const inputDigest = canonicalDigest(safeInput); const existing = await database.aIOperationExecution.findUnique({ where: { idempotencyKey } });
  if (existing) return resolveIdempotentExecution(existing, { version, inputDigest });
  const market = safeInput.marketCode ? await database.market.findUnique({ where: { code: safeInput.marketCode } }) : null;
  if (safeInput.marketCode && !market) throw operationalError('Market was not found.', 'MARKET_UNAVAILABLE', 404);
  const result = await database.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT 1::integer AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`f10:ai-execution:${idempotencyKey}`}, 0))) AS advisory_lock`);
    const concurrent = await tx.aIOperationExecution.findUnique({ where: { idempotencyKey } });
    if (concurrent) return resolveIdempotentExecution(concurrent, { version, inputDigest });
    const created = await tx.aIOperationExecution.create({ data: { idempotencyKey, operationVersionId: version.id, marketId: market?.id, requestedById: actorId, dataClass, inputDigest, safeInput, ...requestEvidence(req?.context), inputReferences: { create: safeInput.references.map((reference) => ({ referenceType: reference.type, referenceId: reference.id, dataClass: reference.dataClass, contentDigest: reference.digest })) } } });
    await writeAuditLog({ req, action: 'AI_EXECUTION_QUEUED', resourceType: 'AI_OPERATION_EXECUTION', resourceId: created.id, metadata: { operationId, operationVersionId: version.id, riskClass: version.riskClass, dataClass } }, tx);
    return { execution: created, duplicate: false };
  });
  observeAIOperation({ operation: 'queued', outcome: result.duplicate ? 'duplicate' : 'accepted' }); return result;
};

const routeModel = async ({ execution, version, definition, database = prisma, now = new Date() }) => {
  const policies = await database.aIModelPolicy.findMany({ where: { status: 'ACTIVE', effectiveAt: { lte: now }, AND: [{ OR: [{ retiredAt: null }, { retiredAt: { gt: now } }] }, ...(execution.market ? [{ OR: [{ marketAllowlist: { isEmpty: true } }, { marketAllowlist: { has: execution.market.code } }] }] : [])], capability: version.requiredCapability, operationAllowlist: { has: definition.kind }, purposeAllowlist: { has: definition.purpose }, maximumDataClass: { in: Object.keys(DATA_CLASS_RANK).filter((key) => DATA_CLASS_RANK[key] >= DATA_CLASS_RANK[execution.dataClass]) } }, include: { provider: true }, orderBy: [{ routingPriority: 'asc' }, { version: 'desc' }] });
  const eligiblePolicies = policies.filter((item) => item.provider.status === 'ACTIVE'
    && item.provider.capabilities.includes(version.requiredCapability)
    && item.provider.purposeAllowlist.includes(definition.purpose)
    && DATA_CLASS_RANK[item.provider.maximumDataClass] >= DATA_CLASS_RANK[execution.dataClass]
    && (!item.localeAllowlist.length || item.localeAllowlist.includes(execution.safeInput.locale)));
  if (!eligiblePolicies.length) throw operationalError('No approved model route is available.', 'AI_MODEL_ROUTE_UNAVAILABLE', 503);
  const evaluations = await database.aIEvaluation.findMany({ where: { operationVersionId: version.id, status: 'PASSED', modelPolicyKey: { in: eligiblePolicies.map((item) => item.key) } }, orderBy: { evaluatedAt: 'desc' } });
  const evaluationByPolicy = new Map(evaluations.map((item) => [item.modelPolicyKey, item]));
  const policy = eligiblePolicies.find((item) => evaluationByPolicy.has(item.key));
  if (!policy) throw operationalError('No eligible model route has a passing operation evaluation.', 'AI_MODEL_EVALUATION_REQUIRED', 409);
  return { policy, provider: policy.provider, evaluation: evaluationByPolicy.get(policy.key) };
};

const checkBudgets = async ({ execution, version, policy, database = prisma, now = new Date() }) => {
  const starts = { hour: new Date(now.getTime() - 3600000), day: new Date(now.getTime() - 86400000), month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) };
  const sum = async (since) => Number((await database.aICostRecord.aggregate({ where: { recordedAt: { gte: since }, ...(execution.marketId ? { marketId: execution.marketId } : {}) }, _sum: { estimatedCostMicros: true } }))._sum.estimatedCostMicros || 0n);
  const [hour, day, month] = await Promise.all([sum(starts.hour), sum(starts.day), sum(starts.month)]); const reservation = Number(version.maxCostMicros < policy.maxCostMicros ? version.maxCostMicros : policy.maxCostMicros);
  if (reservation + hour > env.aiOperationsHourlyBudgetMicros || reservation + day > env.aiOperationsDailyBudgetMicros || reservation + month > env.aiOperationsMonthlyBudgetMicros) throw operationalError('AI budget is exhausted.', 'AI_BUDGET_EXHAUSTED', 429);
  return { reservation, usage: { hour, day, month } };
};

const enforceProviderCapacity = async ({ provider, database = prisma, now = new Date() }) => {
  const minuteAgo = new Date(now.getTime() - 60000); const breakerMinutes = Number(provider.circuitBreakerPolicy?.windowMinutes || 5); const breakerThreshold = Number(provider.circuitBreakerPolicy?.failureThreshold || 5); const breakerStart = new Date(now.getTime() - Math.min(60, Math.max(1, breakerMinutes)) * 60000);
  const [running, recent, failures] = await Promise.all([
    database.aIOperationExecution.count({ where: { providerId: provider.id, status: 'RUNNING' } }),
    database.aIOperationExecution.count({ where: { providerId: provider.id, startedAt: { gte: minuteAgo } } }),
    database.aIOperationExecution.count({ where: { providerId: provider.id, lastFailureAt: { gte: breakerStart }, status: { in: ['FAILED', 'EXHAUSTED'] } } }),
  ]);
  if (failures >= breakerThreshold) throw operationalError('AI provider circuit is open.', 'AI_PROVIDER_CIRCUIT_OPEN', 503);
  if (running >= provider.maxConcurrency || recent >= provider.requestsPerMinute) throw operationalError('AI provider capacity is exhausted.', 'AI_PROVIDER_RATE_LIMITED', 429);
  return { running, recent, failures };
};

const renderMessages = ({ promptVersion, input }) => {
  const trusted = promptVersion.templateContent.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => key === 'context' ? '<untrusted_data>See validated JSON input below.</untrusted_data>' : `[${key}]`);
  return [{ role: 'system', content: promptVersion.systemPolicy }, { role: 'user', content: `${trusted}\n<validated_untrusted_data>${JSON.stringify(input)}</validated_untrusted_data>` }];
};

const claimExecutions = ({ database = prisma, batchSize = env.aiOperationsWorkerBatchSize, leaseMs = 60000 } = {}) => database.$transaction((tx) => tx.$queryRaw(Prisma.sql`
  WITH candidates AS (
    SELECT "id" FROM "AIOperationExecution"
    WHERE (("status" IN ('PENDING'::"AIExecutionStatus", 'FAILED'::"AIExecutionStatus") AND "nextAttemptAt" <= CURRENT_TIMESTAMP)
      OR ("status" = 'RUNNING'::"AIExecutionStatus" AND "lockedAt" <= CURRENT_TIMESTAMP - (${leaseMs} * INTERVAL '1 millisecond')))
    ORDER BY "nextAttemptAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
  )
  UPDATE "AIOperationExecution" execution SET "status" = 'RUNNING'::"AIExecutionStatus", "lockedAt" = CURRENT_TIMESTAMP,
    "attemptCount" = execution."attemptCount" + 1, "startedAt" = COALESCE(execution."startedAt", CURRENT_TIMESTAMP), "safeError" = NULL, "lastErrorCode" = NULL
  FROM candidates WHERE execution."id" = candidates."id" RETURNING execution.*
`));

const processExecution = async (claimed, { database = prisma, executeProviderFn = executeProvider, providerExecutionEnabled = env.aiProviderExecutionEnabled } = {}) => {
  const loaded = await database.aIOperationExecution.findUnique({ where: { id: claimed.id }, include: { market: true, operationVersion: { include: { definition: true, promptVersion: true } } } });
  if (!loaded) return null; const version = loaded.operationVersion; const definition = version.definition;
  try {
    if (!providerExecutionEnabled) throw operationalError('Provider execution is disabled.', 'AI_PROVIDER_EXECUTION_DISABLED', 503);
    const { policy, provider, evaluation } = await routeModel({ execution: loaded, version, definition, database }); const budget = await checkBudgets({ execution: loaded, version, policy, database }); await enforceProviderCapacity({ provider, database });
    await database.aIOperationExecution.updateMany({ where: { id: loaded.id, status: 'RUNNING', lockedAt: claimed.lockedAt }, data: { providerId: provider.id, modelPolicyId: policy.id, routingEvidence: { policyKey: policy.key, policyVersion: policy.version, evaluationId: evaluation.id, fallbackUsed: false } } });
    const started = Date.now(); const result = await executeProviderFn({ policy, provider, messages: renderMessages({ promptVersion: version.promptVersion, input: loaded.safeInput }), outputSchema: OPERATION_REGISTRY[definition.kind].outputJsonSchema });
    const output = validateOperationOutput(definition.kind, result.output); const contentDigest = canonicalDigest(output); const estimatedCostMicros = Math.min(budget.reservation, Math.max(0, Number(result.inputTokens || 0) + Number(result.outputTokens || 0)));
    const saved = await database.$transaction(async (tx) => {
      const current = await tx.aIOperationExecution.findUnique({ where: { id: loaded.id } }); if (!current || current.status !== 'RUNNING' || current.lockedAt?.getTime() !== claimed.lockedAt.getTime()) throw operationalError('AI execution lease was lost.', 'AI_EXECUTION_LEASE_LOST', 409);
      const artifact = await tx.aIOutputArtifact.create({ data: { executionId: loaded.id, schemaVersion: version.configurationDigest, content: output, contentDigest, validationStatus: 'VALID', safetyEvidence: { schema: 'passed', injection: 'passed', operationKind: definition.kind } } });
      await tx.aICostRecord.create({ data: { executionId: loaded.id, providerId: provider.id, modelPolicyId: policy.id, marketId: loaded.marketId, inputTokens: Number(result.inputTokens || 0), outputTokens: Number(result.outputTokens || 0), estimatedCostMicros: BigInt(estimatedCostMicros), actualCostMicros: result.actualCostMicros == null ? undefined : BigInt(result.actualCostMicros) } });
      const status = version.approvalRequired ? 'AWAITING_APPROVAL' : 'SUCCEEDED'; await tx.aIOperationExecution.update({ where: { id: loaded.id }, data: { status, providerId: provider.id, modelPolicyId: policy.id, routingEvidence: { policyKey: policy.key, policyVersion: policy.version, evaluationId: evaluation.id, fallbackUsed: false }, completedAt: new Date(), lockedAt: null } });
      const auditReq = { user: { id: loaded.requestedById }, context: { requestId: loaded.requestId, correlationId: loaded.correlationId, traceId: loaded.traceId } };
      await writeAuditLog({ req: auditReq, action: 'AI_EXECUTION_COMPLETED', resourceType: 'AI_OPERATION_EXECUTION', resourceId: loaded.id, metadata: { status, operationKind: definition.kind, providerKey: provider.key, modelPolicyKey: policy.key, artifactDigest: contentDigest } }, tx); return artifact;
    });
    observeAIOperation({ operation: 'execution', outcome: version.approvalRequired ? 'pending_review' : 'succeeded', durationSeconds: (Date.now() - started) / 1000, provider: provider.key }); return saved;
  } catch (error) {
    const retryable = !error.statusCode || error.statusCode >= 500 || error.statusCode === 429; const exhausted = !retryable || claimed.attemptCount >= version.maxAttempts;
    await database.$transaction(async (tx) => {
      const updated = await tx.aIOperationExecution.updateMany({ where: { id: claimed.id, status: 'RUNNING', lockedAt: claimed.lockedAt }, data: { status: exhausted ? 'EXHAUSTED' : 'FAILED', nextAttemptAt: new Date(Date.now() + backoffSeconds(version, claimed.attemptCount) * 1000), lockedAt: null, firstFailureAt: loaded.firstFailureAt || new Date(), lastFailureAt: new Date(), lastErrorCode: error.code || 'AI_EXECUTION_FAILED', safeError: safeError(error), ...(exhausted ? { completedAt: new Date() } : {}) } });
      if (updated.count === 1) {
        const auditReq = { user: { id: loaded.requestedById }, context: { requestId: loaded.requestId, correlationId: loaded.correlationId, traceId: loaded.traceId } };
        await writeAuditLog({ req: auditReq, action: exhausted ? 'AI_EXECUTION_EXHAUSTED' : 'AI_EXECUTION_RETRY_SCHEDULED', resourceType: 'AI_OPERATION_EXECUTION', resourceId: loaded.id, metadata: { attemptCount: claimed.attemptCount, errorCode: error.code || 'AI_EXECUTION_FAILED', operationKind: definition.kind } }, tx);
      }
    });
    observeAIOperation({ operation: 'execution', outcome: exhausted ? 'exhausted' : 'retry', reason: error.code || 'error' }); return null;
  }
};

const runExecutionCycle = async ({ database = prisma, executeProviderFn, providerExecutionEnabled } = {}) => { if (!env.aiOperationsEnabled) return { claimed: 0, processed: 0 }; const claims = await claimExecutions({ database }); for (const claim of claims) await processExecution(claim, { database, executeProviderFn, providerExecutionEnabled }); return { claimed: claims.length, processed: claims.length }; };

const reviewOutput = async ({ executionId, actorId, decision, artifactDigest, reason, req, database = prisma }) => {
  assertEnabled(); const execution = await database.aIOperationExecution.findUnique({ where: { id: executionId }, include: { outputArtifact: true, operationVersion: true } });
  if (!execution?.outputArtifact || execution.status !== 'AWAITING_APPROVAL' || !execution.operationVersion.approvalRequired) throw operationalError('Execution is not pending approval.', 'AI_APPROVAL_NOT_PENDING', 409);
  if (execution.requestedById === actorId) throw operationalError('Requester cannot approve its own AI output.', 'AI_APPROVAL_FOUR_EYES', 409);
  if (execution.outputArtifact.contentDigest !== artifactDigest) throw operationalError('Approval does not match the immutable output.', 'AI_APPROVAL_STALE', 409);
  return database.$transaction(async (tx) => {
    const approval = await tx.aIApproval.create({ data: { outputArtifactId: execution.outputArtifact.id, reviewerId: actorId, decision, artifactDigest, reason, ...requestEvidence(req?.context) } });
    await tx.aIOperationExecution.update({ where: { id: execution.id }, data: { status: decision === 'APPROVED' ? 'SUCCEEDED' : 'REJECTED' } });
    await writeAuditLog({ req, action: `AI_OUTPUT_${decision}`, resourceType: 'AI_OUTPUT_ARTIFACT', resourceId: execution.outputArtifact.id, reason, metadata: { executionId, artifactDigest } }, tx); return approval;
  });
};

const listProviders = async ({ page = 1, limit = 50, status, database = prisma }) => { const where = status ? { status } : {}; const [items, total] = await Promise.all([database.aIProvider.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, select: { id: true, key: true, displayName: true, adapterType: true, status: true, capabilities: true, purposeAllowlist: true, region: true, maximumDataClass: true, timeoutMs: true, maxConcurrency: true, requestsPerMinute: true, createdAt: true, updatedAt: true } }), database.aIProvider.count({ where })]); return { items, pagination: pageResult(page, limit, total) }; };
const listOperations = async ({ page = 1, limit = 50, status, database = prisma }) => { const where = status ? { status } : {}; const [items, total] = await Promise.all([database.aIOperationDefinition.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { promptVersion: { select: { id: true, version: true, status: true, contentDigest: true } }, evaluations: { orderBy: { evaluatedAt: 'desc' }, take: 1 } } } } }), database.aIOperationDefinition.count({ where })]); return { items, pagination: pageResult(page, limit, total) }; };
const listExecutions = async ({ page = 1, limit = 50, status, operationVersionId, database = prisma }) => { const where = { ...(status ? { status } : {}), ...(operationVersionId ? { operationVersionId } : {}) }; const [items, total] = await Promise.all([database.aIOperationExecution.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, select: { id: true, status: true, dataClass: true, attemptCount: true, nextAttemptAt: true, startedAt: true, completedAt: true, lastErrorCode: true, safeError: true, correlationId: true, traceId: true, createdAt: true, operationVersion: { select: { version: true, riskClass: true, definition: { select: { id: true, key: true, kind: true } } } }, provider: { select: { key: true } }, modelPolicy: { select: { key: true, version: true } }, outputArtifact: { select: { id: true, contentDigest: true, validationStatus: true, createdAt: true } } } }), database.aIOperationExecution.count({ where })]); return { items, pagination: pageResult(page, limit, total) }; };
const listEvaluations = async ({ page = 1, limit = 50, status, database = prisma }) => { const where = status ? { status } : {}; const [items, total] = await Promise.all([database.aIEvaluation.findMany({ where, orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }), database.aIEvaluation.count({ where })]); return { items: items.map((item) => ({ ...item, estimatedCostMicros: item.estimatedCostMicros.toString() })), pagination: pageResult(page, limit, total) }; };
const listCosts = async ({ page = 1, limit = 50, marketId, from, to, database = prisma }) => { const where = { ...(marketId ? { marketId } : {}), ...(from || to ? { recordedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }; const [items, total, aggregate] = await Promise.all([database.aICostRecord.findMany({ where, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, include: { provider: { select: { key: true } }, modelPolicy: { select: { key: true, version: true } } } }), database.aICostRecord.count({ where }), database.aICostRecord.aggregate({ where, _sum: { inputTokens: true, outputTokens: true, estimatedCostMicros: true, actualCostMicros: true } })]); return { items: items.map((item) => ({ ...item, estimatedCostMicros: item.estimatedCostMicros.toString(), actualCostMicros: item.actualCostMicros?.toString() || null })), totals: { ...aggregate._sum, estimatedCostMicros: String(aggregate._sum.estimatedCostMicros || 0), actualCostMicros: String(aggregate._sum.actualCostMicros || 0) }, pagination: pageResult(page, limit, total) }; };

module.exports = { DATA_CLASS_RANK, activateModelPolicy, activateOperation, backoffSeconds, checkBudgets, claimExecutions, createModelPolicy, createOperation, createProvider, enforceProviderCapacity, listCosts, listEvaluations, listExecutions, listOperations, listProviders, processExecution, queueExecution, recordEvaluation, referenceRecord, renderMessages, resolveIdempotentExecution, reviewModelPolicy, reviewOutput, reviewPrompt, routeModel, runExecutionCycle, safeError, setProviderStatus, validateProviderInput };
