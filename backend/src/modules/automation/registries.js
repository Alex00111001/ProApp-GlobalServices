const { z } = require('zod');
const { operationalError, sanitizePrivateObject } = require('../privacy/privacy-utils');

const TRIGGER_REGISTRY = Object.freeze({
  'booking.completed': { schemaVersion: 1 },
  'booking.cancelled': { schemaVersion: 1 },
  'payment.completed': { schemaVersion: 1 },
  'refund.completed': { schemaVersion: 1 },
  'privacy.consent.withdrawn': { schemaVersion: 1 },
  'referral.created': { schemaVersion: 1 },
  'referral.qualified': { schemaVersion: 1 },
  'referral.converted': { schemaVersion: 1 },
  'referral.reward.created': { schemaVersion: 1 },
  'referral.reward.reversed': { schemaVersion: 1 },
});

const FACT_PATHS = new Set([
  'event.type', 'event.aggregateType', 'event.aggregateId',
  'payload.status', 'payload.market', 'payload.actorType', 'payload.reasonCode',
  'payload.rewardType', 'payload.beneficiarySide', 'payload.purpose',
]);
const OPERATORS = new Set(['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'in', 'before', 'after', 'is_true']);

const assertConditionTree = (tree, depth = 0, counter = { value: 0 }) => {
  if (tree == null) return null;
  if (depth > 4 || ++counter.value > 20) throw operationalError('Condition tree exceeds bounded complexity.', 'AUTOMATION_CONDITION_LIMIT', 400);
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) throw operationalError('Condition node must be an object.', 'AUTOMATION_CONDITION_INVALID', 400);
  if (tree.all || tree.any) {
    const key = tree.all ? 'all' : 'any';
    if (Object.keys(tree).length !== 1 || !Array.isArray(tree[key]) || tree[key].length < 1 || tree[key].length > 20) throw operationalError('Condition group is invalid.', 'AUTOMATION_CONDITION_INVALID', 400);
    return { [key]: tree[key].map((item) => assertConditionTree(item, depth + 1, counter)) };
  }
  if (Object.keys(tree).some((key) => !['path', 'operator', 'value'].includes(key)) || !FACT_PATHS.has(tree.path) || !OPERATORS.has(tree.operator)) throw operationalError('Condition uses a non-allowlisted path or operator.', 'AUTOMATION_CONDITION_INVALID', 400);
  return { path: tree.path, operator: tree.operator, ...(tree.operator === 'is_true' ? {} : { value: sanitizePrivateObject(tree.value) }) };
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
    case 'in': return Array.isArray(node.value) && node.value.length <= 100 && node.value.includes(actual);
    case 'before': return Number.isFinite(Date.parse(actual)) && Date.parse(actual) < Date.parse(node.value);
    case 'after': return Number.isFinite(Date.parse(actual)) && Date.parse(actual) > Date.parse(node.value);
    case 'is_true': return actual === true;
    default: return false;
  }
};
const evaluateConditionTree = (tree, facts) => !tree ? true : tree.all
  ? tree.all.every((item) => evaluateConditionTree(item, facts))
  : tree.any ? tree.any.some((item) => evaluateConditionTree(item, facts)) : evaluateLeaf(tree, facts);

const supportConfig = z.object({ subject: z.string().trim().min(3).max(160), category: z.enum(['ACCOUNT', 'BOOKING', 'PAYMENT', 'PROFESSIONAL', 'SAFETY', 'OTHER']), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM') }).strict();
const notificationConfig = z.object({ type: z.enum(['SYSTEM', 'REMINDER', 'PROMOTION']), title: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(500), recipientPath: z.enum(['payload.userId', 'payload.referrerUserId', 'payload.referredUserId']), purpose: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,80}$/).optional(), countryCode: z.string().regex(/^[A-Z]{2}$/).optional(), locale: z.string().min(2).max(20).optional() }).strict();
const emitConfig = z.object({ eventType: z.enum(['automation.task.created', 'automation.notification.enqueued']), aggregateType: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{1,79}$/) }).strict();
const rewardConfig = z.object({ side: z.enum(['REFERRER', 'REFERRED', 'BOTH']).default('BOTH') }).strict();
const ACTION_REGISTRY = Object.freeze({ CREATE_REFERRAL_REWARD: rewardConfig, CREATE_SUPPORT_CASE: supportConfig, ENQUEUE_NOTIFICATION: notificationConfig, EMIT_DOMAIN_EVENT: emitConfig });

const validateAutomationVersion = ({ trigger, conditionTree, actions }) => {
  const registered = TRIGGER_REGISTRY[trigger.eventType];
  if (!registered || registered.schemaVersion !== trigger.schemaVersion) throw operationalError('Trigger is not registered at this schema version.', 'AUTOMATION_TRIGGER_NOT_REGISTERED', 400);
  const condition = assertConditionTree(conditionTree);
  const validatedActions = actions.map((action, position) => {
    const schema = ACTION_REGISTRY[action.actionType];
    if (!schema) throw operationalError('Action is not registered.', 'AUTOMATION_ACTION_NOT_REGISTERED', 400);
    if (action.maxBackoffSeconds < action.initialBackoffSeconds) throw operationalError('Retry policy is invalid.', 'AUTOMATION_RETRY_INVALID', 400);
    return { ...action, position, configuration: schema.parse(action.configuration) };
  });
  return { trigger, conditionTree: condition, actions: validatedActions };
};

module.exports = { ACTION_REGISTRY, FACT_PATHS, TRIGGER_REGISTRY, assertConditionTree, evaluateConditionTree, validateAutomationVersion };
