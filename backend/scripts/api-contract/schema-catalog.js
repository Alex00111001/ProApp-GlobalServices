const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { z } = require('zod');
const { ROOT, readSource, walk, member } = require('./source-inventory');
const { inspectInputSemantics, unknownFieldPolicies } = require('../../src/shared/http/input-contract');
const { createHash } = require('node:crypto');
const { projectFieldRules } = require('../../src/shared/http/field-rules');

function validationDigest(schema) {
  const seen = new WeakSet();
  const describe = (value) => {
    if (typeof value === 'function') return value.toString().replace(/\r\n/g, '\n');
    if (value instanceof RegExp) return value.toString();
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[recursive]';
    seen.add(value);
    if (value._zod) return describe(value._zod.def);
    if (Array.isArray(value)) return value.map(describe);
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, describe(value[key])]));
  };
  return createHash('sha256').update(JSON.stringify(describe(schema))).digest('hex');
}
function catalogProjection(schema) {
  const wire = projectSchema(schema);
  const contract = schema.homeservicesWireContract;
  // Preserve the previous validation projection independently from newly declared wire authority.
  const validation = contract || schema.homeservicesInputSemantics?.fieldRules
    ? projectSchema(contract?.compatibilitySchema || schema, 'input', true) : wire;
  const jsonSchema = validation.jsonSchema && structuredClone(validation.jsonSchema);
  if (contract?.compatibilitySchema && jsonSchema) {
    delete jsonSchema.default;
    if (jsonSchema.additionalProperties && Object.keys(jsonSchema.additionalProperties).length === 0) delete jsonSchema.additionalProperties;
  }
  return { ...wire, jsonSchema, ...(contract || schema.homeservicesInputSemantics?.fieldRules ? { wireJsonSchema: wire.jsonSchema } : {}), runtimeValidationDigest: validationDigest(schema) };
}

// Schemas may contain custom predicates/normalizers. JSON Schema cannot silently erase them.
function projectSchema(schema, io = 'input', runtimeOnly = false) {
  const semantic = inspectInputSemantics(schema);
  if (io === 'input' && !runtimeOnly && schema?.homeservicesWireContract) {
    const contract = schema.homeservicesWireContract;
    const projection = projectSchema(contract.schema, 'input');
    if (projection.wireParity !== 'STRUCTURAL') throw new Error('Explicit wire schema must be structurally projectable.');
    // JSON Schema's default is only an annotation, not runtime normalization.
    // An empty additionalProperties schema is equivalent to its omitted form.
    const jsonSchema = structuredClone(projection.jsonSchema);
    delete jsonSchema.default;
    if (jsonSchema.additionalProperties && Object.keys(jsonSchema.additionalProperties).length === 0) delete jsonSchema.additionalProperties;
    return {
      ...projection, jsonSchema, bodyRequired: contract.bodyRequired ?? true, wireParity: contract.classification, classification: contract.classification,
      gaps: [`${contract.classification}_REQUIRES_SEMANTIC_EVIDENCE`], normalization: [...contract.semantics],
      semanticClasses: contract.classes || [contract.classification], semanticReviewRequired: true,
      evidence: contract.evidence || [], projectionKind: contract.projectionKind || 'ACCEPTED_WIRE',
      parityMode: contract.parityMode || 'NOT_DECLARED', evidenceId: contract.evidenceId || null,
      runtimeExpression: contract.runtimeExpression || null,
      unknownFieldPolicies: unknownFieldPolicies(schema),
    };
  }
  const gaps = new Set();
  const seen = new WeakSet();
  const inspect = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const def = value._zod?.def;
    if (def?.type === 'transform' && io === 'input') gaps.add('TRANSFORM_REQUIRES_WIRE_CONTRACT');
    if (def?.check === 'custom' || def?.type === 'custom') gaps.add('CUSTOM_REFINEMENT_REQUIRES_WIRE_CONTRACT');
    if (def?.check === 'overwrite') gaps.add('NORMALIZATION_REQUIRES_WIRE_CONTRACT');
    // Coercion is an HTTP parser concern. A query parameter is serialized as a string,
    // then its typed bounds apply. Keep the fact visible in the catalog.
    for (const child of Object.values(def || value)) {
      if (Array.isArray(child)) child.forEach(inspect);
      else inspect(child);
    }
  };
  inspect(schema);
  let jsonSchema = null;
  try { jsonSchema = z.toJSONSchema(schema, { io, target: 'draft-2020-12' }); }
  catch { gaps.add('ZOD_TYPE_NOT_REPRESENTABLE'); }
  if (jsonSchema && io === 'input' && !runtimeOnly && schema.homeservicesInputSemantics?.fieldRules) {
    jsonSchema.allOf = projectFieldRules(schema.homeservicesInputSemantics.fieldRules);
  }
  return { jsonSchema, wireParity: gaps.size ? 'UNPROVEN' : 'STRUCTURAL', gaps: [...gaps].sort(),
    ...(io === 'input' ? { semanticClasses: semantic.classes.length ? semantic.classes : ['STRUCTURAL_EQUIVALENT'],
      semanticReviewRequired: semantic.classes.length > 0, semanticFacts: semantic.facts,
      unknownFieldPolicies: unknownFieldPolicies(schema) } : {}) };
}

function schemaEnvironment(file) {
  const context = readSource(file);
  const sandbox = { z };
  for (const [name, imported] of context.imports) {
    let module;
    if (imported.target === 'zod') module = { z };
    else if (/^\.\.\/validators\/[^/]+$/.test(imported.target)) module = require(path.resolve(path.dirname(file), imported.target));
    else continue; // Never import controllers, database clients, secrets or provider adapters.
    sandbox[name] = imported.exportName ? module[imported.exportName] : module;
  }
  const environment = vm.createContext(sandbox);
  for (const statement of context.ast.program.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== 'Identifier' || !declaration.init || sandbox[declaration.id.name]) continue;
      // Evaluate only schema constructors and pure schema helpers. Unknown dependencies are gaps.
      const source = context.text(declaration.init);
      let schemaRelated = false;
      walk(declaration.init, (node) => { if (member(node).startsWith('z.')) schemaRelated = true; });
      if (!schemaRelated || /\b(?:process|prisma|fetch|require|env)\b/.test(source)) continue;
      try { sandbox[declaration.id.name] = vm.runInContext(`(${source})`, environment, { timeout: 1000 }); } catch { /* recorded at use */ }
    }
  }
  return { context, environment };
}

function validationSourceDigest(file, expression) {
  let context = readSource(file);
  const root = expression.match(/^[A-Za-z0-9_]+/)?.[0];
  const imported = context.imports.get(root);
  let name = root;
  if (imported?.target.startsWith('.')) {
    context = readSource(require.resolve(path.resolve(path.dirname(file), imported.target)));
    name = imported.exportName || expression.match(/^[^.]+\.([A-Za-z0-9_]+)/)?.[1];
  }
  const sources = new Map();
  const collect = (id) => {
    if (sources.has(id) || !context.definitions.has(id)) return;
    const node = context.definitions.get(id);
    sources.set(id, context.text(node).replace(/\r\n/g, '\n'));
    walk(node, (child) => { if (child.type === 'Identifier' && child.name !== id) collect(child.name); });
  };
  collect(name);
  return createHash('sha256').update(JSON.stringify({ expression: expression.replace(/\r\n/g, '\n'),
    definitions: [...sources.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')) })).digest('hex');
}

function schemaCatalog(routes) {
  const environments = new Map();
  const entries = {};
  for (const route of routes) for (const validation of route.validation) {
    const key = `${route.handler.file}#${validation.schema}`;
    if (entries[key]) continue;
    const file = path.join(ROOT, route.handler.file);
    if (!environments.has(file)) environments.set(file, schemaEnvironment(file));
    try {
      const schema = vm.runInContext(`(${validation.schema})`, environments.get(file).environment, { timeout: 1000 });
      if (!schema?._zod) throw new Error('Not a Zod schema');
      entries[key] = { ...catalogProjection(schema), runtimeSourceDigest: validationSourceDigest(file, validation.schema) };
    } catch {
      entries[key] = { jsonSchema: null, wireParity: 'UNPROVEN', gaps: ['SCHEMA_BINDING_REQUIRES_REVIEW'] };
    }
  }
  // Read every exported runtime validator, including schemas reached in application services.
  const validatorDir = path.join(ROOT, 'backend/src/validators');
  for (const filename of fs.readdirSync(validatorDir).filter((f) => f.endsWith('.js')).sort()) {
    for (const [name, schema] of Object.entries(require(path.join(validatorDir, filename)))) {
      if (schema?._zod) entries[`backend/src/validators/${filename}#${name}`] = catalogProjection(schema);
    }
  }
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

function resolveRuntimeSchema(route, validation) {
  const { environment } = schemaEnvironment(path.join(ROOT, route.handler.file));
  const schema = vm.runInContext(`(${validation.schema})`, environment, { timeout: 1000 });
  if (!schema?._zod) throw new Error('Mounted input binding has no runtime Zod authority.');
  return schema;
}
module.exports = { projectSchema, schemaCatalog, schemaEnvironment, validationDigest, validationSourceDigest, catalogProjection, resolveRuntimeSchema };
