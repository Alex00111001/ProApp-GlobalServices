const { z } = require('zod');
const { declareInputContract, inspectInputSemantics } = require('./input-contract');

// A single definition owns both the unchanged runtime trim/bounds and its wire grammar.
// Zod 4 string bounds and JSON Schema count Unicode code points (not UTF-16 units).
function trimmedString(minimum, maximum) {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 1 || maximum < minimum) {
    throw new TypeError('Trimmed text requires positive, ordered length bounds.');
  }
  const alternatives = [];
  if (minimum === 1) alternatives.push('\\S');
  if (maximum >= 2) alternatives.push(`\\S[\\s\\S]{${Math.max(0, minimum - 2)},${maximum - 2}}\\S`);
  const wire = z.string().regex(new RegExp(`^\\s*(?:${alternatives.join('|')})\\s*$`, 'u'));
  const runtime = z.string().trim().min(minimum).max(maximum);
  Object.defineProperty(runtime, 'homeservicesNormalization', { value: Object.freeze({
    kind: 'TRIM_BOUNDED_TEXT', minimum, maximum, wire,
  }) });
  return runtime;
}

// Explicitly selected object authorities only. Unsupported semantics fail closed.
function declareTrimmedInput(runtime, evidenceId) {
  const fields = [];
  const acceptedWire = (schema, location) => {
    const primitive = schema.homeservicesNormalization;
    if (primitive) {
      fields.push({ field: location, kind: primitive.kind, minimum: primitive.minimum, maximum: primitive.maximum });
      return primitive.wire;
    }
    const def = schema._zod.def;
    if (def.type === 'optional') return acceptedWire(def.innerType, location).optional();
    if (def.type === 'nullable') return acceptedWire(def.innerType, location).nullable();
    if (def.type === 'object') {
      if (def.checks?.length) throw new Error('Object refinements require separate authority.');
      const shape = Object.fromEntries(Object.entries(def.shape).map(([key, value]) => [key, acceptedWire(value, location ? `${location}.${key}` : key)]));
      const object = z.object(shape);
      if (def.catchall?._zod.def.type === 'never') return object.strict();
      if (!def.catchall || ['unknown', 'any'].includes(def.catchall._zod.def.type)) return object.passthrough();
      throw new Error('Validated catchall requires separate review.');
    }
    if (inspectInputSemantics(schema).classes.length) throw new Error('Unreviewed normalization cannot enter a trim authority.');
    return schema;
  };
  const wire = acceptedWire(runtime, '');
  if (!fields.length) throw new Error('Trim authority requires an actual runtime primitive.');
  Object.defineProperty(runtime, 'homeservicesNormalizationFields', { value: Object.freeze(fields) });
  return declareInputContract(runtime, {
    schema: wire, classification: 'NORMALIZATION', parityMode: 'ACCEPTANCE_EQUIVALENT', evidenceId,
    evidence: ['backend/test/shared-normalization.test.js'],
    semantics: fields.map((f) => `${f.field}: ECMAScript trim, then ${f.minimum}..${f.maximum} Unicode code points; no case/coercion/truncation change`),
  });
}
module.exports = { trimmedString, declareTrimmedInput };
