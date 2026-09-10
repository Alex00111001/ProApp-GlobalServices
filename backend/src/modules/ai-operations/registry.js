const { z } = require('zod');
const { operationalError, sanitizePrivateObject } = require('../privacy/privacy-utils');

const boundedText = z.string().trim().min(1).max(4000);
const safeReference = z.object({ type: z.enum(['SUPPLY_DEMAND_SNAPSHOT', 'READINESS_EVALUATION', 'EXPANSION_EVALUATION', 'INCIDENT']), id: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), dataClass: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL']) }).strict();
const commonInput = z.object({ locale: z.string().trim().min(2).max(35), marketCode: z.string().regex(/^[A-Z][A-Z0-9_-]{1,15}$/).optional(), references: z.array(safeReference).min(1).max(20), context: z.record(z.string(), z.unknown()).optional() }).strict();
const summaryOutput = z.object({ summary: z.string().trim().min(1).max(2000), findings: z.array(z.string().trim().min(1).max(500)).max(20), evidenceReferences: z.array(z.string().uuid()).max(20), uncertainty: z.enum(['LOW', 'MEDIUM', 'HIGH']) }).strict();
const classificationOutput = z.object({ classification: z.enum(['INFORMATIONAL', 'INVESTIGATE', 'URGENT_REVIEW']), confidenceBps: z.number().int().min(0).max(10000), reasons: z.array(z.string().trim().min(1).max(500)).min(1).max(20), evidenceReferences: z.array(z.string().uuid()).max(20) }).strict();
const expansionOutput = z.object({ hypotheses: z.array(z.object({ title: z.string().min(1).max(160), rationale: z.string().min(1).max(1000), evidenceReferences: z.array(z.string().uuid()).max(20), missingEvidence: z.array(z.string().max(160)).max(20) }).strict()).max(10), recommendation: z.enum(['INVESTIGATE', 'DO_NOT_PROCEED']), warnings: z.array(z.string().max(500)).max(20) }).strict();
const draftOutput = z.object({ title: z.string().min(1).max(160), draft: z.string().min(1).max(8000), reviewChecklist: z.array(z.string().max(300)).min(1).max(20), publishable: z.literal(false) }).strict();

const OUTPUT_JSON_SCHEMAS = Object.freeze({
  SUMMARY: { type: 'object', additionalProperties: false, required: ['summary', 'findings', 'evidenceReferences', 'uncertainty'], properties: { summary: { type: 'string', maxLength: 2000 }, findings: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 500 } }, evidenceReferences: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uuid' } }, uncertainty: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] } } },
  CLASSIFICATION: { type: 'object', additionalProperties: false, required: ['classification', 'confidenceBps', 'reasons', 'evidenceReferences'], properties: { classification: { type: 'string', enum: ['INFORMATIONAL', 'INVESTIGATE', 'URGENT_REVIEW'] }, confidenceBps: { type: 'integer', minimum: 0, maximum: 10000 }, reasons: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', maxLength: 500 } }, evidenceReferences: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uuid' } } } },
  EXPANSION: { type: 'object', additionalProperties: false, required: ['hypotheses', 'recommendation', 'warnings'], properties: { hypotheses: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['title', 'rationale', 'evidenceReferences', 'missingEvidence'], properties: { title: { type: 'string', maxLength: 160 }, rationale: { type: 'string', maxLength: 1000 }, evidenceReferences: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uuid' } }, missingEvidence: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 160 } } } } }, recommendation: { type: 'string', enum: ['INVESTIGATE', 'DO_NOT_PROCEED'] }, warnings: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 500 } } } },
  DRAFT: { type: 'object', additionalProperties: false, required: ['title', 'draft', 'reviewChecklist', 'publishable'], properties: { title: { type: 'string', maxLength: 160 }, draft: { type: 'string', maxLength: 8000 }, reviewChecklist: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', maxLength: 300 } }, publishable: { const: false } } },
});

const OPERATION_REGISTRY = Object.freeze({
  SUMMARIZE_OPERATIONAL_INCIDENT: { riskClass: 'LOW', capability: 'text-summary', input: commonInput, output: summaryOutput, outputJsonSchema: OUTPUT_JSON_SCHEMAS.SUMMARY, tools: ['READ_SAFE_INCIDENT'] },
  CLASSIFY_OPERATIONAL_SIGNAL: { riskClass: 'MEDIUM', capability: 'classification', input: commonInput, output: classificationOutput, outputJsonSchema: OUTPUT_JSON_SCHEMAS.CLASSIFICATION, tools: ['READ_SAFE_INCIDENT', 'READ_SUPPLY_DEMAND_SNAPSHOT'] },
  EXPLAIN_MARKET_READINESS: { riskClass: 'MEDIUM', capability: 'text-summary', input: commonInput, output: summaryOutput, outputJsonSchema: OUTPUT_JSON_SCHEMAS.SUMMARY, tools: ['READ_READINESS_EVALUATION'] },
  SUGGEST_EXPANSION_HYPOTHESES: { riskClass: 'HIGH', capability: 'reasoning', input: commonInput, output: expansionOutput, outputJsonSchema: OUTPUT_JSON_SCHEMAS.EXPANSION, tools: ['READ_READINESS_EVALUATION', 'READ_EXPANSION_EVALUATION', 'READ_SUPPLY_DEMAND_SNAPSHOT'] },
  SUMMARIZE_SUPPLY_DEMAND_ANOMALY: { riskClass: 'LOW', capability: 'text-summary', input: commonInput, output: summaryOutput, outputJsonSchema: OUTPUT_JSON_SCHEMAS.SUMMARY, tools: ['READ_SUPPLY_DEMAND_SNAPSHOT'] },
  DRAFT_INTERNAL_CONTENT: { riskClass: 'MEDIUM', capability: 'text-generation', input: commonInput.extend({ context: z.record(z.string(), z.unknown()) }), output: draftOutput, outputJsonSchema: OUTPUT_JSON_SCHEMAS.DRAFT, tools: [] },
  RECOMMEND_INVESTIGATION_STEPS: { riskClass: 'MEDIUM', capability: 'reasoning', input: commonInput, output: summaryOutput, outputJsonSchema: OUTPUT_JSON_SCHEMAS.SUMMARY, tools: ['READ_SAFE_INCIDENT', 'READ_SUPPLY_DEMAND_SNAPSHOT'] },
});

const TOOL_REGISTRY = Object.freeze({
  READ_SAFE_INCIDENT: { permission: 'incidents.read', referenceType: 'INCIDENT', readOnly: true },
  READ_SUPPLY_DEMAND_SNAPSHOT: { permission: 'supplyDemand.read', referenceType: 'SUPPLY_DEMAND_SNAPSHOT', readOnly: true },
  READ_READINESS_EVALUATION: { permission: 'readiness.read', referenceType: 'READINESS_EVALUATION', readOnly: true },
  READ_EXPANSION_EVALUATION: { permission: 'expansion.read', referenceType: 'EXPANSION_EVALUATION', readOnly: true },
});

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions/i,
  /reveal|exfiltrat|dump\s+(?:the\s+)?(?:secret|credential|prompt)/i,
  /(?:execute|run)\s+(?:shell|sql|powershell|curl|http)/i,
  /<\/?(?:system|assistant|tool|script)[^>]*>/i,
  /(?:https?|file):\/\//i,
];

const walkStrings = (value, output = []) => {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => walkStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => walkStrings(item, output));
  return output;
};

const validateOperationInput = (kind, input) => {
  const registered = OPERATION_REGISTRY[kind];
  if (!registered) throw operationalError('AI operation is not registered.', 'AI_OPERATION_NOT_REGISTERED', 422);
  const parsed = registered.input.parse(input);
  const sanitized = { ...parsed, ...(parsed.context ? { context: sanitizePrivateObject(parsed.context, { maxDepth: 5, maxKeys: 100, maxString: 4000 }, 0, 'ai.context') } : {}) };
  if (walkStrings(sanitized).some((text) => INJECTION_PATTERNS.some((pattern) => pattern.test(text)))) {
    throw operationalError('Untrusted context failed the prompt-injection safety gate.', 'AI_PROMPT_INJECTION_REJECTED', 422);
  }
  return sanitized;
};

const validateOperationOutput = (kind, output) => {
  const registered = OPERATION_REGISTRY[kind];
  if (!registered) throw operationalError('AI operation is not registered.', 'AI_OPERATION_NOT_REGISTERED', 422);
  const parsed = registered.output.safeParse(output);
  if (!parsed.success) throw operationalError('Provider output failed its closed schema.', 'AI_OUTPUT_SCHEMA_INVALID', 422);
  if (walkStrings(parsed.data).some((text) => /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.+|(?:https?|file):\/\/|\b(?:sk|rk|whsec)_[A-Za-z0-9]/i.test(text))) {
    throw operationalError('Provider output failed the safety policy.', 'AI_OUTPUT_SAFETY_REJECTED', 422);
  }
  return parsed.data;
};

const validateTools = (kind, requested = []) => {
  const operation = OPERATION_REGISTRY[kind];
  const unique = [...new Set(requested)];
  if (unique.some((key) => !operation?.tools.includes(key) || !TOOL_REGISTRY[key]?.readOnly)) throw operationalError('AI tool is not allowlisted for this operation.', 'AI_TOOL_NOT_ALLOWED', 422);
  return unique;
};

module.exports = { INJECTION_PATTERNS, OPERATION_REGISTRY, OUTPUT_JSON_SCHEMAS, TOOL_REGISTRY, validateOperationInput, validateOperationOutput, validateTools, walkStrings };
