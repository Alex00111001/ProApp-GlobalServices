const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { z } = require('zod');
const { ROOT, readSource, walk, member } = require('./source-inventory');

// Schemas may contain custom predicates/normalizers. JSON Schema cannot silently erase them.
function projectSchema(schema) {
  const gaps = new Set();
  const seen = new WeakSet();
  const inspect = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const def = value._zod?.def;
    if (def?.type === 'transform') gaps.add('TRANSFORM_REQUIRES_WIRE_CONTRACT');
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
  try { jsonSchema = z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' }); }
  catch { gaps.add('ZOD_TYPE_NOT_REPRESENTABLE'); }
  return { jsonSchema, wireParity: gaps.size ? 'UNPROVEN' : 'STRUCTURAL', gaps: [...gaps].sort() };
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
      entries[key] = projectSchema(schema);
    } catch {
      entries[key] = { jsonSchema: null, wireParity: 'UNPROVEN', gaps: ['SCHEMA_BINDING_REQUIRES_REVIEW'] };
    }
  }
  // Read every exported runtime validator, including schemas reached in application services.
  const validatorDir = path.join(ROOT, 'backend/src/validators');
  for (const filename of fs.readdirSync(validatorDir).filter((f) => f.endsWith('.js')).sort()) {
    for (const [name, schema] of Object.entries(require(path.join(validatorDir, filename)))) {
      if (schema?._zod) entries[`backend/src/validators/${filename}#${name}`] = projectSchema(schema);
    }
  }
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

module.exports = { projectSchema, schemaCatalog };
