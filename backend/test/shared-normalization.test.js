const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyRequestCases } = require('../scripts/api-contract/request-parity');
const { userStatusSchema } = require('../src/validators/admin.validators');

test('T01: padded maximum-length reason is accepted on wire and trimmed at runtime', () => {
  assert.equal(verifyRequestCases({ schema: userStatusSchema, cases: [
    { name: 'canonical', value: { isActive: false, reason: 'reviewed reason' }, accepted: true, expected: { isActive: false, reason: 'reviewed reason' } },
    { name: 'padded maximum', value: { isActive: false, reason: `  ${'x'.repeat(500)}  ` }, accepted: true, expected: { isActive: false, reason: 'x'.repeat(500) } },
    { name: 'empty normalized', value: { isActive: false, reason: ' '.repeat(10) }, accepted: false },
  ] }).status, 'PASS');
});

const { z } = require('zod');
const { trimmedString, declareTrimmedInput } = require('../src/shared/http/input-normalization');
const { FIXTURES, normalizationCases, whitespace } = require('./helpers/normalization-cases');
const { projectSchema } = require('../scripts/api-contract/schema-catalog');
const { verifyOpenApiBinding } = require('../scripts/api-contract/request-parity');
const { buildInventory } = require('../scripts/api-contract/inventory-command');
const { buildOpenApi } = require('../scripts/api-contract/openapi-command');
const { resolveRuntimeSchema } = require('../scripts/api-contract/schema-catalog');
const { schemaChanges } = require('../scripts/api-contract/breaking-changes');

for (const [file, fixtures] of Object.entries(FIXTURES)) for (const name of Object.keys(fixtures)) {
  test(`T01 authority ${file} ${name}: wire/runtime acceptance, canonical output and privilege boundaries`, () => {
    const schema = require(`../src/validators/${file}`)[name];
    const cases = normalizationCases(schema, schema.homeservicesWireContract.evidenceId);
    assert.equal(verifyRequestCases({ schema, cases }).status, 'PASS');
    assert.deepEqual(projectSchema(schema).semanticClasses, ['NORMALIZATION']);
  });
}

test('T01 primitive preserves original parser values and issues across Unicode and generated boundaries', () => {
  for (const [min, max] of [[1, 5000], [8, 500], [10, 500], [10, 2000], [12, 1000], [40, 2000]]) {
    const original = z.string().trim().min(min).max(max); const runtime = trimmedString(min, max);
    const wrapped = declareTrimmedInput(z.object({ value: runtime }).strict(), 'test');
    const samples = [null, 0, false, {}, [], undefined, '', ...whitespace, '\ud800', '\udfff'];
    for (const n of [min - 1, min, max, max + 1]) for (const atom of ['a', '🙂', 'e\u0301', '\u0000', '\n', '\u200b']) samples.push(`\u00a0${atom.repeat(n)}\ufeff`);
    let seed = 1907; const alphabet = ['A', 'b', ' ', '\t', '\n', '🙂', '\ud800', 'é', '\u200b', '\ufeff'];
    for (let i = 0; i < 180; i++) { let value = ''; for (let j = 0; j < (i % 53); j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; value += alphabet[seed % alphabet.length]; } samples.push(value); }
    const cases = samples.map((value, i) => {
      const before = original.safeParse(value); const after = runtime.safeParse(value);
      assert.equal(after.success, before.success);
      if (before.success) assert.deepEqual(after.data, before.data); else assert.deepEqual(after.error.issues, before.error.issues);
      return { name: `generated ${i}`, value: { value }, accepted: before.success, ...(before.success ? { expected: { value: before.data } } : {}) };
    });
    assert.equal(verifyRequestCases({ schema: wrapped, cases }).status, 'PASS');
  }
});

test('T01 composition refuses unrelated coercion, transformations, refinements and default semantics', () => {
  for (const field of [z.coerce.number(), z.coerce.boolean(), z.string().toLowerCase(), z.string().transform((v) => Number(v)), z.string().refine(Boolean), z.string().default('x')]) {
    assert.throws(() => declareTrimmedInput(z.object({ reason: trimmedString(1, 10), other: field }), 'test'));
  }
  assert.throws(() => declareTrimmedInput(z.object({ reason: trimmedString(1, 10) }).refine(Boolean), 'test'));
});

test('T01 mounted bindings retain normalization classification and generated OpenAPI/unknown-field parity', () => {
  const document = buildInventory(); const api = buildOpenApi(document); let count = 0;
  for (const route of document.routes) for (const validation of route.validation) {
    const entry = document.schemas[`${route.handler.file}#${validation.schema}`];
    if (!entry?.evidenceId?.startsWith('trim.')) continue;
    const schema = resolveRuntimeSchema(route, validation);
    verifyOpenApiBinding({ document, route, validation, schema, openapi: api });
    assert.equal(entry.semanticEvidence.inputSurfaceResolved, true);
    assert.deepEqual(entry.semanticClasses, ['NORMALIZATION']); count++;
  }
  assert.equal(count, 34);
  assert.equal(api['x-homeservices-contract-status'], 'CANDIDATE_NOT_PUBLISHED');
});

test('T01 narrowing, removed fields/aliases, boolean coercion and unknown-field changes fail compatibility checks', () => {
  const before = { type: 'object', properties: { reason: { type: 'string', pattern: '^old$' }, alias: { type: 'string' }, enabled: { type: 'boolean' }, status: { enum: ['A', 'B'] }, count: { type: 'number', minimum: 1, maximum: 10 } }, required: ['reason'] };
  const mutations = [s => s.required.push('enabled'), s => s.properties.enabled.type = 'string', s => s.properties.status.enum.pop(), s => s.properties.count.maximum = 9, s => s.properties.count.minimum = 2, s => delete s.properties.alias, s => s.additionalProperties = false, s => s.properties.reason.pattern = '^narrow$'];
  for (const mutate of mutations) { const after = structuredClone(before); mutate(after); const changes = []; schemaChanges(before, after, 'request', 'command', changes); assert.ok(changes.length); }
  const schema = require('../src/validators/admin.validators').userStatusSchema;
  const wire = structuredClone(projectSchema(schema).jsonSchema); wire.properties.reason = { type: 'string', maxLength: 500 };
  assert.throws(() => verifyRequestCases({ schema, projectedSchema: wire, cases: normalizationCases(schema, schema.homeservicesWireContract.evidenceId) }), /OpenAPI narrowed|acceptance mismatch/);
});
