const { createHmac } = require('node:crypto');
const { z } = require('zod');
const { isKnownEvent } = require('../growth/events/event-taxonomy');
const { canonicalDigest, operationalError, sanitizePrivateObject } = require('../privacy/privacy-utils');

const FACT_PATHS = new Set([
  'market.code', 'country.code', 'locale', 'actorType', 'lifecycleStatus',
  'campaign.source', 'featureEligible', 'activity.registrationCount',
  'activity.bookingCount', 'activity.completedBookingCount',
]);
const OPERATORS = new Set(['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'in', 'is_true']);
const F8_METRICS = new Set(['referral_created', 'referral_converted']);

const validateAudience = (node, depth = 0, counter = { value: 0 }) => {
  if (node == null) return null;
  if (depth > 4 || ++counter.value > 20) throw operationalError('Audience exceeds bounded complexity.', 'EXPERIMENT_AUDIENCE_LIMIT', 400);
  if (!node || typeof node !== 'object' || Array.isArray(node)) throw operationalError('Audience node must be an object.', 'EXPERIMENT_AUDIENCE_INVALID', 400);
  if (node.all || node.any) {
    const key = node.all ? 'all' : 'any';
    if (Object.keys(node).length !== 1 || !Array.isArray(node[key]) || node[key].length < 1 || node[key].length > 20) throw operationalError('Audience group is invalid.', 'EXPERIMENT_AUDIENCE_INVALID', 400);
    return { [key]: node[key].map((item) => validateAudience(item, depth + 1, counter)) };
  }
  if (Object.keys(node).some((key) => !['path', 'operator', 'value'].includes(key)) || !FACT_PATHS.has(node.path) || !OPERATORS.has(node.operator)) throw operationalError('Audience uses a non-allowlisted fact or operator.', 'EXPERIMENT_AUDIENCE_INVALID', 400);
  const value = node.operator === 'is_true' ? undefined : sanitizePrivateObject(node.value, { maxDepth: 2, maxKeys: 20, maxString: 80 });
  if (node.operator === 'in' && (!Array.isArray(value) || value.length > 50)) throw operationalError('Audience membership is invalid.', 'EXPERIMENT_AUDIENCE_INVALID', 400);
  return { path: node.path, operator: node.operator, ...(node.operator === 'is_true' ? {} : { value }) };
};

const valueAt = (facts, path) => path.split('.').reduce((value, key) => value?.[key], facts);
const evaluateLeaf = (node, facts) => {
  const actual = valueAt(facts, node.path);
  switch (node.operator) {
    case 'equals': return actual === node.value;
    case 'not_equals': return actual !== node.value;
    case 'gt': return Number(actual) > Number(node.value);
    case 'gte': return Number(actual) >= Number(node.value);
    case 'lt': return Number(actual) < Number(node.value);
    case 'lte': return Number(actual) <= Number(node.value);
    case 'in': return Array.isArray(node.value) && node.value.includes(actual);
    case 'is_true': return actual === true;
    default: return false;
  }
};
const evaluateAudience = (tree, facts) => !tree ? true : tree.all
  ? tree.all.every((item) => evaluateAudience(item, facts))
  : tree.any ? tree.any.some((item) => evaluateAudience(item, facts)) : evaluateLeaf(tree, facts);

const variantSchema = z.object({ key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/), name: z.string().trim().min(2).max(100), isControl: z.boolean().default(false), weightBps: z.number().int().min(1).max(10_000), payload: z.record(z.string(), z.unknown()) }).strict();
const metricSchema = z.object({ key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/), role: z.enum(['PRIMARY', 'GUARDRAIL']), eventName: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_.-]{2,127}$/), aggregation: z.enum(['UNIQUE_SUBJECT_RATE', 'EVENT_RATE']).default('UNIQUE_SUBJECT_RATE'), windowHours: z.number().int().min(1).max(8_760), direction: z.enum(['INCREASE', 'DECREASE']), minimumSampleSize: z.number().int().min(10).max(10_000_000), guardrailThreshold: z.number().finite().min(0).max(1).optional() }).strict();

const validateDefinition = (definition) => {
  const variants = z.array(variantSchema).min(2).max(10).parse(definition.variants).map((item) => ({ ...item, payload: sanitizePrivateObject(item.payload) }));
  if (new Set(variants.map((item) => item.key)).size !== variants.length) throw operationalError('Variant keys must be unique.', 'EXPERIMENT_VARIANTS_INVALID', 400);
  if (variants.filter((item) => item.isControl).length !== 1) throw operationalError('Exactly one control variant is required.', 'EXPERIMENT_CONTROL_INVALID', 400);
  if (variants.reduce((sum, item) => sum + item.weightBps, 0) !== 10_000) throw operationalError('Variant weights must total 10000 basis points.', 'EXPERIMENT_WEIGHTS_INVALID', 400);
  const metrics = z.array(metricSchema).min(1).max(20).parse(definition.metrics);
  if (metrics.filter((item) => item.role === 'PRIMARY').length !== 1) throw operationalError('Exactly one primary metric is required.', 'EXPERIMENT_PRIMARY_METRIC_INVALID', 400);
  if (new Set(metrics.map((item) => item.key)).size !== metrics.length) throw operationalError('Metric keys must be unique.', 'EXPERIMENT_METRICS_INVALID', 400);
  for (const metric of metrics) if (!isKnownEvent(metric.eventName) && !F8_METRICS.has(metric.eventName)) throw operationalError('Metric event is not canonical.', 'EXPERIMENT_METRIC_EVENT_INVALID', 400);
  const audience = validateAudience(definition.audience);
  return { variants, metrics, audience, configurationDigest: canonicalDigest({ variants, metrics, audience }) };
};

const bucketFor = ({ versionId, subjectKey, secret }) => Number(createHmac('sha256', secret).update(`${versionId}:${subjectKey}`).digest().readUIntBE(0, 6) % 10_000);
const selectVariant = (variants, bucket) => {
  let upper = 0;
  for (const variant of [...variants].sort((a, b) => a.key.localeCompare(b.key))) { upper += variant.weightBps; if (bucket < upper) return variant; }
  throw operationalError('Variant allocation is invalid.', 'EXPERIMENT_ALLOCATION_INVALID', 500);
};

module.exports = { FACT_PATHS, OPERATORS, bucketFor, evaluateAudience, selectVariant, validateAudience, validateDefinition };
