require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';
process.env.SUPPLY_DEMAND_ENABLED = 'true';
process.env.AI_OPERATIONS_ENABLED = 'true';
process.env.AI_PROVIDER_EXECUTION_ENABLED = 'false';
process.env.AI_OPERATIONS_WORKER_ENABLED = 'false';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true deliberately.');
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated PostgreSQL test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const prisma = require('../../src/config/prisma');
const { hashPassword } = require('../../src/utils/password');
const { policyDigest } = require('../../src/modules/markets/market.service');
const { generateSnapshot } = require('../../src/modules/supply-demand/supply-demand.service');
const {
  REQUIRED_DIMENSIONS, activatePolicy, createExpansionCandidate, createPolicy, evaluateExpansion,
  evaluateReadiness, reviewExpansion, reviewPolicy,
} = require('../../src/modules/supply-demand/readiness.service');
const {
  activateModelPolicy, activateOperation, claimExecutions, createModelPolicy, createOperation,
  createProvider, processExecution, queueExecution, recordEvaluation, reviewModelPolicy, reviewOutput,
  reviewPrompt, setProviderStatus,
} = require('../../src/modules/ai-operations/ai-operations.service');

const suffix = Date.now().toString(36).slice(-7).toUpperCase();
const runId = `f10-${suffix.toLowerCase()}`;
const marketCode = `Z${suffix}`;
const created = {};
const reqFor = (userId, action) => ({ user: { id: userId }, ip: '127.0.0.1', get: () => 'f10-integration', context: { requestId: `${runId}-${action}`, correlationId: runId, traceId: 'a'.repeat(32) } });
const weights = Object.fromEntries(REQUIRED_DIMENSIONS.map((key, index) => [key, index === 0 ? 837 : 833]));
const thresholds = Object.fromEntries(REQUIRED_DIMENSIONS.map((key) => [key, { minimum: 0, blocking: true }]));
const evaluationInput = (modelPolicyKey) => ({
  evaluatorVersion: 'f10-evaluator-v1', datasetVersion: 'f10-fixtures-v1', datasetDigest: 'd'.repeat(64), modelPolicyKey,
  sampleSize: 20, schemaPassRateBps: 10000, safetyPassRateBps: 10000, qualityScoreBps: 9500,
  p95LatencyMs: 100, estimatedCostMicros: 100, thresholds: { minimumSchemaPassRateBps: 10000, minimumSafetyPassRateBps: 10000, minimumQualityScoreBps: 9000, maximumP95LatencyMs: 1000, maximumCostMicros: 1000 },
  results: { promptInjection: 'passed', schema: 'passed', factuality: 'fixture-referenced' },
});

const createRoutedOperation = async ({ key, kind, riskClass, capability, allowedToolKeys }) => {
  const modelPolicy = await createModelPolicy({ providerId: created.provider.id, input: { key: `${runId}.${key}.model`, modelIdentifier: 'fixture-model-v1', capability, purposeAllowlist: ['operations'], operationAllowlist: [kind], maximumDataClass: 'INTERNAL', marketAllowlist: [marketCode], localeAllowlist: ['es-ES'], maxInputTokens: 2000, maxOutputTokens: 500, timeoutMs: 2000, maxCostMicros: 1000, routingPriority: 10, constraints: { fixture: true } }, actorId: created.author.id, req: reqFor(created.author.id, `${key}-model`) });
  await reviewModelPolicy({ policyId: modelPolicy.id, actorId: created.reviewer.id, decision: 'APPROVED', reason: 'Independent fixture model policy review.', req: reqFor(created.reviewer.id, `${key}-model-review`) });
  await activateModelPolicy({ policyId: modelPolicy.id, actorId: created.reviewer.id, reason: 'Activate only in isolated test.', req: reqFor(created.reviewer.id, `${key}-model-active`) });
  const operation = await createOperation({ input: { key: `${runId}.${key}`, kind, purpose: 'operations', riskClass, systemPolicy: 'Use only supplied structured evidence and never execute actions.', templateContent: 'Analyze the validated context and return only the required schema: {{context}}', requiredVariables: ['context'], allowedToolKeys, maximumDataClass: 'INTERNAL', maxInputBytes: 8192, maxAttempts: 3, initialBackoffSeconds: 1, maxBackoffSeconds: 4, maxCostMicros: 1000 }, actorId: created.author.id, req: reqFor(created.author.id, `${key}-operation`) });
  await reviewPrompt({ promptVersionId: operation.promptVersion.id, actorId: created.reviewer.id, decision: 'APPROVED', reason: 'Independent prompt safety review.', req: reqFor(created.reviewer.id, `${key}-prompt-review`) });
  await recordEvaluation({ operationVersionId: operation.version.id, input: evaluationInput(modelPolicy.key), req: reqFor(created.reviewer.id, `${key}-evaluation`) });
  await activateOperation({ operationId: operation.definition.id, actorId: created.reviewer.id, reason: 'All isolated quality gates passed.', req: reqFor(created.reviewer.id, `${key}-active`) });
  return operation;
};

test.before(async () => {
  const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'ES' } });
  const passwordHash = await hashPassword('integration-password');
  const [author, reviewer] = await Promise.all(['author', 'reviewer'].map((name, index) => prisma.user.create({ data: { email: `${runId}-${name}@example.test`, phone: `+348${Date.now().toString().slice(-7)}${index}`, passwordHash, firstName: 'F10', lastName: name, role: 'CLIENT', countryCode: 'ES', registrationLocale: 'es-ES' } })));
  Object.assign(created, { author, reviewer });
  const market = await prisma.market.create({ data: { code: marketCode, countryId: country.id, status: 'DISABLED', currencyCode: 'EUR', defaultLocale: 'es-ES', supportedLocales: ['es-ES'], timezonePolicy: { default: 'Europe/Madrid' }, capabilities: { supplyDemand: true, aiOperations: false }, currentPolicyVersion: 1 } });
  created.market = market;
  const policyInput = { identityPolicy: { selection: 'ONE_OF', documentTypes: [] }, geographyPolicy: { source: 'INE_ES', levels: [] }, addressPolicy: { coordinates: 'OPTIONAL', fields: [] }, localePolicy: { default: 'es-ES', supported: ['es-ES'] }, currencyPolicy: { currency: 'EUR', authority: 'F3' }, legalPolicyReferences: [], taxPolicyReference: null, paymentPolicyReference: null };
  await prisma.marketPolicyVersion.create({ data: { marketId: market.id, version: 1, status: 'ACTIVE', reviewStatus: 'APPROVED', reviewedBy: reviewer.id, reviewedAt: new Date(), effectiveAt: new Date('2026-01-01'), ...policyInput, schemaDigest: policyDigest(policyInput) } });
  const provider = await createProvider({ input: { key: `${runId}.provider`, displayName: 'F10 integration provider', adapterType: 'OPENAI_RESPONSES', capabilities: ['text-summary', 'reasoning'], purposeAllowlist: ['operations'], region: 'test', maximumDataClass: 'INTERNAL', timeoutMs: 2000, maxConcurrency: 4, requestsPerMinute: 100, circuitBreakerPolicy: { windowMinutes: 5, failureThreshold: 5 }, secretEnvName: 'AI_PROVIDER_INTEGRATION_KEY' }, actorId: author.id, req: reqFor(author.id, 'provider') });
  await setProviderStatus({ providerId: provider.id, status: 'ACTIVE', actorId: reviewer.id, reason: 'Isolated adapter fixture only.', req: reqFor(reviewer.id, 'provider-active') });
  created.provider = provider;
});

test.after(async () => { await prisma.$disconnect(); });

test('PostgreSQL preserves reproducible snapshots, evidence-based readiness and recommendation-only expansion', async () => {
  const now = new Date('2026-09-10T12:00:00Z');
  const args = { marketId: created.market.id, window: 'SEVEN_DAYS', actorId: created.author.id, req: reqFor(created.author.id, 'snapshot'), now };
  const snapshots = await Promise.all(Array.from({ length: 5 }, () => generateSnapshot(args)));
  assert.equal(new Set(snapshots.map((item) => item.id)).size, 1);
  assert.equal(await prisma.supplyDemandSnapshot.count({ where: { snapshotKey: snapshots[0].snapshotKey } }), 1);
  const readinessPolicy = await createPolicy({ input: { key: `${runId}.readiness`, marketId: created.market.id, requiredDimensions: REQUIRED_DIMENSIONS, thresholds, weights, dataQualityPolicy: { accepted: ['COMPLETE', 'PARTIAL'] }, algorithmVersion: 'readiness-rules-v1' }, actorId: created.author.id, req: reqFor(created.author.id, 'readiness-policy') });
  await reviewPolicy({ policyId: readinessPolicy.id, actorId: created.reviewer.id, decision: 'APPROVED', reason: 'Independent operational policy review.', req: reqFor(created.reviewer.id, 'readiness-review') });
  await activatePolicy({ policyId: readinessPolicy.id, actorId: created.reviewer.id, reason: 'Activate evaluation policy only.', req: reqFor(created.reviewer.id, 'readiness-active') });
  const readiness = await evaluateReadiness({ marketId: created.market.id, snapshotId: snapshots[0].id, policyId: readinessPolicy.id, req: reqFor(created.reviewer.id, 'readiness-evaluate') });
  assert.equal(readiness.outcome, 'NOT_READY');
  assert.ok(readiness.blockers.includes('market_inactive'));
  assert.equal((await prisma.market.findUniqueOrThrow({ where: { id: created.market.id } })).status, 'DISABLED');
  const candidate = await createExpansionCandidate({ input: { type: 'MARKET', marketId: created.market.id, hypothesis: 'Investigate operational readiness without activating the market.' }, actorId: created.author.id, req: reqFor(created.author.id, 'expansion-candidate') });
  const expansion = await evaluateExpansion({ candidateId: candidate.id, readinessEvaluationId: readiness.id, req: reqFor(created.reviewer.id, 'expansion-evaluate') });
  assert.equal(expansion.recommendation, 'DO_NOT_PROCEED');
  assert.equal(expansion.guardrails.activationAllowed, false);
  await reviewExpansion({ evaluationId: expansion.id, actorId: created.reviewer.id, decision: 'APPROVED', reason: 'Approve the evidence record, not activation.', req: reqFor(created.reviewer.id, 'expansion-review') });
  assert.equal((await prisma.market.findUniqueOrThrow({ where: { id: created.market.id } })).status, 'DISABLED');
  Object.assign(created, { snapshot: snapshots[0], readiness, expansion });
});

test('PostgreSQL gives AI executions one durable effect under duplicate concurrent requests', async () => {
  const operation = await createRoutedOperation({ key: 'summary', kind: 'SUMMARIZE_SUPPLY_DEMAND_ANOMALY', riskClass: 'LOW', capability: 'text-summary', allowedToolKeys: ['READ_SUPPLY_DEMAND_SNAPSHOT'] });
  const input = { locale: 'es-ES', marketCode, references: [{ type: 'SUPPLY_DEMAND_SNAPSHOT', id: created.snapshot.id, digest: created.snapshot.inputDigest, dataClass: 'INTERNAL' }], context: { anomaly: 'coverage_gap', value: 0 } };
  const idempotencyKey = `${runId}:summary:1`;
  const queued = await Promise.all(Array.from({ length: 8 }, () => queueExecution({ operationId: operation.definition.id, idempotencyKey, input, dataClass: 'INTERNAL', actorId: created.author.id, req: reqFor(created.author.id, 'summary-queue') })));
  assert.equal(new Set(queued.map((item) => item.execution.id)).size, 1);
  assert.equal(await prisma.aIOperationExecution.count({ where: { idempotencyKey } }), 1);
  await prisma.aIOperationExecution.update({ where: { id: queued[0].execution.id }, data: { nextAttemptAt: new Date(0) } });
  const claims = (await Promise.all(Array.from({ length: 4 }, () => claimExecutions({ batchSize: 1 })))).flat();
  assert.equal(claims.filter((item) => item.id === queued[0].execution.id).length, 1);
  const claimed = claims.find((item) => item.id === queued[0].execution.id);
  const output = { summary: 'No eligible supply is available in the isolated fixture.', findings: ['Investigate verified professional coverage.'], evidenceReferences: [created.snapshot.id], uncertainty: 'LOW' };
  await processExecution(claimed, { providerExecutionEnabled: true, executeProviderFn: async () => ({ output, inputTokens: 40, outputTokens: 20, actualCostMicros: 60 }) });
  const saved = await prisma.aIOperationExecution.findUniqueOrThrow({ where: { id: queued[0].execution.id }, include: { outputArtifact: true, costRecords: true } });
  assert.equal(saved.status, 'SUCCEEDED');
  assert.ok(saved.outputArtifact);
  assert.equal(saved.costRecords.length, 1);
});

test('HIGH AI outputs require immutable four-eyes approval and every F10 table remains forced-RLS default deny', async () => {
  const operation = await createRoutedOperation({ key: 'expansion', kind: 'SUGGEST_EXPANSION_HYPOTHESES', riskClass: 'HIGH', capability: 'reasoning', allowedToolKeys: ['READ_EXPANSION_EVALUATION'] });
  const input = { locale: 'es-ES', marketCode, references: [{ type: 'EXPANSION_EVALUATION', id: created.expansion.id, digest: created.expansion.inputDigest, dataClass: 'INTERNAL' }], context: { recommendation: 'DO_NOT_PROCEED' } };
  const queued = await queueExecution({ operationId: operation.definition.id, idempotencyKey: `${runId}:expansion:1`, input, dataClass: 'INTERNAL', actorId: created.author.id, req: reqFor(created.author.id, 'high-queue') });
  await prisma.aIOperationExecution.update({ where: { id: queued.execution.id }, data: { nextAttemptAt: new Date(0) } });
  const [claimed] = await claimExecutions({ batchSize: 1 });
  const output = { hypotheses: [{ title: 'Collect supply evidence', rationale: 'The deterministic readiness evaluation contains blockers.', evidenceReferences: [created.expansion.id], missingEvidence: ['eligible professional coverage'] }], recommendation: 'DO_NOT_PROCEED', warnings: ['Human review is required.'] };
  await processExecution(claimed, { providerExecutionEnabled: true, executeProviderFn: async () => ({ output, inputTokens: 60, outputTokens: 40, actualCostMicros: 100 }) });
  const pending = await prisma.aIOperationExecution.findUniqueOrThrow({ where: { id: queued.execution.id }, include: { outputArtifact: true } });
  assert.equal(pending.status, 'AWAITING_APPROVAL');
  await assert.rejects(() => reviewOutput({ executionId: pending.id, actorId: created.author.id, decision: 'APPROVED', artifactDigest: pending.outputArtifact.contentDigest, reason: 'Self approval must fail.', req: reqFor(created.author.id, 'self-approval') }), (error) => error.code === 'AI_APPROVAL_FOUR_EYES');
  await assert.rejects(() => reviewOutput({ executionId: pending.id, actorId: created.reviewer.id, decision: 'APPROVED', artifactDigest: '0'.repeat(64), reason: 'Stale digest must fail.', req: reqFor(created.reviewer.id, 'stale-approval') }), (error) => error.code === 'AI_APPROVAL_STALE');
  await reviewOutput({ executionId: pending.id, actorId: created.reviewer.id, decision: 'APPROVED', artifactDigest: pending.outputArtifact.contentDigest, reason: 'Independent approval of this exact immutable artifact.', req: reqFor(created.reviewer.id, 'approval') });
  assert.equal((await prisma.aIOperationExecution.findUniqueOrThrow({ where: { id: pending.id } })).status, 'SUCCEEDED');
  const tables = await prisma.$queryRaw`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('SupplyDemandMetricDefinition','SupplyDemandObservation','SupplyDemandSnapshot','MarketReadinessPolicy','MarketReadinessEvaluation','ExpansionCandidate','ExpansionEvaluation','OperationalRecommendation','AIProvider','AIModelPolicy','AIPromptTemplate','AIPromptVersion','AIOperationDefinition','AIOperationVersion','AIOperationExecution','AIInputReference','AIOutputArtifact','AIEvaluation','AIApproval','AICostRecord') ORDER BY relname`;
  assert.equal(tables.length, 20);
  assert.equal(tables.every((row) => row.relrowsecurity && row.relforcerowsecurity), true);
  const policies = await prisma.$queryRaw`SELECT tablename FROM pg_policies WHERE tablename IN ('SupplyDemandSnapshot','MarketReadinessEvaluation','ExpansionEvaluation','AIOperationExecution','AIOutputArtifact')`;
  assert.equal(policies.length, 0);
  assert.equal((await prisma.market.findUniqueOrThrow({ where: { id: created.market.id } })).status, 'DISABLED');
});
