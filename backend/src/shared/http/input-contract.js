// Metadata describes the wire boundary. It never replaces a runtime validator.
const INPUT_SEMANTIC_CLASSES = Object.freeze([
  'STRUCTURAL_EQUIVALENT', 'NORMALIZATION', 'TRANSFORM', 'REFINEMENT',
  'CROSS_FIELD_VALIDATION', 'RUNTIME_DERIVED', 'LEGACY_COMPATIBILITY',
]);

function inspectInputSemantics(schema) {
  const classes = new Set();
  const facts = new Set();
  const seen = new WeakSet();
  const inspect = (value, transformClass) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    transformClass = value.homeservicesInputSemantics?.transformClassification || transformClass;
    for (const name of value.homeservicesInputSemantics?.classes || []) classes.add(name);
    const def = value._zod?.def;
    if (def?.type === 'transform') classes.add(transformClass || 'TRANSFORM');
    if (def?.check === 'overwrite' || def?.coerce || ['default', 'prefault', 'catch'].includes(def?.type)) classes.add('NORMALIZATION');
    if (def?.coerce) facts.add('HTTP_COERCION_REQUIRES_WIRE_REVIEW');
    if (def?.check === 'custom' || def?.type === 'custom') {
      classes.add('REFINEMENT');
      // A source observation, never proof that all cross-field rules were found.
      const fields = new Set([...String(def.fn || def.check || '').matchAll(/\b(?:value|data|input)\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
      if (fields.size > 1) classes.add('CROSS_FIELD_VALIDATION');
    }
    for (const child of Object.values(def || value)) {
      if (Array.isArray(child)) child.forEach((item) => inspect(item, transformClass)); else inspect(child, transformClass);
    }
  };
  inspect(schema);
  return { classes: [...classes].sort(), facts: [...facts].sort() };
}

function declareInputContract(runtimeSchema, contract) {
  if (!runtimeSchema?._zod || !contract.schema?._zod) throw new Error('Runtime and accepted-wire schemas are required.');
  const classes = contract.classes || [contract.classification];
  if (!classes.length || classes.some((name) => !INPUT_SEMANTIC_CLASSES.includes(name))) throw new Error('Unknown input semantic class.');
  if (classes.includes('STRUCTURAL_EQUIVALENT') && classes.length !== 1) throw new Error('Equivalence cannot erase runtime semantics.');
  if (!contract.semantics?.length || !contract.evidence?.length) throw new Error('Input semantics and executable evidence references are required.');
  Object.defineProperty(runtimeSchema, 'homeservicesWireContract', { value: Object.freeze({
    ...contract, classes: Object.freeze([...classes]), semantics: Object.freeze([...contract.semantics]), evidence: Object.freeze([...contract.evidence]),
  }) });
  return runtimeSchema;
}

function annotateInputSemantics(runtimeSchema, { classes, evidence, semantics, transformClassification, fieldRules }) {
  if (!runtimeSchema?._zod || !classes?.length || classes.some((name) => !INPUT_SEMANTIC_CLASSES.includes(name))
    || !evidence?.length || !semantics?.length) throw new Error('Explicit semantic annotation requires valid classes and evidence.');
  if (transformClassification && (!['NORMALIZATION', 'TRANSFORM'].includes(transformClassification) || !classes.includes(transformClassification))) throw new Error('Transform annotation must retain its declared semantic class.');
  Object.defineProperty(runtimeSchema, 'homeservicesInputSemantics', { value: Object.freeze({ transformClassification, fieldRules,
    classes: Object.freeze([...classes]), evidence: Object.freeze([...evidence]), semantics: Object.freeze([...semantics]) }) });
  return runtimeSchema;
}

function unknownFieldPolicies(schema) {
  const policies = [];
  const seen = new WeakSet();
  const inspect = (value, location) => {
    if (!value?._zod || seen.has(value)) return;
    seen.add(value);
    const def = value._zod.def;
    if (def.type === 'object') {
      policies.push({ path: location, policy: !def.catchall ? 'STRIP' : def.catchall._zod?.def.type === 'never' ? 'REJECT'
        : ['unknown', 'any'].includes(def.catchall._zod?.def.type) ? 'PASSTHROUGH' : 'VALIDATED_CATCHALL' });
      for (const [key, child] of Object.entries(def.shape || {})) inspect(child, `${location}.${key}`);
    }
    if (def.innerType) inspect(def.innerType, location);
    if (def.in) inspect(def.in, location);
    if (def.element) inspect(def.element, `${location}[]`);
    for (const child of def.options || []) inspect(child, location);
  };
  inspect(schema, '$');
  return policies;
}

function trimmedAsciiIdentifier({ prefix, maximumLength }) {
  if (typeof prefix !== 'string' || !/^[A-Za-z0-9_]+$/.test(prefix)
    || !Number.isSafeInteger(maximumLength) || maximumLength <= prefix.length) throw new Error('Invalid closed ASCII identifier definition.');
  const { z } = require('zod');
  return z.string().regex(new RegExp(`^\\s*${prefix}[A-Za-z0-9]{1,${maximumLength - prefix.length}}\\s*$`));
}

module.exports = { INPUT_SEMANTIC_CLASSES, annotateInputSemantics, declareInputContract, inspectInputSemantics, unknownFieldPolicies, trimmedAsciiIdentifier };
