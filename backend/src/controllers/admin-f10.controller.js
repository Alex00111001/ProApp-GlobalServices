const v = require('../validators/supply-demand-ai.validators');
const supply = require('../modules/supply-demand/supply-demand.service');
const readiness = require('../modules/supply-demand/readiness.service');
const ai = require('../modules/ai-operations/ai-operations.service');

const handler = (work) => async (req, res, next) => { try { return await work(req, res); } catch (error) { return next(error); } };

exports.metricDefinitions = handler(async (req, res) => res.json(await supply.listMetricDefinitions(v.metricListQuery.parse(req.query))));
exports.snapshots = handler(async (req, res) => res.json(await supply.listSnapshots(v.snapshotListQuery.parse(req.query))));
exports.generateSnapshot = handler(async (req, res) => res.status(201).json({ snapshot: await supply.generateSnapshot({ ...v.snapshotBody.parse(req.body), actorId: req.user.id, req }) }));

exports.readinessPolicies = handler(async (req, res) => res.json(await readiness.listPolicies(v.readinessListQuery.pick({ page: true, limit: true, marketId: true, status: true }).parse(req.query))));
exports.createReadinessPolicy = handler(async (req, res) => res.status(201).json({ policy: await readiness.createPolicy({ input: v.readinessPolicyBody.parse(req.body), actorId: req.user.id, req }) }));
exports.reviewReadinessPolicy = handler(async (req, res) => res.json({ policy: await readiness.reviewPolicy({ policyId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.reviewBody.parse(req.body) }) }));
exports.activateReadinessPolicy = handler(async (req, res) => res.json({ policy: await readiness.activatePolicy({ policyId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.activateBody.parse(req.body) }) }));
exports.readinessEvaluations = handler(async (req, res) => res.json(await readiness.listEvaluations(v.readinessListQuery.pick({ page: true, limit: true, marketId: true, outcome: true }).parse(req.query))));
exports.evaluateReadiness = handler(async (req, res) => res.status(201).json({ evaluation: await readiness.evaluateReadiness({ ...v.readinessEvaluateBody.parse(req.body), req }) }));

exports.expansion = handler(async (req, res) => res.json(await readiness.listExpansion(v.expansionListQuery.parse(req.query))));
exports.createExpansion = handler(async (req, res) => res.status(201).json({ candidate: await readiness.createExpansionCandidate({ input: v.expansionBody.parse(req.body), actorId: req.user.id, req }) }));
exports.evaluateExpansion = handler(async (req, res) => res.status(201).json({ evaluation: await readiness.evaluateExpansion({ candidateId: v.uuid.parse(req.params.id), ...v.expansionEvaluateBody.parse(req.body), req }) }));
exports.reviewExpansion = handler(async (req, res) => res.json({ evaluation: await readiness.reviewExpansion({ evaluationId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.expansionReviewBody.parse(req.body) }) }));

exports.providers = handler(async (req, res) => res.json(await ai.listProviders(v.genericStatusQuery.parse(req.query))));
exports.createProvider = handler(async (req, res) => res.status(201).json({ provider: await ai.createProvider({ input: v.providerBody.parse(req.body), actorId: req.user.id, req }) }));
exports.setProviderStatus = handler(async (req, res) => res.json({ provider: await ai.setProviderStatus({ providerId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.providerStatusBody.parse(req.body) }) }));
exports.createModelPolicy = handler(async (req, res) => res.status(201).json({ policy: await ai.createModelPolicy({ providerId: v.uuid.parse(req.params.id), input: v.modelPolicyBody.parse(req.body), actorId: req.user.id, req }) }));
exports.reviewModelPolicy = handler(async (req, res) => res.json({ policy: await ai.reviewModelPolicy({ policyId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.reviewBody.parse(req.body) }) }));
exports.activateModelPolicy = handler(async (req, res) => res.json({ policy: await ai.activateModelPolicy({ policyId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.activateBody.parse(req.body) }) }));
exports.operations = handler(async (req, res) => res.json(await ai.listOperations(v.genericStatusQuery.parse(req.query))));
exports.createOperation = handler(async (req, res) => res.status(201).json(await ai.createOperation({ input: v.operationBody.parse(req.body), actorId: req.user.id, req })));
exports.reviewPrompt = handler(async (req, res) => res.json({ promptVersion: await ai.reviewPrompt({ promptVersionId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.reviewBody.parse(req.body) }) }));
exports.recordEvaluation = handler(async (req, res) => res.status(201).json({ evaluation: await ai.recordEvaluation({ operationVersionId: v.uuid.parse(req.params.id), input: v.evaluationBody.parse(req.body), req }) }));
exports.activateOperation = handler(async (req, res) => res.json({ operation: await ai.activateOperation({ operationId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.activateBody.parse(req.body) }) }));
exports.executeOperation = handler(async (req, res) => { const body = v.executionBody.parse(req.body); res.status(202).json(await ai.queueExecution({ operationId: v.uuid.parse(req.params.id), idempotencyKey: body.idempotencyKey, dataClass: body.dataClass, input: body.input, actorId: req.user.id, req })); });
exports.executions = handler(async (req, res) => res.json(await ai.listExecutions(v.genericStatusQuery.extend({ operationVersionId: v.uuid.optional() }).parse(req.query))));
exports.reviewOutput = handler(async (req, res) => res.json({ approval: await ai.reviewOutput({ executionId: v.uuid.parse(req.params.id), actorId: req.user.id, req, ...v.approvalBody.parse(req.body) }) }));
exports.evaluations = handler(async (req, res) => res.json(await ai.listEvaluations(v.genericStatusQuery.parse(req.query))));
exports.costs = handler(async (req, res) => res.json(await ai.listCosts(v.costsQuery.parse(req.query))));

module.exports = exports;
