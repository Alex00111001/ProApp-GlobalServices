const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { ROOT } = require('./source-inventory');
const { projectSchema } = require('./schema-catalog');

function verifyRequestCases({ schema, cases, projectedSchema, mode, parseWire }) {
  const contract = schema.homeservicesWireContract;
  const projection = projectSchema(schema);
  const parityMode = mode || contract?.parityMode || 'ACCEPTANCE_EQUIVALENT';
  if (!['ACCEPTANCE_EQUIVALENT', 'STRUCTURAL_WITH_RUNTIME_REFINEMENT'].includes(parityMode)) throw new Error('Unknown parity mode.');
  if (!cases.some((c) => c.accepted) || !cases.some((c) => !c.accepted)) throw new Error('Positive and negative wire evidence is required.');
  const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
  const validate = ajv.compile(projectedSchema || projection.jsonSchema);
  const parse = parseWire || contract?.parseWire || ((value) => schema.parse(value));
  let refinementWitnesses = 0;
  for (const example of cases) {
    const wireAccepted = example.value === undefined ? !(contract?.bodyRequired ?? true) : Boolean(validate(example.value));
    let result; let runtimeAccepted = true;
    try { result = parse(example.value); } catch { runtimeAccepted = false; }
    assert.equal(runtimeAccepted, example.accepted, `${example.name}: unexpected runtime acceptance`);
    if (runtimeAccepted) assert.equal(wireAccepted, true, `${example.name}: OpenAPI narrowed accepted wire values`);
    if (parityMode === 'ACCEPTANCE_EQUIVALENT') assert.equal(wireAccepted, runtimeAccepted, `${example.name}: wire/runtime acceptance mismatch`);
    else if (wireAccepted && !runtimeAccepted) {
      assert.ok(example.refinement, `${example.name}: unexplained runtime-only rejection`);
      refinementWitnesses++;
    }
    if (runtimeAccepted && Object.hasOwn(example, 'expected')) assert.deepEqual(result, example.expected, `${example.name}: normalization/transform mismatch`);
  }
  if (parityMode === 'STRUCTURAL_WITH_RUNTIME_REFINEMENT') assert.ok(refinementWitnesses > 0, 'Runtime-refined projections need an executed refinement witness.');
  return { status: 'PASS', parityMode, cases: cases.length, refinementWitnesses };
}

function verifyEvidenceReferences(projection) {
  for (const file of projection.evidence || []) {
    if (!/^backend\/test\/[A-Za-z0-9_./-]+\.test\.js$/.test(file) || file.includes('..')) throw new Error('Invalid input evidence reference.');
    if (!fs.existsSync(path.join(ROOT, file))) throw new Error(`Missing input evidence: ${file}`);
  }
  if (projection.classification && !projection.evidence?.length) throw new Error('Declared input semantics have no executable evidence references.');
}

function verifyOpenApiBinding({ document, route, validation, schema, openapi }) {
  const entry = document.schemas[`${route.handler.file}#${validation.schema}`];
  verifyEvidenceReferences(entry);
  if (entry.runtimeExpression && entry.runtimeExpression !== validation.input) throw new Error('Declared wire adapter differs from mounted runtime input.');
  const operation = openapi.paths[route.path]?.[route.method.toLowerCase()];
  const bindingMetadata = operation?.['x-homeservices-input-bindings']?.find((binding) => binding.input === validation.input);
  assert.ok(bindingMetadata, 'OpenAPI input binding metadata is missing.');
  assert.deepEqual(bindingMetadata.unknownFieldPolicies, projectSchema(schema).unknownFieldPolicies, 'Unknown-field behavior metadata drift.');
  let projected;
  if (validation.input.includes('req.body')) projected = Object.values(operation?.requestBody?.content || {})[0]?.schema;
  else if (/req\.params\./.test(validation.input)) projected = operation?.parameters.find((p) => p.in === 'path' && p.name === validation.input.split('.').at(-1))?.schema;
  else {
    const kind = validation.input.includes('req.query') ? 'query' : 'path';
    const object = projectSchema(schema).jsonSchema;
    assert.deepEqual(operation.parameters.filter((p) => p.in === kind).map((p) => p.name).sort(), Object.keys(object?.properties || {}).sort(), `${kind} parameter set mismatch`);
    for (const [name, property] of Object.entries(object?.properties || {})) {
      const parameter = operation?.parameters.find((p) => p.in === kind && p.name === name);
      assert.ok(parameter, `Missing ${kind} parameter ${name}`);
      assert.deepEqual(parameter.schema, property, `${kind} wire type/enum/bounds mismatch: ${name}`);
      assert.equal(parameter.required, kind === 'path' || (object.required || []).includes(name), `${kind} requiredness mismatch`);
    }
    return;
  }
  assert.ok(projected, 'Mounted input has no OpenAPI projection.');
  const copy = structuredClone(projected);
  for (const key of Object.keys(copy).filter((key) => key.startsWith('x-homeservices-'))) delete copy[key];
  const expected = structuredClone(projectSchema(schema).jsonSchema); delete expected.$schema;
  assert.deepEqual(copy, expected, 'Runtime/wire/OpenAPI schema drift (required, nullable, enum, bounds, arrays or unknown fields).');
  if (validation.input.includes('req.body')) assert.equal(operation.requestBody.required, entry.bodyRequired ?? !expected.default, 'Body requiredness mismatch.');
}

function verifyHeaderBinding(operation, header) {
  const parameter = operation.parameters?.find((p) => p.in === 'header' && p.name.toLowerCase() === header.name.toLowerCase());
  assert.ok(parameter, 'Required runtime header has no OpenAPI projection.');
  assert.equal(parameter.required, header.required, 'Header requirement mismatch.');
  const expected = structuredClone(projectSchema(header.schema).jsonSchema); delete expected.$schema;
  assert.deepEqual(parameter.schema, expected, 'Header wire grammar/type/bounds mismatch.');
}

module.exports = { verifyRequestCases, verifyEvidenceReferences, verifyOpenApiBinding, verifyHeaderBinding };
